from __future__ import annotations

import ast
import hashlib
import json
import logging
import operator
import re
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, MutableMapping, Optional, Sequence, Set, Tuple

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


@dataclass
class AlertDefinition:
    id: str
    label: str
    expression: str
    description: Optional[str] = None

    def to_dict(self) -> Dict[str, object]:
        payload: Dict[str, object] = {
            "id": self.id,
            "label": self.label,
            "expression": self.expression,
        }
        if self.description:
            payload["description"] = self.description
        return payload


def _sanitize_alerts(payload: object) -> List[AlertDefinition]:
    alerts: List[AlertDefinition] = []
    if not isinstance(payload, Sequence) or isinstance(payload, (str, bytes)):
        return alerts
    seen: Set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        raw_label = item.get("label")
        raw_expression = item.get("expression")
        if not isinstance(raw_label, str) or not raw_label.strip():
            continue
        if not isinstance(raw_expression, str) or not raw_expression.strip():
            continue
        alert_id = item.get("id")
        if not isinstance(alert_id, str) or not alert_id.strip():
            alert_id = uuid.uuid4().hex
        alert_id = alert_id.strip()
        if alert_id in seen:
            continue
        description = item.get("description")
        description_text = description.strip() if isinstance(description, str) else None
        alerts.append(
            AlertDefinition(
                id=alert_id,
                label=raw_label.strip(),
                expression=raw_expression.strip(),
                description=description_text or None,
            )
        )
        seen.add(alert_id)
    return alerts


