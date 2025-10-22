from __future__ import annotations

import ast
import json
import logging
import re
import threading
import uuid
import keyword
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, MutableMapping, Optional, Sequence, Set, Tuple, Any

from flask import session

from . import data_import
from .salesforce import SalesforceError, describe_sobject, query_all
from .storage import DATA_DIR, OrgConfig

ACCOUNT_EXPLORER_SESSION_KEY = "account_explorer_session_id"
MAX_ACCOUNT_IDS = 200
MAX_FIELDS_PER_OBJECT = 5
CONFIG_FILE = DATA_DIR / "account_explorer_config.json"
RESULTS_DIR = DATA_DIR / "account_explorer_results"

CONNECTED_OBJECTS: List[Dict[str, str]] = [
    {"key": "BillingProfile__c", "label": "Billing Profile"},
    {"key": "Contact", "label": "Contact"},
    {"key": "Contract", "label": "Contract"},
    {"key": "AccountContactRelation", "label": "Account Contact Relation"},
    {"key": "Individual", "label": "Individual"},
    {"key": "ContactPointPhone", "label": "Contact Point Phone"},
    {"key": "ContactPointEmail", "label": "Contact Point Email"},
    {"key": "Case", "label": "Case"},
    {"key": "Order", "label": "Order"},
    {"key": "Sale__c", "label": "Sale"},
]

_CONNECTED_OBJECT_LOOKUP: Dict[str, Dict[str, str]] = {
    definition["key"]: definition for definition in CONNECTED_OBJECTS
}

_VALID_VIEW_MODES: Set[str] = {"list", "tree"}
_DEFAULT_VIEW_MODE = "list"

# Definition of the query requirements for each object.
_OBJECT_DEFINITIONS: Dict[str, Dict[str, object]] = {
    "Account": {
        "label": "Account",
        "required_fields": [],
        "filter_field": "Id",
    },
    "BillingProfile__c": {
        "label": "Billing Profile",
        "required_fields": ["Account__c"],
        "filter_field": "Account__c",
    },
    "Contact": {
        "label": "Contact",
        "required_fields": ["AccountId", "IndividualId"],
        "filter_field": "AccountId",
    },
    "Contract": {
        "label": "Contract",
        "required_fields": ["AccountId"],
        "filter_field": "AccountId",
    },
    "AccountContactRelation": {
        "label": "Account Contact Relation",
        "required_fields": ["AccountId", "ContactId"],
        "filter_field": "AccountId",
    },
    "Case": {
        "label": "Case",
        "required_fields": ["AccountId"],
        "filter_field": "AccountId",
    },
    "Order": {
        "label": "Order",
        "required_fields": ["AccountId"],
        "filter_field": "AccountId",
    },
    "Sale__c": {
        "label": "Sale",
        "required_fields": ["Account__c"],
        "filter_field": "Account__c",
    },
    "Individual": {
        "label": "Individual",
        "required_fields": [],
        "filter_field": "Id",
    },
    "ContactPointPhone": {
        "label": "Contact Point Phone",
        "required_fields": ["Contact__c"],
        "contact_field": "Contact__c",
        "individual_field": None,
    },
    "ContactPointEmail": {
        "label": "Contact Point Email",
        "required_fields": ["Contact__c"],
        "contact_field": "Contact__c",
        "individual_field": None,
    },
}

_DEFAULT_FIELDS: Dict[str, List[str]] = {
    "Account": ["Name", "Type", "Industry", "BillingCity", "BillingCountry"],
    "BillingProfile__c": ["Name", "OwnerId", "CreatedDate", "LastModifiedDate"],
    "Contact": ["FirstName", "LastName", "Email", "Phone", "Title"],
    "Contract": ["ContractNumber", "Status", "StartDate", "EndDate", "OwnerId"],
    "AccountContactRelation": ["Roles", "IsActive", "IsDirect", "StartDate", "EndDate"],
    "Case": ["CaseNumber", "Status", "Priority", "Origin", "Subject"],
    "Order": ["OrderNumber", "Status", "EffectiveDate", "TotalAmount", "OwnerId"],
    "Sale__c": [
        "Name",
        "Account__c",
        "Status__c",
        "SaleStartDate__c",
        "CreatedDate",
    ],
    "Individual": ["FirstName", "LastName", "HasOptedOutTracking", "HasOptedOutProfiling"],
    "ContactPointPhone": ["TelephoneNumber", "IsPrimary", "UsageType", "Status__c"],
    "ContactPointEmail": ["EmailAddress", "IsPrimary", "UsageType", "Status__c"],
}


_VALID_ALERT_OBJECTS: Set[str] = set(_OBJECT_DEFINITIONS.keys())


def _sanitize_identifier(name: str) -> Optional[str]:
    if not isinstance(name, str) or not name:
        return None
    sanitized = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    if not sanitized:
        return None
    if sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if keyword.iskeyword(sanitized):
        sanitized = f"{sanitized}_"
    return sanitized


@dataclass
class AlertDefinition:
    id: str
    label: str
    object_key: str
    expression: str
    description: str = ""

    def to_dict(self) -> Dict[str, str]:
        return {
            "id": self.id,
            "label": self.label,
            "object": self.object_key,
            "expression": self.expression,
            "description": self.description,
        }

    @classmethod
    def from_payload(cls, payload: Dict[str, object]) -> Optional["AlertDefinition"]:
        if not isinstance(payload, dict):
            return None
        raw_id = payload.get("id")
        alert_id = str(raw_id).strip() if isinstance(raw_id, str) and raw_id.strip() else str(uuid.uuid4())
        raw_label = payload.get("label")
        if not isinstance(raw_label, str):
            raw_label = ""
        label = raw_label.strip()
        raw_object = payload.get("object") or payload.get("objectKey")
        object_candidate = str(raw_object or "").strip()
        normalized_object = None
        if object_candidate:
            for candidate in _VALID_ALERT_OBJECTS:
                if candidate.lower() == object_candidate.lower():
                    normalized_object = candidate
                    break
        if not normalized_object:
            return None
        object_key = normalized_object
        raw_expression = payload.get("expression")
        if not isinstance(raw_expression, str):
            raw_expression = ""
        expression = raw_expression.strip()
        raw_description = payload.get("description")
        if not isinstance(raw_description, str):
            raw_description = ""
        description = raw_description.strip()
        return cls(
            id=alert_id,
            label=label,
            object_key=object_key,
            expression=expression,
            description=description,
        )