@dataclass
class ExplorerConfig:
    fields: Dict[str, List[str]] = field(default_factory=dict)
    objects: List[Dict[str, object]] = field(default_factory=list)
    view_mode: str = _DEFAULT_VIEW_MODE
    updated_at: Optional[str] = None
    alerts: List["AlertDefinition"] = field(default_factory=list)

    def get_alerts(self) -> List["AlertDefinition"]:
        sanitized: List["AlertDefinition"] = []
        seen: Set[str] = set()
        for alert in self.alerts:
            if not isinstance(alert, AlertDefinition):
                continue
            if not alert.id or alert.id in seen:
                continue
            sanitized.append(alert)
            seen.add(alert.id)
        return sanitized

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

    def get_available_fields(self) -> Dict[str, List[str]]:
        available: Dict[str, List[str]] = {}
        for object_key, definition in _OBJECT_DEFINITIONS.items():
            candidates: Set[str] = set()
            for field_name in self.fields.get(object_key, []):
                if isinstance(field_name, str) and field_name and field_name.lower() != "id":
                    candidates.add(field_name)
            for field_name in _DEFAULT_FIELDS.get(object_key, []):
                if isinstance(field_name, str) and field_name and field_name.lower() != "id":
                    candidates.add(field_name)
            for field_name in definition.get("required_fields", []) or []:
                if isinstance(field_name, str) and field_name and field_name.lower() != "id":
                    candidates.add(field_name)
            for extra in (
                definition.get("filter_field"),
                definition.get("contact_field"),
                definition.get("individual_field"),
            ):
                if isinstance(extra, str) and extra and extra.lower() != "id":
                    candidates.add(extra)
            available[object_key] = sorted(candidates)
        return available

    def to_dict(self) -> Dict[str, object]:
        return {
            "fields": {key: list(value) for key, value in self.fields.items()},
            "objects": [
                {"key": str(item.get("key")), "hidden": bool(item.get("hidden"))}
                for item in self.objects
                if isinstance(item, dict) and item.get("key")
            ],
            "viewMode": self.view_mode,
            "updatedAt": self.updated_at,
            "alerts": [alert.to_dict() for alert in self.get_alerts()],
            "availableFields": self.get_available_fields(),
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
        return ExplorerConfig(fields={}, objects=[], view_mode=_DEFAULT_VIEW_MODE, updated_at=None)
    with _config_lock:
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return ExplorerConfig(fields={}, objects=[], view_mode=_DEFAULT_VIEW_MODE, updated_at=None)
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
        updated_at = data.get("updatedAt") if isinstance(data, dict) else None
        alerts_payload = data.get("alerts") if isinstance(data, dict) else []
        alerts = _sanitize_alerts(alerts_payload)
        return ExplorerConfig(
            fields=result,
            objects=objects,
            view_mode=view_mode,
            updated_at=updated_at,
            alerts=alerts,
        )


def save_config(config: ExplorerConfig) -> None:
    payload = {
        "fields": {key: list(values) for key, values in config.fields.items()},
        "objects": [
            {"key": item["key"], "hidden": bool(item.get("hidden"))}
            for item in config.objects
            if isinstance(item, dict) and item.get("key")
        ],
        "viewMode": config.view_mode,
        "updatedAt": config.updated_at,
        "alerts": [alert.to_dict() for alert in config.get_alerts()],
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
    view_mode = existing.view_mode if existing.view_mode in _VALID_VIEW_MODES else _DEFAULT_VIEW_MODE
    sanitized_alerts: List[AlertDefinition] = existing.get_alerts()

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

    if "viewMode" in payload:
        raw_view_mode = payload.get("viewMode")
        if isinstance(raw_view_mode, str) and raw_view_mode in _VALID_VIEW_MODES:
            view_mode = raw_view_mode
        else:
            view_mode = _DEFAULT_VIEW_MODE

    if "alerts" in payload:
        sanitized_alerts = _sanitize_alerts(payload.get("alerts"))

    timestamp = datetime.now(timezone.utc).isoformat()
    config = ExplorerConfig(
        fields=sanitized_fields,
        objects=sanitized_objects,
        view_mode=view_mode,
        updated_at=timestamp,
        alerts=sanitized_alerts,
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


def _normalize_string(value: str) -> str:
    return value.casefold()


def _is_null_value(value: Any) -> bool:
    return value is None


def _is_blank_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _coerce_other_values(value: Any) -> List[Any]:
    if isinstance(value, FieldValue):
        return [entry.value for entry in value.entries]
    if isinstance(value, AlertResult):
        return [value.value]
    if isinstance(value, (list, tuple, set)):
        result: List[Any] = []
        for item in value:
            if isinstance(item, FieldValue):
                result.extend([entry.value for entry in item.entries])
            else:
                result.append(item)
        return result
    return [value]


def _serialize_for_hash(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return repr(value)


def _make_record_key(object_key: str, record: Optional[Dict[str, object]]) -> str:
    if not record:
        return f"{object_key}:missing"
    record_id = record.get("Id")
    if record_id:
        return f"{object_key}:{record_id}"
    payload = _serialize_for_hash(record)
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()
    return f"{object_key}:{digest}"


def _dedupe_matches(matches: Sequence["AlertMatch"]) -> List["AlertMatch"]:
    seen: Set[Tuple[str, str, Optional[str]]] = set()
    sanitized: List[AlertMatch] = []
    for match in matches:
        key = (match.object_key, match.record_key, match.field_name)
        if key in seen:
            continue
        seen.add(key)
        sanitized.append(match)
    return sanitized


@dataclass
class AlertFieldEntry:
    object_key: str
    field_name: str
    record_key: str
    record_id: Optional[str]
    value: Any
    record: Dict[str, Any]


@dataclass
class AlertMatch:
    object_key: str
    record_key: str
    record_id: Optional[str]
    field_name: Optional[str] = None
    value: Any = None


@dataclass
class AlertResult:
    value: bool
    matches: List[AlertMatch] = field(default_factory=list)

    def __bool__(self) -> bool:  # pragma: no cover - for truthiness
        return bool(self.value)


@dataclass
class AlertRecordContext:
    object_key: str
    record_key: str
    record_id: Optional[str]
    data: Dict[str, Any]


class FieldValue:
    def __init__(self, object_key: str, field_name: str, entries: Sequence[AlertFieldEntry]):
        self.object_key = object_key
        self.field_name = field_name
        self.entries: List[AlertFieldEntry] = list(entries)

    def __bool__(self) -> bool:  # pragma: no cover - used for truthiness
        return any(not _is_blank_value(entry.value) for entry in self.entries)

    def values(self, *, include_blank: bool = True) -> List[Any]:
        results: List[Any] = []
        for entry in self.entries:
            if not include_blank and _is_blank_value(entry.value):
                continue
            results.append(entry.value)
        return results

    def non_blank(self) -> "FieldValue":
        filtered = [entry for entry in self.entries if not _is_blank_value(entry.value)]
        return FieldValue(self.object_key, self.field_name, filtered)

    def distinct(self, *, ignore_case: bool = True, include_blank: bool = False) -> "FieldValue":
        seen: Set[Any] = set()
        filtered: List[AlertFieldEntry] = []
        for entry in self.entries:
            if not include_blank and _is_blank_value(entry.value):
                continue
            value = entry.value
            if ignore_case and isinstance(value, str):
                key = _normalize_string(value)
            else:
                key = value
            if key in seen:
                continue
            seen.add(key)
            filtered.append(entry)
        return FieldValue(self.object_key, self.field_name, filtered)

    def casefold(self) -> "FieldValue":
        transformed: List[AlertFieldEntry] = []
        for entry in self.entries:
            value = entry.value
            if isinstance(value, str):
                value = _normalize_string(value)
            transformed.append(
                AlertFieldEntry(
                    object_key=entry.object_key,
                    field_name=entry.field_name,
                    record_key=entry.record_key,
                    record_id=entry.record_id,
                    value=value,
                    record=entry.record,
                )
            )
        return FieldValue(self.object_key, self.field_name, transformed)

    def count(
        self,
        *,
        include_blank: bool = True,
        distinct: bool = False,
        ignore_case: bool = True,
    ) -> int:
        if distinct:
            return len(self.distinct(ignore_case=ignore_case, include_blank=include_blank).entries)
        if include_blank:
            return len(self.entries)
        return len([entry for entry in self.entries if not _is_blank_value(entry.value)])

    def is_null(self) -> AlertResult:
        matches = [self._entry_to_match(entry) for entry in self.entries if _is_null_value(entry.value)]
        return AlertResult(bool(matches), matches)

    def is_blank(self) -> AlertResult:
        matches = [self._entry_to_match(entry) for entry in self.entries if _is_blank_value(entry.value)]
        return AlertResult(bool(matches), matches)

    def contains(self, needle: Any, *, ignore_case: bool = True) -> AlertResult:
        matches: List[AlertMatch] = []
        for entry in self.entries:
            value = entry.value
            found = False
            if isinstance(value, str) and isinstance(needle, str):
                haystack = _normalize_string(value) if ignore_case else value
                target = _normalize_string(needle) if ignore_case else needle
                found = target in haystack
            elif isinstance(value, (list, tuple, set)):
                items = value
                if ignore_case and isinstance(needle, str):
                    items = [
                        _normalize_string(item) if isinstance(item, str) else item
                        for item in value
                    ]
                    candidate = _normalize_string(needle)
                    found = candidate in items
                else:
                    found = needle in value
            if found:
                matches.append(self._entry_to_match(entry))
        return AlertResult(bool(matches), matches)

    def duplicates(
        self,
        *,
        ignore_case: bool = True,
        include_blank: bool = False,
    ) -> AlertResult:
        groups: Dict[Any, List[AlertFieldEntry]] = {}
        for entry in self.entries:
            value = entry.value
            if not include_blank and _is_blank_value(value):
                continue
            key = _normalize_string(value) if ignore_case and isinstance(value, str) else value
            groups.setdefault(key, []).append(entry)
        matches: List[AlertMatch] = []
        for entries in groups.values():
            if len(entries) <= 1:
                continue
            matches.extend(self._entry_to_match(entry) for entry in entries)
        return AlertResult(bool(matches), _dedupe_matches(matches))

    def records(self) -> List[Dict[str, Any]]:
        payload: List[Dict[str, Any]] = []
        for entry in self.entries:
            record_copy = dict(entry.record)
            record_copy.setdefault("__recordKey", entry.record_key)
            record_copy.setdefault("__objectKey", entry.object_key)
            if entry.record_id:
                record_copy.setdefault("__recordId", entry.record_id)
            payload.append(record_copy)
        return payload

    def compare(self, operator_node: ast.cmpop, other: Any, *, reverse: bool = False) -> AlertResult:
        comparator_type = type(operator_node)
        targets = _coerce_other_values(other)
        matches: List[AlertMatch] = []

        def equals(entry_value: Any, compare_value: Any) -> bool:
            if isinstance(entry_value, str) and isinstance(compare_value, str):
                return _normalize_string(entry_value) == _normalize_string(compare_value)
            return entry_value == compare_value

        def compare(entry_value: Any, compare_value: Any, func) -> bool:
            left = entry_value
            right = compare_value
            if isinstance(left, str) and isinstance(right, str):
                left = _normalize_string(left)
                right = _normalize_string(right)
            try:
                return func(left, right)
            except TypeError:
                return False

        if comparator_type in (ast.Eq, ast.Is):
            for entry in self.entries:
                if any(equals(entry.value, candidate) for candidate in targets):
                    matches.append(self._entry_to_match(entry))
            return AlertResult(bool(matches), matches)

        if comparator_type in (ast.NotEq, ast.IsNot):
            for entry in self.entries:
                if not any(equals(entry.value, candidate) for candidate in targets):
                    matches.append(self._entry_to_match(entry))
            return AlertResult(bool(matches), matches)

        if comparator_type is ast.In:
            for entry in self.entries:
                if any(equals(entry.value, candidate) for candidate in targets):
                    matches.append(self._entry_to_match(entry))
            return AlertResult(bool(matches), matches)

        if comparator_type is ast.NotIn:
            for entry in self.entries:
                if not any(equals(entry.value, candidate) for candidate in targets):
                    matches.append(self._entry_to_match(entry))
            return AlertResult(bool(matches), matches)

        if comparator_type is ast.Lt:
            func = operator.gt if reverse else operator.lt
        elif comparator_type is ast.LtE:
            func = operator.ge if reverse else operator.le
        elif comparator_type is ast.Gt:
            func = operator.lt if reverse else operator.gt
        elif comparator_type is ast.GtE:
            func = operator.le if reverse else operator.ge
        else:
            func = None

        if func is not None:
            for entry in self.entries:
                if any(compare(entry.value, candidate, func) for candidate in targets):
                    matches.append(self._entry_to_match(entry))
            return AlertResult(bool(matches), matches)

        return AlertResult(False, [])

    def _entry_to_match(self, entry: AlertFieldEntry) -> AlertMatch:
        return AlertMatch(
            object_key=entry.object_key,
            record_key=entry.record_key,
            record_id=entry.record_id,
            field_name=entry.field_name,
            value=entry.value,
        )


class AlertEvaluationContext:
    def __init__(
        self,
        account_id: str,
        account_record: Optional[Dict[str, Any]],
        related_records: Dict[str, List[Dict[str, Any]]],
    ) -> None:
        self._records: Dict[str, List[AlertRecordContext]] = {}
        self._available_objects: Set[str] = set(_OBJECT_DEFINITIONS.keys()) | {"Account"}
        base_account = account_record or {"Id": account_id}
        self._add_record("Account", base_account)
        for object_key, records in related_records.items():
            self._available_objects.add(object_key)
            for record in records:
                if record:
                    self._add_record(object_key, record)

    @property
    def available_objects(self) -> Set[str]:
        return set(self._available_objects)

    def _add_record(self, object_key: str, record: Dict[str, Any]) -> None:
        record_key = _make_record_key(object_key, record)
        record_id = record.get("Id")
        entry = AlertRecordContext(
            object_key=object_key,
            record_key=record_key,
            record_id=str(record_id) if record_id else None,
            data=record,
        )
        self._records.setdefault(object_key, []).append(entry)

    def field(self, object_key: str, field_name: str) -> FieldValue:
        entries: List[AlertFieldEntry] = []
        for record in self._records.get(object_key, []):
            entries.append(
                AlertFieldEntry(
                    object_key=object_key,
                    field_name=field_name,
                    record_key=record.record_key,
                    record_id=record.record_id,
                    value=record.data.get(field_name),
                    record=record.data,
                )
            )
        return FieldValue(object_key, field_name, entries)

    def records(self, object_key: str) -> List[Dict[str, Any]]:
        payload: List[Dict[str, Any]] = []
        for record in self._records.get(object_key, []):
            record_copy = dict(record.data)
            record_copy.setdefault("__recordKey", record.record_key)
            record_copy.setdefault("__objectKey", object_key)
            if record.record_id:
                record_copy.setdefault("__recordId", record.record_id)
            payload.append(record_copy)
        return payload


class _FieldReferenceTransformer(ast.NodeTransformer):
    def __init__(self, known_objects: Set[str]):
        super().__init__()
        self.known_objects = set(known_objects)

    def visit_Attribute(self, node: ast.Attribute) -> Any:  # pragma: no cover - AST transformation
        node = self.generic_visit(node)
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            object_name = node.value.id
            if object_name in self.known_objects:
                return ast.Call(
                    func=ast.Name(id="field", ctx=ast.Load()),
                    args=[ast.Constant(value=object_name), ast.Constant(value=node.attr)],
                    keywords=[],
                )
        return node


class AlertExpressionEvaluator:
    def __init__(self, context: AlertEvaluationContext):
        self.context = context
        self._functions = {
            "field": self.context.field,
            "records": self.context.records,
            "count": self._count,
            "distinct": self._distinct,
            "has_duplicates": self._has_duplicates,
            "duplicates": duplicates,
            "len": len,
            "any": any,
            "all": all,
            "sum": sum,
            "min": min,
            "max": max,
            "set": set,
            "sorted": sorted,
        }

    def evaluate(self, expression: str) -> AlertResult:
        if not expression or not expression.strip():
            return AlertResult(False, [])
        processed = self._preprocess(expression)
        try:
            tree = ast.parse(processed, mode="eval")
        except SyntaxError as exc:  # pragma: no cover - depends on user input
            logger.warning("Invalid alert expression '%s': %s", expression, exc)
            return AlertResult(False, [])
        transformer = _FieldReferenceTransformer(self.context.available_objects)
        tree = transformer.visit(tree)
        ast.fix_missing_locations(tree)
        try:
            result = self._evaluate_condition(tree.body)
        except Exception as exc:  # pragma: no cover - depends on user input
            logger.warning("Unable to evaluate alert expression '%s': %s", expression, exc)
            return AlertResult(False, [])
        if not isinstance(result, AlertResult):
            result = AlertResult(bool(result), [])
        if not result.value:
            return AlertResult(False, [])
        return AlertResult(True, _dedupe_matches(result.matches))

    def _preprocess(self, expression: str) -> str:
        expr = expression.replace("&&", " and ").replace("||", " or ")
        expr = re.sub(r"(?<![=!<>])!(?!=)", " not ", expr)
        expr = re.sub(r"\bnull\b", "None", expr, flags=re.IGNORECASE)
        return expr

    def _evaluate_condition(self, node: ast.AST) -> AlertResult:
        if isinstance(node, ast.BoolOp):
            values = [self._evaluate_condition(value) for value in node.values]
            if isinstance(node.op, ast.And):
                if not all(value.value for value in values):
                    return AlertResult(False, [])
                matches: List[AlertMatch] = []
                for value in values:
                    if value.value:
                        matches.extend(value.matches)
                return AlertResult(True, _dedupe_matches(matches))
            if isinstance(node.op, ast.Or):
                if not any(value.value for value in values):
                    return AlertResult(False, [])
                matches = []
                for value in values:
                    if value.value:
                        matches.extend(value.matches)
                return AlertResult(True, _dedupe_matches(matches))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            operand = self._evaluate_condition(node.operand)
            return AlertResult(not operand.value, [])
        if isinstance(node, ast.Compare):
            return self._evaluate_compare(node)
        value = self._evaluate_value(node)
        if isinstance(value, AlertResult):
            return value
        return AlertResult(bool(self._unwrap(value)), [])

    def _evaluate_compare(self, node: ast.Compare) -> AlertResult:
        left = self._evaluate_value(node.left)
        result: Optional[AlertResult] = None
        for operator_node, comparator in zip(node.ops, node.comparators):
            right = self._evaluate_value(comparator)
            comparison = self._compare(left, operator_node, right)
            if not isinstance(comparison, AlertResult):
                comparison = AlertResult(bool(self._unwrap(comparison)), [])
            if not comparison.value:
                return AlertResult(False, [])
            if result is None:
                result = comparison
            else:
                result = AlertResult(
                    result.value and comparison.value,
                    result.matches + comparison.matches,
                )
            left = right
        if result is None:
            return AlertResult(False, [])
        if not result.value:
            return AlertResult(False, [])
        return AlertResult(True, _dedupe_matches(result.matches))

    def _compare(self, left: Any, operator_node: ast.cmpop, right: Any) -> AlertResult:
        if isinstance(left, FieldValue):
            return left.compare(operator_node, right, reverse=False)
        if isinstance(right, FieldValue):
            return right.compare(operator_node, left, reverse=True)
        left_value = self._unwrap(left)
        right_value = self._unwrap(right)
        comparator_type = type(operator_node)
        if comparator_type is ast.In:
            return AlertResult(left_value in right_value, [])
        if comparator_type is ast.NotIn:
            return AlertResult(left_value not in right_value, [])
        if comparator_type in (ast.Is, ast.Eq):
            if isinstance(left_value, str) and isinstance(right_value, str):
                return AlertResult(_normalize_string(left_value) == _normalize_string(right_value), [])
            return AlertResult(left_value == right_value, [])
        if comparator_type in (ast.IsNot, ast.NotEq):
            if isinstance(left_value, str) and isinstance(right_value, str):
                return AlertResult(_normalize_string(left_value) != _normalize_string(right_value), [])
            return AlertResult(left_value != right_value, [])
        comparator_map = {
            ast.Lt: operator.lt,
            ast.LtE: operator.le,
            ast.Gt: operator.gt,
            ast.GtE: operator.ge,
        }
        func = comparator_map.get(comparator_type)
        if func:
            try:
                left_cmp = _normalize_string(left_value) if isinstance(left_value, str) else left_value
                right_cmp = _normalize_string(right_value) if isinstance(right_value, str) else right_value
                return AlertResult(func(left_cmp, right_cmp), [])
            except TypeError:
                return AlertResult(False, [])
        return AlertResult(False, [])

    def _evaluate_value(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Call):
            return self._evaluate_call(node)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            if node.id == "None":
                return None
            if node.id == "True":
                return True
            if node.id == "False":
                return False
            if node.id in self._functions:
                return self._functions[node.id]
            return node.id
        if isinstance(node, ast.Tuple):
            return tuple(self._evaluate_value(element) for element in node.elts)
        if isinstance(node, ast.List):
            return [self._evaluate_value(element) for element in node.elts]
        if isinstance(node, ast.Set):
            return {self._evaluate_value(element) for element in node.elts}
        if isinstance(node, ast.Dict):
            return {
                self._evaluate_value(key): self._evaluate_value(value)
                for key, value in zip(node.keys, node.values)
            }
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            operand = self._evaluate_value(node.operand)
            if isinstance(node.op, ast.USub):
                return -self._unwrap(operand)
            return +self._unwrap(operand)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)):
            left = self._unwrap(self._evaluate_value(node.left))
            right = self._unwrap(self._evaluate_value(node.right))
            operations = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.Mod: operator.mod,
            }
            func = operations.get(type(node.op))
            if func:
                try:
                    return func(left, right)
                except TypeError:
                    return 0
        if isinstance(node, ast.Attribute):
            value = self._evaluate_value(node.value)
            return getattr(value, node.attr)
        if isinstance(node, ast.Subscript):
            value = self._evaluate_value(node.value)
            if isinstance(node.slice, ast.Slice):
                start = self._evaluate_value(node.slice.lower) if node.slice.lower else None
                stop = self._evaluate_value(node.slice.upper) if node.slice.upper else None
                step = self._evaluate_value(node.slice.step) if node.slice.step else None
                return value[slice(start, stop, step)]
            index = self._evaluate_value(node.slice)
            return value[index]
        return node

    def _evaluate_call(self, node: ast.Call) -> Any:
        func = self._evaluate_callable(node.func)
        args = [self._evaluate_value(arg) for arg in node.args]
        kwargs = {kw.arg: self._evaluate_value(kw.value) for kw in node.keywords if kw.arg}
        args = [self._unwrap(arg) for arg in args]
        kwargs = {key: self._unwrap(value) for key, value in kwargs.items()}
        result = func(*args, **kwargs)
        return result

    def _evaluate_callable(self, node: ast.AST):
        if isinstance(node, ast.Name):
            if node.id in self._functions:
                return self._functions[node.id]
            return self._functions.get(node.id)
        if isinstance(node, ast.Attribute):
            value = self._evaluate_value(node.value)
            return getattr(value, node.attr)
        raise ValueError("Unsupported callable in alert expression")

    def _unwrap(self, value: Any) -> Any:
        if isinstance(value, AlertResult):
            return value.value
        return value

    def _count(self, value: Any, **kwargs: Any) -> int:
        if isinstance(value, FieldValue):
            return value.count(
                include_blank=kwargs.get("include_blank", True),
                distinct=kwargs.get("distinct", False),
                ignore_case=kwargs.get("ignore_case", True),
            )
        if isinstance(value, (list, tuple, set)):
            return len(value)
        return int(bool(value))

    def _distinct(self, value: Any, **kwargs: Any) -> Any:
        if isinstance(value, FieldValue):
            return value.distinct(
                ignore_case=kwargs.get("ignore_case", True),
                include_blank=kwargs.get("include_blank", False),
            )
        if isinstance(value, (list, tuple, set)):
            return list(dict.fromkeys(value))
        return value

    def _has_duplicates(self, value: Any, **kwargs: Any) -> AlertResult:
        if isinstance(value, FieldValue):
            return value.duplicates(
                ignore_case=kwargs.get("ignore_case", True),
                include_blank=kwargs.get("include_blank", False),
            )
        if isinstance(value, (list, tuple, set)):
            seen: Set[Any] = set()
            duplicates_found: List[AlertMatch] = []
            for item in value:
                key = _normalize_string(item) if kwargs.get("ignore_case", True) and isinstance(item, str) else item
                if key in seen:
                    duplicates_found.append(AlertMatch(object_key="", record_key="", record_id=None, value=item))
                else:
                    seen.add(key)
            return AlertResult(bool(duplicates_found), duplicates_found)
        return AlertResult(False, [])


def duplicates(
    records: Sequence[Dict[str, Any]],
    keys: Sequence[str] | str,
    *,
    ignore_case: bool = True,
    include_blank: bool = False,
    require_difference: Optional[Sequence[str]] = None,
) -> AlertResult:
    if isinstance(keys, str):
        key_fields = [keys]
    else:
        key_fields = [field for field in keys if isinstance(field, str) and field]
    if not key_fields:
        return AlertResult(False, [])
    diff_fields: List[str] = []
    if require_difference:
        diff_fields = [field for field in require_difference if isinstance(field, str) and field]
    groups: Dict[Tuple[Any, ...], List[Dict[str, Any]]] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        values: List[Any] = []
        skip = False
        for field in key_fields:
            value = record.get(field)
            if not include_blank and _is_blank_value(value):
                skip = True
                break
            if ignore_case and isinstance(value, str):
                values.append(_normalize_string(value))
            else:
                values.append(value)
        if skip:
            continue
        groups.setdefault(tuple(values), []).append(record)
    matches: List[AlertMatch] = []
    for grouped_records in groups.values():
        if len(grouped_records) <= 1:
            continue
        if diff_fields:
            has_difference = False
            for i in range(len(grouped_records)):
                for j in range(i + 1, len(grouped_records)):
                    for field in diff_fields:
                        left = grouped_records[i].get(field)
                        right = grouped_records[j].get(field)
                        if ignore_case and isinstance(left, str) and isinstance(right, str):
                            if _normalize_string(left) != _normalize_string(right):
                                has_difference = True
                                break
                        elif left != right:
                            has_difference = True
                            break
                    if has_difference:
                        break
                if has_difference:
                    break
            if not has_difference:
                continue
        for record in grouped_records:
            record_key = str(record.get("__recordKey") or "")
            if not record_key:
                continue
            matches.append(
                AlertMatch(
                    object_key=str(record.get("__objectKey") or ""),
                    record_key=record_key,
                    record_id=record.get("__recordId"),
                    value={field: record.get(field) for field in key_fields},
                )
            )
    return AlertResult(bool(matches), _dedupe_matches(matches))


def run_explorer(org: OrgConfig, account_ids: Sequence[str]) -> ExplorerResult:
    sanitized_ids = _sanitize_account_ids(account_ids)
    if not sanitized_ids:
        raise ValueError("no_valid_ids")

    config = get_config()
    alert_definitions = config.get_alerts()
    results: Dict[str, List[Dict[str, object]]] = {}
    warnings: Dict[str, str] = {}

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
        "alerts": [alert.to_dict() for alert in alert_definitions],
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
        }
        account_record_key = _make_record_key("Account", account_record or {"Id": account_id})
        account_payload["recordKey"] = account_record_key
        account_payload["alerts"] = []
        account_payload["alertIds"] = []
        account_related_map: Dict[str, List[Dict[str, object]]] = {}
        for obj in configured_objects:
            key = obj["key"]
            definition = _OBJECT_DEFINITIONS.get(key, {})
            _, display_fields = _build_query_fields(org, key, config)
            related_records: List[Dict[str, object]]
            if key == "Contact":
                related_records = contact_by_account.get(account_id, [])
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
            account_related_map[key] = list(related_records)
            payload_records = []
            for record in related_records:
                if not record:
                    continue
                record_key = _make_record_key(key, record)
                payload_records.append(
                    {
                        "id": record.get("Id"),
                        "recordKey": record_key,
                        "alerts": [],
                        "fields": _record_to_field_list(
                            display_fields,
                            record,
                            extra_fields=_get_object_link_fields(key),
                        ),
                    }
                )
            account_payload["related"][key] = payload_records

        if alert_definitions:
            evaluator = AlertExpressionEvaluator(
                AlertEvaluationContext(account_id, account_record, account_related_map)
            )
            record_alert_map: Dict[str, Dict[str, Set[str]]] = {}
            account_alerts: List[Dict[str, Any]] = []
            account_alert_ids: Set[str] = set()
            for alert in alert_definitions:
                result = evaluator.evaluate(alert.expression)
                if not result.value:
                    continue
                matches = _dedupe_matches(result.matches)
                match_payload: List[Dict[str, Any]] = []
                for match in matches:
                    match_payload.append(
                        {
                            "object": match.object_key,
                            "recordKey": match.record_key,
                            "recordId": match.record_id,
                            "field": match.field_name,
                        }
                    )
                    if match.object_key and match.record_key:
                        record_alert_map.setdefault(match.object_key, {}).setdefault(
                            match.record_key, set()
                        ).add(alert.id)
                    if match.object_key == "Account" and match.record_key == account_record_key:
                        account_alert_ids.add(alert.id)
                account_alert_ids.add(alert.id)
                account_alerts.append(
                    {
                        "id": alert.id,
                        "label": alert.label,
                        "description": alert.description,
                        "expression": alert.expression,
                        "matches": match_payload,
                    }
                )
            if account_alerts:
                alert_lookup = {entry["id"]: entry for entry in account_alerts}
                for object_key, records in account_payload["related"].items():
                    if not isinstance(records, list):
                        continue
                    for record_entry in records:
                        record_key = record_entry.get("recordKey")
                        if not record_key:
                            continue
                        alert_ids = sorted(
                            record_alert_map.get(object_key, {}).get(record_key, [])
                        )
                        if not alert_ids:
                            continue
                        record_entry["alerts"] = [
                            {
                                "id": alert_id,
                                "label": alert_lookup[alert_id]["label"],
                                "description": alert_lookup[alert_id].get("description"),
                            }
                            for alert_id in alert_ids
                            if alert_id in alert_lookup
                        ]
                account_payload["alerts"] = account_alerts
                account_payload["alertIds"] = sorted(account_alert_ids)
            else:
                account_payload["alerts"] = []
                account_payload["alertIds"] = []

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