@dataclass
class ExplorerConfig:
    fields: Dict[str, List[str]] = field(default_factory=dict)
    objects: List[Dict[str, object]] = field(default_factory=list)
    alerts: List[AlertDefinition] = field(default_factory=list)
    view_mode: str = _DEFAULT_VIEW_MODE
    updated_at: Optional[str] = None

    def get_fields(self, object_key: str) -> List[str]:
        values = self.fields.get(object_key) or _DEFAULT_FIELDS.get(object_key, [])
        sanitized: List[str] = []
        for value in values:
            name = (value or "").strip()
            if not name or name.lower() == "id":
                continue
            if name not in sanitized:
                sanitized.append(name)
            if len(sanitized) >= MAX_FIELDS_PER_OBJECT:
                break
        return sanitized

    def to_dict(self) -> Dict[str, object]:
        return {
            "fields": {key: list(value) for key, value in self.fields.items()},
            "objects": [
                {"key": str(item.get("key")), "hidden": bool(item.get("hidden"))}
                for item in self.objects
                if isinstance(item, dict) and item.get("key")
            ],
            "alerts": [alert.to_dict() for alert in self.alerts],
            "viewMode": self.view_mode,
            "updatedAt": self.updated_at,
        }

    def get_objects(self) -> List[Dict[str, object]]:
        seen: Set[str] = set()
        configured: List[Dict[str, object]] = []
        for item in self.objects:
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            if not isinstance(key, str) or not key or key in seen:
                continue
            base = _CONNECTED_OBJECT_LOOKUP.get(key)
            if not base:
                continue
            configured.append({**base, "hidden": bool(item.get("hidden"))})
            seen.add(key)
        for definition in CONNECTED_OBJECTS:
            key = definition["key"]
            if key in seen:
                continue
            configured.append({**definition, "hidden": False})
        return configured

    def get_alerts(self) -> List[AlertDefinition]:
        return list(self.alerts)


@dataclass
class ExplorerResult:
    account_ids: List[str] = field(default_factory=list)
    missing_account_ids: List[str] = field(default_factory=list)
    generated_at: Optional[str] = None
    data: Dict[str, object] = field(default_factory=dict)
    file_path: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        return {
            "accountIds": list(self.account_ids),
            "missingAccountIds": list(self.missing_account_ids),
            "generatedAt": self.generated_at,
            "data": self.data,
            "downloadAvailable": bool(self.file_path),
        }


@dataclass
class ExplorerSession:
    id: str
    result: Optional[ExplorerResult] = None

    def serialize(self) -> Dict[str, object]:
        return {"result": self.result.to_dict() if self.result else None}


_config_lock = threading.Lock()
_sessions_lock = threading.Lock()
_sessions: Dict[str, ExplorerSession] = {}
_fields_cache_lock = threading.Lock()
_object_fields_cache: Dict[Tuple[str, str], Set[str]] = {}

logger = logging.getLogger(__name__)


_RECOVERABLE_ERROR_CODES: Set[str] = {
    "INVALID_TYPE",
    "INVALID_FIELD",
    "INVALID_FIELD_FOR_INSERT_UPDATE",
}


def _parse_salesforce_error(exc: SalesforceError) -> List[Dict[str, object]]:
    message = str(exc)
    match = re.search(r"Salesforce request failed: (.+)", message)
    if not match:
        return []
    raw = match.group(1)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _is_recoverable_salesforce_error(exc: SalesforceError) -> bool:
    for item in _parse_salesforce_error(exc):
        code = item.get("errorCode")
        if isinstance(code, str) and code in _RECOVERABLE_ERROR_CODES:
            return True
    return False


def _format_salesforce_error_message(object_key: str, exc: SalesforceError) -> str:
    label = _OBJECT_DEFINITIONS.get(object_key, {}).get("label", object_key)
    messages: List[str] = []
    for item in _parse_salesforce_error(exc):
        if not isinstance(item, dict):
            continue
        text = item.get("message")
        code = item.get("errorCode")
        if text and code:
            messages.append(f"{text} ({code})")
        elif text:
            messages.append(str(text))
        elif code:
            messages.append(str(code))
    if not messages:
        messages.append(str(exc))
    return f"{label}: {'; '.join(messages)}"


def _query_all_with_handling(
    org: OrgConfig,
    soql: str,
    object_key: str,
    warnings: MutableMapping[str, str],
    required: bool = False,
) -> Dict[str, object]:
    try:
        return query_all(org, soql)
    except SalesforceError as exc:
        if not required and _is_recoverable_salesforce_error(exc):
            if object_key not in warnings:
                warnings[object_key] = _format_salesforce_error_message(object_key, exc)
                logger.warning("Skipping %s due to Salesforce error: %s", object_key, exc)
            return {"records": []}
        raise


def _ensure_session_id() -> str:
    session_id = session.get(ACCOUNT_EXPLORER_SESSION_KEY)
    if session_id and isinstance(session_id, str):
        return session_id
    session_id = uuid.uuid4().hex
    session[ACCOUNT_EXPLORER_SESSION_KEY] = session_id
    return session_id


def get_session() -> ExplorerSession:
    session_id = _ensure_session_id()
    with _sessions_lock:
        if session_id not in _sessions:
            _sessions[session_id] = ExplorerSession(id=session_id)
        return _sessions[session_id]


def get_config() -> ExplorerConfig:
    if not CONFIG_FILE.exists():
        return ExplorerConfig(
            fields={},
            objects=[],
            alerts=[],
            view_mode=_DEFAULT_VIEW_MODE,
            updated_at=None,
        )
    with _config_lock:
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return ExplorerConfig(
                fields={},
                objects=[],
                alerts=[],
                view_mode=_DEFAULT_VIEW_MODE,
                updated_at=None,
            )
        fields = data.get("fields") if isinstance(data, dict) else {}
        if not isinstance(fields, dict):
            fields = {}
        result: Dict[str, List[str]] = {}
        for key, values in fields.items():
            if not isinstance(values, list):
                continue
            sanitized = []
            for value in values:
                if not isinstance(value, str):
                    continue
                name = value.strip()
                if not name or name.lower() == "id":
                    continue
                if name not in sanitized:
                    sanitized.append(name)
            if sanitized:
                result[key] = sanitized[:MAX_FIELDS_PER_OBJECT]
        objects_payload = data.get("objects") if isinstance(data, dict) else []
        objects: List[Dict[str, object]] = []
        if isinstance(objects_payload, list):
            for item in objects_payload:
                if not isinstance(item, dict):
                    continue
                key = item.get("key")
                if not isinstance(key, str) or not key:
                    continue
                objects.append({"key": key, "hidden": bool(item.get("hidden"))})
        view_mode_raw = data.get("viewMode") if isinstance(data, dict) else None
        view_mode = view_mode_raw if isinstance(view_mode_raw, str) else _DEFAULT_VIEW_MODE
        if view_mode not in _VALID_VIEW_MODES:
            view_mode = _DEFAULT_VIEW_MODE
        alerts_payload = data.get("alerts") if isinstance(data, dict) else []
        alerts: List[AlertDefinition] = []
        seen_alert_ids: Set[str] = set()
        if isinstance(alerts_payload, list):
            for item in alerts_payload:
                alert = AlertDefinition.from_payload(item)
                if not alert:
                    continue
                if alert.id in seen_alert_ids:
                    alert = AlertDefinition(
                        id=str(uuid.uuid4()),
                        label=alert.label,
                        object_key=alert.object_key,
                        expression=alert.expression,
                        description=alert.description,
                    )
                alerts.append(alert)
                seen_alert_ids.add(alert.id)
        updated_at = data.get("updatedAt") if isinstance(data, dict) else None
        return ExplorerConfig(
            fields=result,
            objects=objects,
            alerts=alerts,
            view_mode=view_mode,
            updated_at=updated_at,
        )


def save_config(config: ExplorerConfig) -> None:
    payload = {
        "fields": {key: list(values) for key, values in config.fields.items()},
        "objects": [
            {"key": item["key"], "hidden": bool(item.get("hidden"))}
            for item in config.objects
            if isinstance(item, dict) and item.get("key")
        ],
        "alerts": [alert.to_dict() for alert in config.alerts],
        "viewMode": config.view_mode,
        "updatedAt": config.updated_at,
    }
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _config_lock:
        CONFIG_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def update_config(payload: Dict[str, object]) -> ExplorerConfig:
    if not isinstance(payload, dict):
        payload = {}
    existing = get_config()
    sanitized_fields: Dict[str, List[str]] = dict(existing.fields)
    sanitized_objects: List[Dict[str, object]] = list(existing.objects)
    sanitized_alerts: List[AlertDefinition] = list(existing.alerts)
    view_mode = existing.view_mode if existing.view_mode in _VALID_VIEW_MODES else _DEFAULT_VIEW_MODE

    fields_payload = payload.get("fields") if "fields" in payload else None
    if isinstance(fields_payload, dict):
        sanitized_fields = {}
        for key, values in fields_payload.items():
            if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
                continue
            cleaned: List[str] = []
            for value in values:
                if not isinstance(value, str):
                    continue
                name = value.strip()
                if not name or name.lower() == "id":
                    continue
                if name not in cleaned:
                    cleaned.append(name)
                if len(cleaned) >= MAX_FIELDS_PER_OBJECT:
                    break
            if cleaned:
                sanitized_fields[key] = cleaned

    objects_payload = payload.get("objects") if "objects" in payload else None
    if isinstance(objects_payload, Sequence) and not isinstance(objects_payload, (str, bytes)):
        objects: List[Dict[str, object]] = []
        seen: Set[str] = set()
        for item in objects_payload:
            if not isinstance(item, dict):
                continue
            key = item.get("key")
            if not isinstance(key, str) or not key or key in seen:
                continue
            if key not in _CONNECTED_OBJECT_LOOKUP:
                continue
            objects.append({"key": key, "hidden": bool(item.get("hidden"))})
            seen.add(key)
        sanitized_objects = objects

    alerts_payload = payload.get("alerts") if "alerts" in payload else None
    if isinstance(alerts_payload, Sequence) and not isinstance(alerts_payload, (str, bytes)):
        alerts: List[AlertDefinition] = []
        seen_ids: Set[str] = set()
        for item in alerts_payload:
            alert = AlertDefinition.from_payload(item)
            if not alert:
                continue
            if alert.id in seen_ids:
                alert = AlertDefinition(
                    id=str(uuid.uuid4()),
                    label=alert.label,
                    object_key=alert.object_key,
                    expression=alert.expression,
                    description=alert.description,
                )
            alerts.append(alert)
            seen_ids.add(alert.id)
        sanitized_alerts = alerts

    if "viewMode" in payload:
        raw_view_mode = payload.get("viewMode")
        if isinstance(raw_view_mode, str) and raw_view_mode in _VALID_VIEW_MODES:
            view_mode = raw_view_mode
        else:
            view_mode = _DEFAULT_VIEW_MODE

    timestamp = datetime.now(timezone.utc).isoformat()
    config = ExplorerConfig(
        fields=sanitized_fields,
        objects=sanitized_objects,
        alerts=sanitized_alerts,
        view_mode=view_mode,
        updated_at=timestamp,
    )
    save_config(config)
    return config


def list_objects() -> List[Dict[str, str]]:
    return [{"key": key, "label": definition.get("label", key)} for key, definition in _OBJECT_DEFINITIONS.items()]


def get_object_definition(object_key: str) -> Optional[Dict[str, object]]:
    return _OBJECT_DEFINITIONS.get(object_key)


def get_object_fields_config() -> Dict[str, List[str]]:
    config = get_config()
    payload: Dict[str, List[str]] = {}
    for key in _OBJECT_DEFINITIONS.keys():
        payload[key] = config.get_fields(key)
    return payload


def parse_account_ids_from_text(raw: str) -> List[str]:
    if not raw:
        return []
    tokens = re.split(r"[\s,;]+", raw)
    return _sanitize_account_ids(tokens)


def parse_account_ids_from_file(filename: str, file_bytes: bytes) -> List[str]:
    dataset = data_import.parse_tabular_file(filename, file_bytes)
    return _sanitize_account_ids(dataset.records.keys())


def _sanitize_account_ids(values: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for value in values:
        if not value:
            continue
        candidate = str(value).strip()
        if not candidate:
            continue
        if not re.fullmatch(r"[a-zA-Z0-9]{15,18}", candidate):
            continue
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
        if len(ordered) >= MAX_ACCOUNT_IDS:
            break
    return ordered


def _chunk(values: Sequence[str], size: int = 100) -> Iterable[Sequence[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _format_ids_for_soql(ids: Sequence[str]) -> str:
    escaped = [f"'{value}'" for value in ids]
    return ", ".join(escaped)


def _get_object_field_names(org: OrgConfig, object_key: str) -> Set[str]:
    cache_key = (getattr(org, "id", "") or "", object_key)
    with _fields_cache_lock:
        cached = _object_fields_cache.get(cache_key)
        if cached is not None:
            return cached
    fields = describe_sobject(org, object_key)
    names: Set[str] = set()
    for field in fields:
        if isinstance(field, dict):
            name = field.get("name")
            if isinstance(name, str) and name:
                names.add(name)
    with _fields_cache_lock:
        _object_fields_cache[cache_key] = names
    return names


def _build_query_fields(org: OrgConfig, object_key: str, config: ExplorerConfig) -> Tuple[List[str], List[str]]:
    definition = _OBJECT_DEFINITIONS.get(object_key, {})
    required = [field for field in definition.get("required_fields", []) if isinstance(field, str)]
    for extra_field in (
        definition.get("contact_field"),
        definition.get("individual_field"),
    ):
        if isinstance(extra_field, str) and extra_field and extra_field not in required:
            required.append(extra_field)
    display_fields = config.get_fields(object_key)
    try:
        available_fields = _get_object_field_names(org, object_key)
    except SalesforceError as exc:
        logger.warning("Unable to describe %s: %s", object_key, exc)
        available_fields = set(["Id", *required, *display_fields])
    query_fields: List[str] = ["Id"]
    sanitized_display: List[str] = []
    for field in required:
        if field in available_fields and field not in query_fields:
            query_fields.append(field)
    for field in display_fields:
        if field in available_fields:
            if field not in query_fields:
                query_fields.append(field)
            if field not in sanitized_display:
                sanitized_display.append(field)
    return query_fields, ["Id"] + sanitized_display


def _record_to_field_list(
    fields: Sequence[str],
    record: Dict[str, object],
    *,
    extra_fields: Optional[Sequence[str]] = None,
) -> List[Dict[str, object]]:
    payload: List[Dict[str, object]] = []
    record = record or {}
    base_fields: List[str] = [field for field in fields]
    hidden_fields: Set[str] = set()
    if extra_fields:
        for field in extra_fields:
            if not isinstance(field, str) or not field:
                continue
            if field not in base_fields:
                base_fields.append(field)
                hidden_fields.add(field)
    for field in base_fields:
        entry: Dict[str, object] = {"name": field, "value": record.get(field)}
        if field in hidden_fields:
            entry["hidden"] = True
        payload.append(entry)
    return payload


def _get_object_link_fields(object_key: str) -> List[str]:
    definition = _OBJECT_DEFINITIONS.get(object_key, {})
    link_fields: List[str] = []
    for field_name in definition.get("required_fields", []) or []:
        if isinstance(field_name, str) and field_name and field_name not in link_fields:
            link_fields.append(field_name)
    extra_candidates = [
        definition.get("filter_field"),
        definition.get("contact_field"),
        definition.get("individual_field"),
    ]
    for candidate in extra_candidates:
        if isinstance(candidate, str) and candidate and candidate not in link_fields:
            link_fields.append(candidate)
    if object_key in ("ContactPointPhone", "ContactPointEmail"):
        for candidate in ("ContactId", "Contact__c", "ParentId", "IndividualId", "Individual__c"):
            if candidate not in link_fields:
                link_fields.append(candidate)
    if object_key == "AccountContactRelation":
        for candidate in ("AccountId", "ContactId"):
            if candidate not in link_fields:
                link_fields.append(candidate)
    return link_fields


def _filter_records_by_field(records: Sequence[Dict[str, object]], field_name: str, target_value: str) -> List[Dict[str, object]]:
    filtered = []
    for record in records:
        if str(record.get(field_name, "")) == target_value:
            filtered.append(record)
    return filtered


def _map_records_by_field(records: Sequence[Dict[str, object]], field_name: str) -> MutableMapping[str, List[Dict[str, object]]]:
    mapping: MutableMapping[str, List[Dict[str, object]]] = {}
    for record in records:
        key = record.get(field_name)
        if not key:
            continue
        mapping.setdefault(str(key), []).append(record)
    return mapping


def _aggregate_individuals_by_account(
    contacts: Sequence[Dict[str, object]],
    individuals: MutableMapping[str, Dict[str, object]],
) -> MutableMapping[str, Set[str]]:
    account_to_individuals: MutableMapping[str, Set[str]] = {}
    for contact in contacts:
        account_id = contact.get("AccountId")
        individual_id = contact.get("IndividualId")
        if not account_id or not individual_id:
            continue
        if individual_id not in individuals:
            continue
        account_to_individuals.setdefault(str(account_id), set()).add(str(individual_id))
    return account_to_individuals


def _aggregate_contact_points(
    contact_points: Sequence[Dict[str, object]],
    contact_field: Optional[str] = None,
    individual_field: Optional[str] = None,
) -> Dict[str, MutableMapping[str, List[Dict[str, object]]]]:
    mapping: Dict[str, MutableMapping[str, List[Dict[str, object]]]] = {
        "contact": {},
        "individual": {},
    }
    contact_candidates: List[str] = []
    for field in (contact_field, "ContactId", "Contact__c", "ParentId"):
        if isinstance(field, str) and field and field not in contact_candidates:
            contact_candidates.append(field)
    individual_candidates: List[str] = []
    for field in (individual_field, "IndividualId", "Individual__c"):
        if isinstance(field, str) and field and field not in individual_candidates:
            individual_candidates.append(field)
    for record in contact_points:
        for field in contact_candidates:
            contact_id = record.get(field)
            if contact_id:
                mapping["contact"].setdefault(str(contact_id), []).append(record)
                break
        for field in individual_candidates:
            individual_id = record.get(field)
            if individual_id:
                mapping["individual"].setdefault(str(individual_id), []).append(record)
                break
    return mapping


class AlertEvaluationError(Exception):
    pass


class AlertRecord:
    def __init__(self, data: Optional[Dict[str, Any]] = None):
        self._data: Dict[str, Any] = dict(data or {})
        self._lookup: Dict[str, Any] = {}
        for key, value in self._data.items():
            if isinstance(key, str):
                lowered = key.lower()
                if lowered not in self._lookup:
                    self._lookup[lowered] = value
        self._locals_cache: Optional[Dict[str, Any]] = None

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        key = name.lower()
        if key in self._lookup:
            return self._lookup[key]
        raise AttributeError(name)

    def __getitem__(self, key: str) -> Any:
        if not isinstance(key, str):
            raise KeyError(key)
        lowered = key.lower()
        if lowered in self._lookup:
            return self._lookup[lowered]
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        if not isinstance(key, str):
            return default
        return self._lookup.get(key.lower(), default)

    def to_dict(self) -> Dict[str, Any]:
        return dict(self._data)

    def as_locals(self) -> Dict[str, Any]:
        if self._locals_cache is None:
            locals_dict: Dict[str, Any] = {}
            for key, value in self._data.items():
                if not isinstance(key, str) or not key:
                    continue
                identifier = _sanitize_identifier(key)
                if not identifier:
                    continue
                if identifier not in locals_dict:
                    locals_dict[identifier] = value
                lower_identifier = identifier.lower()
                if lower_identifier not in locals_dict:
                    locals_dict[lower_identifier] = value
            self._locals_cache = locals_dict
        return dict(self._locals_cache)


class RecordsNamespace:
    def __init__(self, records_by_object: Dict[str, Sequence[AlertRecord]]):
        self._records: Dict[str, List[AlertRecord]] = {}
        self._index: Dict[str, str] = {}
        for key, records in records_by_object.items():
            if not isinstance(key, str):
                continue
            wrapped: List[AlertRecord] = []
            for record in records or []:
                if isinstance(record, AlertRecord):
                    wrapped.append(record)
                elif isinstance(record, dict):
                    wrapped.append(AlertRecord(record))
            self._records[key] = wrapped
            self._index[key.lower()] = key

    def _resolve(self, key: str) -> str:
        normalized = self._index.get(key.lower())
        if not normalized:
            raise KeyError(key)
        return normalized

    def __getattr__(self, name: str) -> List[AlertRecord]:
        if name.startswith("_"):
            raise AttributeError(name)
        try:
            normalized = self._resolve(name)
        except KeyError as exc:
            raise AttributeError(name) from exc
        return list(self._records.get(normalized, []))

    def __getitem__(self, key: str) -> List[AlertRecord]:
        if not isinstance(key, str):
            raise KeyError(key)
        normalized = self._resolve(key)
        return list(self._records.get(normalized, []))

    def get(self, key: str, default: Optional[Sequence[AlertRecord]] = None) -> List[AlertRecord]:
        try:
            return self[key]
        except KeyError:
            return list(default or [])

    def keys(self) -> List[str]:
        return list(self._records.keys())


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _not_blank(value: Any) -> bool:
    return not _is_blank(value)


def _equals_ignore_case(left: Any, right: Any) -> bool:
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, str) and isinstance(right, str):
        return left.casefold() == right.casefold()
    return left == right


def _coalesce(*values: Any) -> Any:
    for value in values:
        if not _is_blank(value):
            return value
    return values[-1] if values else None


def _casefold(value: Any) -> Any:
    if isinstance(value, str):
        return value.casefold()
    return value


def _hashable_value(value: Any, *, case_insensitive: bool = False) -> Any:
    candidate = _casefold(value) if case_insensitive and isinstance(value, str) else value
    try:
        hash(candidate)
        return candidate
    except TypeError:
        return repr(candidate)


def _alert_values(
    records: Sequence[Any],
    field_name: str,
    *,
    unique: bool = False,
    case_insensitive: bool = False,
    drop_blank: bool = False,
) -> List[Any]:
    if not isinstance(field_name, str) or not field_name:
        return []
    values: List[Any] = []
    for record in records or []:
        if isinstance(record, AlertRecord):
            value = record.get(field_name)
        elif isinstance(record, dict):
            value = record.get(field_name)
        else:
            continue
        if drop_blank and _is_blank(value):
            continue
        if case_insensitive and isinstance(value, str):
            values.append(value.casefold())
        else:
            values.append(value)
    if not unique:
        return values
    seen: Set[Any] = set()
    unique_values: List[Any] = []
    for value in values:
        candidate = _hashable_value(value, case_insensitive=case_insensitive)
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_values.append(value)
    return unique_values


def _unique_values(values: Sequence[Any], *, case_insensitive: bool = False, drop_blank: bool = False) -> List[Any]:
    filtered: List[Any] = []
    for value in values or []:
        if drop_blank and _is_blank(value):
            continue
        filtered.append(value)
    seen: Set[Any] = set()
    unique_values: List[Any] = []
    for value in filtered:
        candidate = _hashable_value(value, case_insensitive=case_insensitive)
        if candidate in seen:
            continue
        seen.add(candidate)
        unique_values.append(value)
    return unique_values


def _duplicate_values(
    values: Sequence[Any],
    *,
    case_insensitive: bool = False,
    drop_blank: bool = True,
) -> List[Any]:
    seen: Dict[Any, int] = {}
    duplicates: List[Any] = []
    for value in values or []:
        candidate = _hashable_value(value, case_insensitive=case_insensitive)
        if drop_blank and _is_blank(candidate):
            continue
        count = seen.get(candidate, 0) + 1
        seen[candidate] = count
        if count == 2:
            duplicates.append(value)
    return duplicates


def _has_duplicates(
    values: Sequence[Any],
    *,
    case_insensitive: bool = False,
    drop_blank: bool = True,
) -> bool:
    return bool(_duplicate_values(values, case_insensitive=case_insensitive, drop_blank=drop_blank))


def _count_if(records: Sequence[Any], predicate) -> int:
    count = 0
    for record in records or []:
        wrapped = record if isinstance(record, AlertRecord) else AlertRecord(record if isinstance(record, dict) else {})
        try:
            if predicate(wrapped):
                count += 1
        except Exception:
            continue
    return count


def _any_match(records: Sequence[Any], predicate) -> bool:
    for record in records or []:
        wrapped = record if isinstance(record, AlertRecord) else AlertRecord(record if isinstance(record, dict) else {})
        try:
            if predicate(wrapped):
                return True
        except Exception:
            continue
    return False


def _all_match(records: Sequence[Any], predicate) -> bool:
    has_items = False
    for record in records or []:
        wrapped = record if isinstance(record, AlertRecord) else AlertRecord(record if isinstance(record, dict) else {})
        has_items = True
        try:
            if not predicate(wrapped):
                return False
        except Exception:
            return False
    return has_items


_ALERT_GLOBAL_FUNCTIONS: Dict[str, Any] = {
    "is_blank": _is_blank,
    "not_blank": _not_blank,
    "equals_ignore_case": _equals_ignore_case,
    "coalesce": _coalesce,
    "values": _alert_values,
    "record_values": _alert_values,
    "unique_values": _unique_values,
    "duplicate_values": _duplicate_values,
    "has_duplicates": _has_duplicates,
    "count_if": _count_if,
    "any_match": _any_match,
    "all_match": _all_match,
    "len": len,
    "sum": sum,
    "min": min,
    "max": max,
    "sorted": sorted,
    "set": set,
    "list": list,
    "tuple": tuple,
    "bool": bool,
    "int": int,
    "float": float,
    "str": str,
    "abs": abs,
    "any": any,
    "all": all,
}

_ALERT_GLOBALS_BASE: Dict[str, Any] = {"__builtins__": {}}
_ALERT_GLOBALS_BASE.update(_ALERT_GLOBAL_FUNCTIONS)

_ALLOWED_ALERT_NODE_TYPES: Tuple[type, ...] = (
    ast.Expression,
    ast.BoolOp,
    ast.BinOp,
    ast.UnaryOp,
    ast.Compare,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Attribute,
    ast.Subscript,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Dict,
    ast.Set,
    ast.And,
    ast.Or,
    ast.Not,
    ast.Eq,
    ast.NotEq,
    ast.Gt,
    ast.GtE,
    ast.Lt,
    ast.LtE,
    ast.Is,
    ast.IsNot,
    ast.In,
    ast.NotIn,
    ast.IfExp,
    ast.ListComp,
    ast.SetComp,
    ast.GeneratorExp,
    ast.DictComp,
    ast.comprehension,
    ast.Slice,
)
if hasattr(ast, "Index"):
    _ALLOWED_ALERT_NODE_TYPES = _ALLOWED_ALERT_NODE_TYPES + (ast.Index,)


def _prepare_alert_expression(expression: str, object_key: str) -> str:
    if not expression:
        return ""
    sanitized = expression.replace("&&", " and ").replace("||", " or ")
    sanitized = re.sub(r"(?<![=!<>])!(?!=)", " not ", sanitized)
    sanitized = re.sub(r"\bnull\b", "None", sanitized, flags=re.IGNORECASE)
    if object_key:
        pattern = re.compile(rf"\b{re.escape(object_key)}\.", flags=re.IGNORECASE)
        sanitized = pattern.sub("record.", sanitized)
    sanitized = re.sub(r"\bAccount\.", "account.", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\brecord\.record\.", "record.", sanitized, flags=re.IGNORECASE)
    return sanitized


def _validate_alert_ast(node: ast.AST) -> None:
    if not isinstance(node, _ALLOWED_ALERT_NODE_TYPES):
        raise AlertEvaluationError(f"unsupported_expression: {type(node).__name__}")
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            if node.func.id not in _ALERT_GLOBAL_FUNCTIONS:
                raise AlertEvaluationError(f"unsupported_function: {node.func.id}")
        elif not isinstance(node.func, ast.Attribute):
            raise AlertEvaluationError("unsupported_call")
    for child in ast.iter_child_nodes(node):
        _validate_alert_ast(child)


def _compile_alert_definition(alert: AlertDefinition) -> Optional[ast.AST]:
    sanitized = _prepare_alert_expression(alert.expression, alert.object_key)
    if not sanitized:
        return None
    try:
        tree = ast.parse(sanitized, mode="eval")
    except SyntaxError as exc:
        raise AlertEvaluationError(str(exc)) from exc
    _validate_alert_ast(tree)
    return compile(tree, "<alert>", "eval")


def _build_alert_locals(
    record: AlertRecord,
    account: AlertRecord,
    related: RecordsNamespace,
) -> Dict[str, Any]:
    locals_payload: Dict[str, Any] = {
        "record": record,
        "account": account,
        "related": related,
        "records": related,
    }
    locals_payload.update(record.as_locals())
    return locals_payload


def _execute_alert_expression(code: ast.AST, locals_payload: Dict[str, Any]) -> Any:
    globals_payload = dict(_ALERT_GLOBALS_BASE)
    try:
        return eval(code, globals_payload, locals_payload)
    except Exception as exc:  # pragma: no cover - defensive
        raise AlertEvaluationError(str(exc)) from exc


def _format_alert_payload(alert: AlertDefinition) -> Dict[str, str]:
    label = alert.label or alert.id
    return {
        "id": alert.id,
        "label": label,
        "description": alert.description,
        "object": alert.object_key,
    }


def _evaluate_alerts_for_account(
    compiled_alerts: Sequence[Tuple[AlertDefinition, Optional[ast.AST]]],
    account_record: Optional[Dict[str, object]],
    related_records: Dict[str, List[Dict[str, object]]],
    warnings: Dict[str, str],
) -> Tuple[
    List[Dict[str, str]],
    Dict[str, Dict[str, List[Dict[str, str]]]],
    Dict[str, Dict[int, List[Dict[str, str]]]],
]:
    account_wrapper = AlertRecord(account_record or {})
    wrapped_by_object: Dict[str, List[AlertRecord]] = {}
    for object_key, records in related_records.items():
        wrapped: List[AlertRecord] = []
        for record in records or []:
            if isinstance(record, dict):
                wrapped.append(AlertRecord(record))
        wrapped_by_object[object_key] = wrapped
    wrapped_by_object.setdefault("Account", [account_wrapper])
    related_namespace = RecordsNamespace(wrapped_by_object)

    account_alerts: List[Dict[str, str]] = []
    alerts_by_record_id: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
    alerts_by_index: Dict[str, Dict[int, List[Dict[str, str]]]] = {}

    for alert, code in compiled_alerts:
        if not code:
            continue
        try:
            if alert.object_key == "Account":
                locals_payload = _build_alert_locals(account_wrapper, account_wrapper, related_namespace)
                result = _execute_alert_expression(code, locals_payload)
                if bool(result):
                    account_alerts.append(_format_alert_payload(alert))
                continue
            records = wrapped_by_object.get(alert.object_key, [])
            if not records:
                continue
            alert_info: Optional[Dict[str, str]] = None
            for index, record in enumerate(records):
                locals_payload = _build_alert_locals(record, account_wrapper, related_namespace)
                result = _execute_alert_expression(code, locals_payload)
                if not bool(result):
                    continue
                if alert_info is None:
                    alert_info = _format_alert_payload(alert)
                record_id = None
                raw_id = record.get("Id")
                if raw_id:
                    record_id = str(raw_id)
                    alerts_by_record_id.setdefault(alert.object_key, {}).setdefault(record_id, []).append(alert_info)
                alerts_by_index.setdefault(alert.object_key, {}).setdefault(index, []).append(alert_info)
        except AlertEvaluationError as exc:
            warnings[f"alert:{alert.id}"] = f"Alert '{alert.label or alert.id}' failed: {exc}"
        except Exception as exc:  # pragma: no cover - unexpected evaluation errors
            warnings[f"alert:{alert.id}"] = f"Alert '{alert.label or alert.id}' failed: {exc}"  # noqa: TRY401

    return account_alerts, alerts_by_record_id, alerts_by_index


def run_explorer(org: OrgConfig, account_ids: Sequence[str]) -> ExplorerResult:
    sanitized_ids = _sanitize_account_ids(account_ids)
    if not sanitized_ids:
        raise ValueError("no_valid_ids")

    config = get_config()
    results: Dict[str, List[Dict[str, object]]] = {}
    warnings: Dict[str, str] = {}
    compiled_alerts: List[Tuple[AlertDefinition, Optional[ast.AST]]] = []
    for alert in config.get_alerts():
        try:
            compiled = _compile_alert_definition(alert)
        except AlertEvaluationError as exc:
            warnings[f"alert:{alert.id}"] = f"Alert '{alert.label or alert.id}' failed: {exc}"
            continue
        compiled_alerts.append((alert, compiled))

    # Query accounts first
    account_query_fields, account_display_fields = _build_query_fields(
        org, "Account", config
    )
    account_records: Dict[str, Dict[str, object]] = {}
    for chunk in _chunk(sanitized_ids, 100):
        soql = f"SELECT {', '.join(account_query_fields)} FROM Account WHERE Id IN ({_format_ids_for_soql(chunk)})"
        data = _query_all_with_handling(org, soql, "Account", warnings, required=True)
        for record in data.get("records", []):
            record_id = record.get("Id")
            if not record_id:
                continue
            account_records[str(record_id)] = record
    missing_accounts = [account_id for account_id in sanitized_ids if account_id not in account_records]

    # Query objects linked directly to accounts
    direct_objects = [
        "BillingProfile__c",
        "Contract",
        "Contact",
        "AccountContactRelation",
        "Case",
        "Order",
        "Sale__c",
    ]
    for object_key in direct_objects:
        definition = _OBJECT_DEFINITIONS[object_key]
        filter_field = definition["filter_field"]
        query_fields, display_fields = _build_query_fields(org, object_key, config)
        records: List[Dict[str, object]] = []
        for chunk in _chunk(sanitized_ids, 100):
            if object_key in warnings:
                break
            soql = (
                f"SELECT {', '.join(query_fields)} FROM {object_key} WHERE {filter_field} IN ({_format_ids_for_soql(chunk)})"
            )
            data = _query_all_with_handling(org, soql, object_key, warnings)
            records.extend(data.get("records", []))
        results[object_key] = records

    contacts = results.get("Contact", [])
    individuals_config = _build_query_fields(org, "Individual", config)
    individual_query_fields, individual_display_fields = individuals_config
    individual_ids: List[str] = []
    contact_ids: List[str] = []
    for contact in contacts:
        individual_id = contact.get("IndividualId")
        if individual_id and str(individual_id) not in individual_ids:
            individual_ids.append(str(individual_id))
        contact_id = contact.get("Id")
        if contact_id and str(contact_id) not in contact_ids:
            contact_ids.append(str(contact_id))
    individual_records: Dict[str, Dict[str, object]] = {}
    if individual_ids:
        for chunk in _chunk(individual_ids, 100):
            if "Individual" in warnings:
                break
            soql = f"SELECT {', '.join(individual_query_fields)} FROM Individual WHERE Id IN ({_format_ids_for_soql(chunk)})"
            data = _query_all_with_handling(org, soql, "Individual", warnings)
            for record in data.get("records", []):
                record_id = record.get("Id")
                if record_id:
                    individual_records[str(record_id)] = record
    results["Individual"] = list(individual_records.values())

    # Contact points for individuals and contacts
    contact_point_objects = ["ContactPointPhone", "ContactPointEmail"]
    contact_point_mappings: Dict[
        str, Dict[str, MutableMapping[str, List[Dict[str, object]]]]
    ] = {}
    for object_key in contact_point_objects:
        definition = _OBJECT_DEFINITIONS.get(object_key, {})
        query_fields, display_fields = _build_query_fields(org, object_key, config)
        records_by_id: Dict[str, Dict[str, object]] = {}
        if "individual_field" in definition:
            raw_individual_field = definition.get("individual_field")
        else:
            raw_individual_field = "IndividualId"
        if "contact_field" in definition:
            raw_contact_field = definition.get("contact_field")
        else:
            raw_contact_field = "ContactId"
        individual_field = ""
        contact_field = ""
        if raw_individual_field is not None:
            individual_field = str(raw_individual_field)
        if raw_contact_field is not None:
            contact_field = str(raw_contact_field)
        try:
            available_contact_point_fields = _get_object_field_names(org, object_key)
        except SalesforceError as exc:
            logger.warning("Unable to describe %s: %s", object_key, exc)
            available_contact_point_fields = set()
        if (
            individual_field
            and individual_field.lower() != "none"
            and individual_field not in available_contact_point_fields
        ):
            individual_field = ""
        if (
            contact_field
            and contact_field.lower() != "none"
            and contact_field not in available_contact_point_fields
        ):
            contact_field = ""
        if individual_field and individual_field.lower() != "none" and individual_ids:
            for chunk in _chunk(individual_ids, 100):
                if object_key in warnings:
                    break
                soql = (
                    f"SELECT {', '.join(query_fields)} FROM {object_key} WHERE {individual_field} IN ({_format_ids_for_soql(chunk)})"
                )
                data = _query_all_with_handling(org, soql, object_key, warnings)
                for record in data.get("records", []):
                    record_id = record.get("Id")
                    if record_id:
                        records_by_id[str(record_id)] = record
        if (
            object_key not in warnings
            and contact_field
            and contact_field.lower() != "none"
            and contact_ids
        ):
            for chunk in _chunk(contact_ids, 100):
                if object_key in warnings:
                    break
                soql = (
                    f"SELECT {', '.join(query_fields)} FROM {object_key} WHERE {contact_field} IN ({_format_ids_for_soql(chunk)})"
                )
                data = _query_all_with_handling(org, soql, object_key, warnings)
                for record in data.get("records", []):
                    record_id = record.get("Id")
                    if record_id:
                        records_by_id[str(record_id)] = record
        records = list(records_by_id.values())
        results[object_key] = records
        contact_point_mappings[object_key] = _aggregate_contact_points(
            records,
            contact_field=contact_field,
            individual_field=individual_field,
        )

    contact_by_account = _map_records_by_field(contacts, "AccountId")
    individual_by_account = _aggregate_individuals_by_account(contacts, individual_records)

    generated_at = datetime.now(timezone.utc).isoformat()
    configured_objects = config.get_objects()

    explorer_data: Dict[str, object] = {
        "accounts": [],
        "objects": configured_objects,
        "config": {key: config.get_fields(key) for key in _OBJECT_DEFINITIONS.keys()},
        "summary": {},
    }
    if warnings:
        explorer_data["warnings"] = dict(warnings)

    summary_counts: Dict[str, int] = {}
    for obj in configured_objects:
        summary_counts[obj["key"]] = len(results.get(obj["key"], []))
    explorer_data["summary"] = summary_counts

    for account_id in sanitized_ids:
        account_record = account_records.get(account_id)
        account_payload = {
            "id": account_id,
            "fields": _record_to_field_list(
                account_display_fields,
                account_record or {},
                extra_fields=_get_object_link_fields("Account"),
            ),
            "related": {},
            "alerts": [],
        }
        account_related_raw: Dict[str, List[Dict[str, object]]] = {}
        display_fields_map: Dict[str, List[str]] = {}
        for obj in configured_objects:
            key = obj["key"]
            definition = _OBJECT_DEFINITIONS.get(key, {})
            _, display_fields = _build_query_fields(org, key, config)
            display_fields_map[key] = display_fields
            if key == "Contact":
                related_records = list(contact_by_account.get(account_id, []))
            elif key in (
                "BillingProfile__c",
                "Contract",
                "AccountContactRelation",
                "Case",
                "Order",
                "Sale__c",
            ):
                filter_field = str(definition.get("filter_field", "AccountId"))
                related_records = _filter_records_by_field(results.get(key, []), filter_field, account_id)
            elif key == "Individual":
                individual_ids_for_account = individual_by_account.get(account_id, set())
                related_records = [
                    individual_records.get(individual_id)
                    for individual_id in individual_ids_for_account
                ]
                related_records = [record for record in related_records if record]
            elif key in ("ContactPointPhone", "ContactPointEmail"):
                individual_ids_for_account = individual_by_account.get(account_id, set())
                contact_records_for_account = contact_by_account.get(account_id, [])
                contact_ids_for_account = [
                    str(record.get("Id"))
                    for record in contact_records_for_account
                    if record and record.get("Id")
                ]
                related_records = []
                mapping = contact_point_mappings.get(key, {})
                individual_mapping = mapping.get("individual", {}) if mapping else {}
                contact_mapping = mapping.get("contact", {}) if mapping else {}
                for individual_id in individual_ids_for_account:
                    related_records.extend(individual_mapping.get(individual_id, []))
                for contact_id in contact_ids_for_account:
                    related_records.extend(contact_mapping.get(contact_id, []))
                if related_records:
                    deduped: List[Dict[str, object]] = []
                    seen_ids: Set[str] = set()
                    for record in related_records:
                        record_id = record.get("Id")
                        if record_id:
                            record_id = str(record_id)
                        if record_id and record_id in seen_ids:
                            continue
                        if record_id:
                            seen_ids.add(record_id)
                        deduped.append(record)
                    related_records = deduped
            else:
                related_records = []
            account_related_raw[key] = list(related_records)
        account_related_raw["Account"] = [account_record] if account_record else []

        account_alerts, record_alerts_by_id, record_alerts_by_index = _evaluate_alerts_for_account(
            compiled_alerts,
            account_record,
            account_related_raw,
            warnings,
        )
        account_payload["alerts"] = [dict(alert) for alert in account_alerts]

        for obj in configured_objects:
            key = obj["key"]
            related_records = account_related_raw.get(key, []) or []
            display_fields = display_fields_map.get(key, [])
            payload_records: List[Dict[str, object]] = []
            for index, record in enumerate(related_records):
                if not record:
                    continue
                entry: Dict[str, object] = {
                    "id": record.get("Id"),
                    "fields": _record_to_field_list(
                        display_fields,
                        record,
                        extra_fields=_get_object_link_fields(key),
                    ),
                }
                alerts_for_record: List[Dict[str, str]] = []
                record_id_value = record.get("Id")
                if record_id_value:
                    record_alerts = record_alerts_by_id.get(key, {}).get(str(record_id_value), [])
                    alerts_for_record.extend(record_alerts)
                alerts_for_record.extend(record_alerts_by_index.get(key, {}).get(index, []))
                if alerts_for_record:
                    seen_alerts: Set[str] = set()
                    deduped_alerts: List[Dict[str, str]] = []
                    for alert_info in alerts_for_record:
                        alert_id = alert_info.get("id")
                        if alert_id and alert_id in seen_alerts:
                            continue
                        seen_alerts.add(alert_id)
                        deduped_alerts.append(dict(alert_info))
                    if deduped_alerts:
                        entry["alerts"] = deduped_alerts
                payload_records.append(entry)
            account_payload["related"][key] = payload_records
        explorer_data["accounts"].append(account_payload)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"account_explorer_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    file_path = RESULTS_DIR / filename
    with file_path.open("w", encoding="utf-8") as fh:
        json.dump(explorer_data, fh, ensure_ascii=False, indent=2, default=str)

    explorer_result = ExplorerResult(
        account_ids=sanitized_ids,
        missing_account_ids=missing_accounts,
        generated_at=generated_at,
        data=explorer_data,
        file_path=str(file_path),
    )
    session_state = get_session()
    session_state.result = explorer_result
    return explorer_result


def describe_object(org: OrgConfig, object_name: str) -> List[Dict[str, str]]:
    return describe_sobject(org, object_name)
