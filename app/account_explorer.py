from __future__ import annotations

import json
import logging
import re
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, MutableMapping, Optional, Sequence, Set, Tuple

from flask import session

from . import data_import
from .salesforce import SalesforceError, describe_sobject, query_all
from .storage import DATA_DIR, OrgConfig

ACCOUNT_EXPLORER_SESSION_KEY = "account_explorer_session_id"
MAX_ACCOUNT_IDS = 200
MAX_FIELDS_PER_OBJECT = 5
CONFIG_FILE = DATA_DIR / "account_explorer_config.json"
RESULTS_DIR = DATA_DIR / "account_explorer_results"

_ALERT_OPERATORS: Dict[str, str] = {
    "equals": "equals",
    "equals_ignore_case": "equals_ignore_case",
    "not_equals": "not_equals",
    "contains": "contains",
    "not_contains": "not_contains",
    "starts_with": "starts_with",
    "blank": "blank",
    "not_blank": "not_blank",
    "null": "null",
    "not_null": "not_null",
}

_ALERT_VALUELESS_OPERATORS: Set[str] = {"blank", "not_blank", "null", "not_null"}

_ADVANCED_GROUP_LOGIC: Set[str] = {"and", "or"}
_ADVANCED_SCOPE_MATCHES: Set[str] = {"any", "all", "none", "not_all"}
_ADVANCED_AGGREGATE_OPERATIONS: Set[str] = {"duplicates"}


def _sanitize_contact_point_sources(raw: object) -> Dict[str, Dict[str, bool]]:
    sanitized: Dict[str, Dict[str, bool]] = {}
    if not isinstance(raw, dict):
        return sanitized
    for object_key, value in raw.items():
        if object_key not in _CONTACT_POINT_OBJECTS:
            continue
        if not isinstance(value, dict):
            continue
        entry: Dict[str, bool] = {}
        for source_key in _CONTACT_POINT_SOURCE_KEYS:
            raw_value = value.get(source_key)
            if isinstance(raw_value, bool):
                entry[source_key] = raw_value
        if entry:
            sanitized[object_key] = entry
    return sanitized


def _sanitize_advanced_node(node: object) -> Optional[Dict[str, object]]:
    if not isinstance(node, dict):
        return None
    node_type = str(node.get("type") or "").strip().lower()
    if node_type == "group":
        logic = str(node.get("logic") or "and").strip().lower()
        if logic not in _ADVANCED_GROUP_LOGIC:
            logic = "and"
        children_payload = node.get("children") if isinstance(node.get("children"), list) else []
        children: List[Dict[str, object]] = []
        for child in children_payload:
            sanitized_child = _sanitize_advanced_node(child)
            if sanitized_child:
                children.append(sanitized_child)
        if not children:
            return None
        return {"type": "group", "logic": logic, "children": children}
    if node_type == "condition":
        object_key = str(node.get("object") or "").strip()
        field_name = str(node.get("field") or "").strip()
        operator = str(node.get("operator") or "").strip()
        if not object_key or not field_name or operator not in _ALERT_OPERATORS:
            return None
        entry: Dict[str, object] = {
            "type": "condition",
            "object": object_key,
            "field": field_name,
            "operator": operator,
        }
        if operator not in _ALERT_VALUELESS_OPERATORS:
            value = node.get("value")
            if not isinstance(value, str):
                value = str(value) if value is not None else ""
            value = value.strip()
            if not value:
                return None
            entry["value"] = value
        return entry
    if node_type == "scope":
        object_key = str(node.get("object") or "").strip()
        match = str(node.get("match") or "").strip().lower()
        if not object_key or match not in _ADVANCED_SCOPE_MATCHES:
            return None
        children_payload = node.get("children") if isinstance(node.get("children"), list) else []
        children: List[Dict[str, object]] = []
        for child in children_payload:
            sanitized_child = _sanitize_advanced_node(child)
            if not sanitized_child:
                continue
            if sanitized_child.get("type") == "scope":
                continue
            if sanitized_child.get("type") not in {"condition", "group"}:
                continue
            children.append(sanitized_child)
        if not children:
            return None
        return {"type": "scope", "object": object_key, "match": match, "children": children}
    if node_type == "aggregate":
        operation = str(node.get("operation") or "").strip().lower()
        if operation not in _ADVANCED_AGGREGATE_OPERATIONS:
            return None
        object_key = str(node.get("object") or "").strip()
        if not object_key:
            return None
        if operation == "duplicates":
            field_name = str(node.get("field") or "").strip()
            if not field_name:
                return None
            min_count_raw = node.get("minCount")
            try:
                min_count = int(min_count_raw)
            except (TypeError, ValueError):
                min_count = 2
            if min_count < 2:
                min_count = 2
            entry = {
                "type": "aggregate",
                "operation": "duplicates",
                "object": object_key,
                "field": field_name,
                "minCount": min_count,
            }
            distinct_field = node.get("distinctField")
            if isinstance(distinct_field, str) and distinct_field.strip():
                entry["distinctField"] = distinct_field.strip()
            criteria_payload = node.get("criteria") if isinstance(node.get("criteria"), dict) else None
            if criteria_payload:
                criteria = _sanitize_advanced_node(criteria_payload)
                if criteria and criteria.get("type") in {"condition", "group"}:
                    entry["criteria"] = criteria
            return entry
    return None


def _sanitize_advanced_alert_definition(raw: object) -> Optional[Dict[str, object]]:
    if not isinstance(raw, dict):
        return None
    sanitized = _sanitize_advanced_node(raw)
    return sanitized


def _sanitize_alert_definitions(raw_alerts: Sequence[object]) -> List[Dict[str, object]]:
    sanitized: List[Dict[str, object]] = []
    seen_ids: Set[str] = set()
    for alert in raw_alerts or []:
        if not isinstance(alert, dict):
            continue
        alert_id = str(alert.get("id") or uuid.uuid4())
        if alert_id in seen_ids:
            continue
        label = str(alert.get("label") or "").strip()
        mode_raw = alert.get("mode")
        mode = str(mode_raw or "").strip().lower() if isinstance(mode_raw, str) else ""
        advanced_payload = alert.get("advanced") if isinstance(alert.get("advanced"), dict) else None
        if mode == "advanced" or advanced_payload:
            advanced_definition = _sanitize_advanced_alert_definition(advanced_payload or alert.get("advanced"))
            if not advanced_definition:
                continue
            sanitized.append(
                {
                    "id": alert_id,
                    "label": label or alert_id,
                    "mode": "advanced",
                    "advanced": advanced_definition,
                }
            )
            seen_ids.add(alert_id)
            continue
        filters_payload = alert.get("filters") if isinstance(alert.get("filters"), list) else []
        filters: List[Dict[str, object]] = []
        for item in filters_payload:
            if not isinstance(item, dict):
                continue
            object_key = str(item.get("object") or "").strip()
            field_name = str(item.get("field") or "").strip()
            operator = str(item.get("operator") or "").strip()
            if not object_key or not field_name or operator not in _ALERT_OPERATORS:
                continue
            value = item.get("value")
            if operator not in _ALERT_VALUELESS_OPERATORS:
                if not isinstance(value, str):
                    value = str(value) if value is not None else ""
                value = value.strip()
                if not value:
                    continue
                entry = {
                    "object": object_key,
                    "field": field_name,
                    "operator": operator,
                    "value": value,
                }
            else:
                entry = {
                    "object": object_key,
                    "field": field_name,
                    "operator": operator,
                }
            filters.append(entry)
        if not filters:
            continue
        sanitized.append({"id": alert_id, "label": label or alert_id, "filters": filters})
        seen_ids.add(alert_id)
    return sanitized

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
_CONTACT_POINT_SOURCE_ORDER: List[str] = ["contact", "individual"]
_CONTACT_POINT_SOURCE_KEYS: Set[str] = set(_CONTACT_POINT_SOURCE_ORDER)
_DEFAULT_CONTACT_POINT_SOURCES: Dict[str, bool] = {
    "contact": True,
    "individual": True,
}


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
        "required_fields": [],
        "contact_field": "Contact__c",
        "individual_field": "ParentId",
    },
    "ContactPointEmail": {
        "label": "Contact Point Email",
        "required_fields": [],
        "contact_field": "Contact__c",
        "individual_field": "ParentId",
    },
}

_DIRECT_OBJECTS: List[str] = [
    "BillingProfile__c",
    "Contract",
    "Contact",
    "AccountContactRelation",
    "Case",
    "Order",
    "Sale__c",
]

_CONTACT_POINT_OBJECTS: List[str] = ["ContactPointPhone", "ContactPointEmail"]

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
class ExplorerConfig:
    fields: Dict[str, List[str]] = field(default_factory=dict)
    objects: List[Dict[str, object]] = field(default_factory=list)
    alerts: List[Dict[str, object]] = field(default_factory=list)
    contact_point_sources: Dict[str, Dict[str, bool]] = field(default_factory=dict)
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
            "alerts": self.get_alerts(),
            "contactPointSources": {
                object_key: self.get_contact_point_sources(object_key)
                for object_key in _CONTACT_POINT_OBJECTS
            },
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

    def get_alerts(self) -> List[Dict[str, object]]:
        return _sanitize_alert_definitions(self.alerts)

    def get_contact_point_sources(self, object_key: str) -> Dict[str, bool]:
        sources = dict(_DEFAULT_CONTACT_POINT_SOURCES)
        raw = self.contact_point_sources.get(object_key)
        if isinstance(raw, dict):
            for key in _CONTACT_POINT_SOURCE_KEYS:
                if key in raw:
                    sources[key] = bool(raw[key])
        return sources


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


@dataclass
class AdvancedMatch:
    object_key: str
    record_key: str
    record: Dict[str, object]
    fields: List[Dict[str, object]] = field(default_factory=list)
    message: Optional[str] = None


@dataclass
class AdvancedEvaluationResult:
    passed: bool
    matches: List[AdvancedMatch] = field(default_factory=list)


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
            contact_point_sources={},
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
                contact_point_sources={},
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
        updated_at = data.get("updatedAt") if isinstance(data, dict) else None
        alerts_payload = data.get("alerts") if isinstance(data, dict) else []
        alerts = _sanitize_alert_definitions(alerts_payload if isinstance(alerts_payload, Sequence) else [])
        contact_point_sources_raw = (
            data.get("contactPointSources") if isinstance(data, dict) else {}
        )
        contact_point_sources = _sanitize_contact_point_sources(contact_point_sources_raw)
        return ExplorerConfig(
            fields=result,
            objects=objects,
            alerts=alerts,
            contact_point_sources=contact_point_sources,
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
        "alerts": config.get_alerts(),
        "contactPointSources": _sanitize_contact_point_sources(
            config.contact_point_sources
        ),
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
    sanitized_alerts: List[Dict[str, object]] = existing.get_alerts()
    contact_point_sources: Dict[str, Dict[str, bool]] = dict(
        existing.contact_point_sources
    )
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
        sanitized_alerts = _sanitize_alert_definitions(alerts_payload)

    if "contactPointSources" in payload:
        raw_sources = payload.get("contactPointSources")
        if isinstance(raw_sources, dict):
            contact_point_sources = _sanitize_contact_point_sources(raw_sources)
        else:
            contact_point_sources = dict(existing.contact_point_sources)

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
        contact_point_sources=contact_point_sources,
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
    alerts_config = config.get_alerts()
    alert_object_keys = _get_alert_object_keys(alerts_config)
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
    alert_details: Optional[Dict[str, List[Dict[str, object]]]] = None,
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
        if alert_details and field in alert_details:
            details = [detail for detail in alert_details.get(field, []) if isinstance(detail, dict)]
            if details:
                entry["alertDetails"] = details
                alert_ids: List[str] = []
                for detail in details:
                    alert_id = detail.get("id")
                    if isinstance(alert_id, str) and alert_id not in alert_ids:
                        alert_ids.append(alert_id)
                if alert_ids:
                    entry["alerts"] = alert_ids
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


def _add_contact_point_source(record: Dict[str, object], source: str) -> None:
    if source not in _CONTACT_POINT_SOURCE_KEYS:
        return
    raw_sources = record.get("__linkSources")
    existing: Set[str] = set()
    if isinstance(raw_sources, list):
        for item in raw_sources:
            if isinstance(item, str) and item in _CONTACT_POINT_SOURCE_KEYS:
                existing.add(item)
    elif isinstance(raw_sources, str) and raw_sources in _CONTACT_POINT_SOURCE_KEYS:
        existing.add(raw_sources)
    existing.add(source)
    if existing:
        record["__linkSources"] = [
            value for value in _CONTACT_POINT_SOURCE_ORDER if value in existing
        ]


def _get_contact_point_source_list(record: Dict[str, object]) -> List[str]:
    raw_sources = record.get("__linkSources")
    if isinstance(raw_sources, list):
        result: List[str] = []
        for item in raw_sources:
            if isinstance(item, str) and item in _CONTACT_POINT_SOURCE_KEYS and item not in result:
                result.append(item)
        return result
    if isinstance(raw_sources, str) and raw_sources in _CONTACT_POINT_SOURCE_KEYS:
        return [raw_sources]
    return []


def _get_contact_point_sources(record: Dict[str, object]) -> Set[str]:
    return set(_get_contact_point_source_list(record))


def _store_contact_point_record(
    records_by_id: MutableMapping[str, Dict[str, object]],
    record: Dict[str, object],
    source: str,
) -> None:
    if not isinstance(record, dict) or source not in _CONTACT_POINT_SOURCE_KEYS:
        return
    record_id = record.get("Id")
    if not record_id:
        return
    record_id_str = str(record_id)
    if record_id_str in records_by_id:
        existing = records_by_id[record_id_str]
        for key, value in record.items():
            if key == "__linkSources":
                continue
            existing[key] = value
        _add_contact_point_source(existing, source)
    else:
        new_record = {key: value for key, value in record.items() if key != "__linkSources"}
        _add_contact_point_source(new_record, source)
        records_by_id[record_id_str] = new_record


def _aggregate_contact_points(
    contact_points: Sequence[Dict[str, object]],
    contact_field: Optional[str] = None,
    individual_field: Optional[str] = None,
    active_sources: Optional[Set[str]] = None,
) -> Dict[str, MutableMapping[str, List[Dict[str, object]]]]:
    mapping: Dict[str, MutableMapping[str, List[Dict[str, object]]]] = {
        "contact": {},
        "individual": {},
    }
    allowed_sources = (
        {source for source in (active_sources or _CONTACT_POINT_SOURCE_KEYS) if source in _CONTACT_POINT_SOURCE_KEYS}
        or set(_CONTACT_POINT_SOURCE_KEYS)
    )
    contact_candidates: List[str] = []
    for field in (contact_field, "ContactId", "Contact__c", "ParentId"):
        if isinstance(field, str) and field and field not in contact_candidates:
            contact_candidates.append(field)
    individual_candidates: List[str] = []
    for field in (individual_field, "IndividualId", "Individual__c"):
        if isinstance(field, str) and field and field not in individual_candidates:
            individual_candidates.append(field)
    for record in contact_points:
        if not isinstance(record, dict):
            continue
        record_sources = _get_contact_point_sources(record)
        if not record_sources:
            record_sources = set(allowed_sources)
        if "contact" in allowed_sources and "contact" in record_sources:
            for field in contact_candidates:
                contact_id = record.get(field)
                if contact_id:
                    mapping["contact"].setdefault(str(contact_id), []).append(record)
                    break
        if "individual" in allowed_sources and "individual" in record_sources:
            for field in individual_candidates:
                individual_id = record.get(field)
                if individual_id:
                    mapping["individual"].setdefault(str(individual_id), []).append(record)
                    break
    return mapping


def _prepare_records_with_keys(
    object_key: str, records: Sequence[Dict[str, object]]
) -> List[Tuple[str, Dict[str, object]]]:
    prepared: List[Tuple[str, Dict[str, object]]] = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        record_id = record.get("Id")
        if record_id:
            record_key = str(record_id)
        else:
            record_key = f"{object_key}:{index}"
        prepared.append((record_key, record))
    return prepared


def _stringify_alert_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _matches_alert_condition(value: object, operator: str, target: Optional[str]) -> bool:
    if operator == "equals":
        if value is None:
            return False
        return str(value) == (target or "")
    if operator == "equals_ignore_case":
        if value is None:
            return False
        return str(value).lower() == (target or "").lower()
    if operator == "not_equals":
        if value is None:
            return (target or "") != ""
        return str(value) != (target or "")
    if operator == "contains":
        if value is None:
            return False
        return (target or "") in str(value)
    if operator == "not_contains":
        if value is None:
            return True
        return (target or "") not in str(value)
    if operator == "starts_with":
        if value is None:
            return False
        return str(value).startswith(target or "")
    if operator == "blank":
        if value is None:
            return True
        return str(value).strip() == ""
    if operator == "not_blank":
        if value is None:
            return False
        return str(value).strip() != ""
    if operator == "null":
        return value is None
    if operator == "not_null":
        return value is not None
    return False


def _evaluate_alert_filters_for_record(
    record: Dict[str, object], filters: Sequence[Dict[str, object]]
) -> Optional[List[Dict[str, object]]]:
    matched_fields: List[Dict[str, object]] = []
    for filter_definition in filters:
        field_name = filter_definition.get("field")
        operator = filter_definition.get("operator")
        if not isinstance(field_name, str) or not isinstance(operator, str):
            return None
        value = record.get(field_name)
        target = filter_definition.get("value") if operator not in _ALERT_VALUELESS_OPERATORS else None
        target_str = target if isinstance(target, str) else (str(target) if target is not None else None)
        if not _matches_alert_condition(value, operator, target_str):
            return None
        matched_fields.append(
            {
                "name": field_name,
                "operator": operator,
                "filterValue": target_str,
                "actualValue": _stringify_alert_value(value),
            }
        )
    return matched_fields


def _convert_advanced_matches(matches: Sequence[AdvancedMatch]) -> List[Dict[str, object]]:
    merged: Dict[Tuple[str, str], AdvancedMatch] = {}
    for match in matches or []:
        if not isinstance(match, AdvancedMatch):
            continue
        object_key = match.object_key or "Account"
        record_key = match.record_key or ""
        if not record_key:
            continue
        key = (object_key, record_key)
        if key not in merged:
            merged[key] = AdvancedMatch(
                object_key=object_key,
                record_key=record_key,
                record=match.record,
                fields=list(match.fields or []),
                message=match.message,
            )
        else:
            merged[key].fields.extend(match.fields or [])
            if match.message:
                if merged[key].message and match.message not in merged[key].message:
                    merged[key].message = f"{merged[key].message}; {match.message}"
                elif not merged[key].message:
                    merged[key].message = match.message
    converted: List[Dict[str, object]] = []
    for combined in merged.values():
        record = combined.record if isinstance(combined.record, dict) else {}
        record_id = record.get("Id") if isinstance(record, dict) else None
        if record_id is not None and not isinstance(record_id, str):
            record_id = str(record_id)
        fields_payload: List[Dict[str, object]] = []
        for field_entry in combined.fields:
            if not isinstance(field_entry, dict):
                continue
            name = str(field_entry.get("name") or "")
            operator = str(field_entry.get("operator") or "")
            filter_value = field_entry.get("filterValue")
            if filter_value is not None and not isinstance(filter_value, str):
                filter_value = str(filter_value)
            actual_value = field_entry.get("actualValue")
            actual_value_str = _stringify_alert_value(actual_value)
            entry: Dict[str, object] = {
                "name": name,
                "operator": operator,
                "filterValue": filter_value,
                "actualValue": actual_value_str,
            }
            if "matched" in field_entry:
                entry["matched"] = bool(field_entry.get("matched"))
            if "message" in field_entry and field_entry.get("message"):
                entry["message"] = str(field_entry.get("message"))
            fields_payload.append(entry)
        converted_entry: Dict[str, object] = {
            "object": combined.object_key,
            "recordId": record_id,
            "recordKey": combined.record_key,
            "fields": fields_payload,
        }
        if combined.message:
            converted_entry["message"] = combined.message
        converted.append(converted_entry)
    return converted


def _format_scope_summary_message(object_key: str, match: str) -> str:
    if match == "any":
        return f"At least one {object_key} record matched the criteria."
    if match == "all":
        return f"All {object_key} records matched the criteria."
    if match == "not_all":
        return f"At least one {object_key} record failed the criteria."
    if match == "none":
        return f"No {object_key} records matched the criteria."
    return ""


def _iter_records_for_object(
    object_key: str,
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
) -> List[Tuple[str, Dict[str, object]]]:
    if object_key == "Account":
        return [account_pair]
    return records_by_object.get(object_key, [])


def _evaluate_advanced_condition(
    node: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
    context: Optional[Tuple[str, str, Dict[str, object]]],
) -> AdvancedEvaluationResult:
    if not context:
        return AdvancedEvaluationResult(False, [])
    context_object, record_key, record = context
    node_object = node.get("object")
    if context_object != node_object or not isinstance(record, dict):
        return AdvancedEvaluationResult(False, [])
    field_name = node.get("field")
    operator = node.get("operator")
    if not isinstance(field_name, str) or not isinstance(operator, str):
        return AdvancedEvaluationResult(False, [])
    target = node.get("value") if operator not in _ALERT_VALUELESS_OPERATORS else None
    target_str = target if isinstance(target, str) else (str(target) if target is not None else None)
    value = record.get(field_name)
    matched = _matches_alert_condition(value, operator, target_str)
    field_entry: Dict[str, object] = {
        "name": field_name,
        "operator": operator,
        "filterValue": target_str,
        "actualValue": value,
        "matched": matched,
    }
    return AdvancedEvaluationResult(
        matched,
        [AdvancedMatch(context_object, record_key, record, [field_entry])],
    )


def _evaluate_advanced_group(
    node: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
    context: Optional[Tuple[str, str, Dict[str, object]]],
) -> AdvancedEvaluationResult:
    logic = node.get("logic") if isinstance(node.get("logic"), str) else "and"
    children = node.get("children") if isinstance(node.get("children"), list) else []
    matches: List[AdvancedMatch] = []
    if logic == "or":
        passed = False
        for child in children:
            if not isinstance(child, dict):
                continue
            result = _evaluate_advanced_node(child, account_pair, records_by_object, context)
            matches.extend(result.matches)
            if result.passed:
                passed = True
        return AdvancedEvaluationResult(passed, matches)
    passed = True
    for child in children:
        if not isinstance(child, dict):
            continue
        result = _evaluate_advanced_node(child, account_pair, records_by_object, context)
        matches.extend(result.matches)
        if not result.passed:
            passed = False
    return AdvancedEvaluationResult(passed, matches)


def _evaluate_advanced_scope(
    node: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
    context: Optional[Tuple[str, str, Dict[str, object]]],
) -> AdvancedEvaluationResult:
    object_key = node.get("object") if isinstance(node.get("object"), str) else ""
    match_type = node.get("match") if isinstance(node.get("match"), str) else "any"
    children = node.get("children") if isinstance(node.get("children"), list) else []
    records = _iter_records_for_object(object_key, account_pair, records_by_object)
    record_results: List[Tuple[str, Dict[str, object], bool, List[AdvancedMatch]]] = []
    for record_key, record in records:
        record_context = (object_key, record_key, record)
        record_matches: List[AdvancedMatch] = []
        record_passed = True
        for child in children:
            if not isinstance(child, dict):
                continue
            result = _evaluate_advanced_node(child, account_pair, records_by_object, record_context)
            record_matches.extend(result.matches)
            if not result.passed:
                record_passed = False
        record_results.append((record_key, record, record_passed, record_matches))
    matches: List[AdvancedMatch] = []
    if match_type == "any":
        passed = any(item[2] for item in record_results)
        if passed:
            for record_key, record, record_passed, record_matches in record_results:
                if not record_passed:
                    continue
                if record_matches:
                    matches.extend(record_matches)
                else:
                    matches.append(AdvancedMatch(object_key, record_key, record, []))
    elif match_type == "all":
        passed = bool(record_results) and all(item[2] for item in record_results)
        if passed:
            for record_key, record, _, record_matches in record_results:
                if record_matches:
                    matches.extend(record_matches)
                else:
                    matches.append(AdvancedMatch(object_key, record_key, record, []))
    elif match_type == "none":
        passed = not any(item[2] for item in record_results)
        if passed:
            summary = _format_scope_summary_message(object_key, match_type)
            if summary:
                matches.append(
                    AdvancedMatch(
                        "Account",
                        account_pair[0],
                        account_pair[1],
                        [
                            {
                                "name": object_key,
                                "operator": match_type,
                                "filterValue": None,
                                "actualValue": summary,
                                "matched": True,
                                "message": summary,
                            }
                        ],
                        message=summary,
                    )
                )
    elif match_type == "not_all":
        passed = bool(record_results) and any(not item[2] for item in record_results)
        if passed:
            for record_key, record, record_passed, record_matches in record_results:
                if record_passed:
                    continue
                if record_matches:
                    matches.extend(record_matches)
                else:
                    matches.append(AdvancedMatch(object_key, record_key, record, []))
    else:
        passed = False
    if passed and not matches and match_type != "none":
        summary = _format_scope_summary_message(object_key, match_type)
        if summary:
            matches.append(
                AdvancedMatch(
                    "Account",
                    account_pair[0],
                    account_pair[1],
                    [
                        {
                            "name": object_key,
                            "operator": match_type,
                            "filterValue": None,
                            "actualValue": summary,
                            "matched": True,
                            "message": summary,
                        }
                    ],
                    message=summary,
                )
            )
    return AdvancedEvaluationResult(passed, matches)


def _evaluate_advanced_aggregate(
    node: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
    context: Optional[Tuple[str, str, Dict[str, object]]],
) -> AdvancedEvaluationResult:
    object_key = node.get("object") if isinstance(node.get("object"), str) else ""
    operation = node.get("operation") if isinstance(node.get("operation"), str) else ""
    if operation != "duplicates":
        return AdvancedEvaluationResult(False, [])
    field_name = node.get("field") if isinstance(node.get("field"), str) else ""
    if not object_key or not field_name:
        return AdvancedEvaluationResult(False, [])
    min_count = node.get("minCount")
    try:
        min_count_value = int(min_count)
    except (TypeError, ValueError):
        min_count_value = 2
    if min_count_value < 2:
        min_count_value = 2
    distinct_field = node.get("distinctField") if isinstance(node.get("distinctField"), str) else ""
    records = _iter_records_for_object(object_key, account_pair, records_by_object)
    if not records:
        return AdvancedEvaluationResult(False, [])
    criteria_node = node.get("criteria") if isinstance(node.get("criteria"), dict) else None
    filtered: List[Tuple[str, Dict[str, object], List[Dict[str, object]]]] = []
    for record_key, record in records:
        if not isinstance(record, dict):
            continue
        criteria_fields: List[Dict[str, object]] = []
        if criteria_node:
            result = _evaluate_advanced_node(
                criteria_node,
                account_pair,
                records_by_object,
                (object_key, record_key, record),
            )
            if not result.passed:
                continue
            for match in result.matches:
                if isinstance(match, AdvancedMatch) and match.fields:
                    criteria_fields.extend(match.fields)
        filtered.append((record_key, record, criteria_fields))
    if not filtered:
        return AdvancedEvaluationResult(False, [])
    grouped: Dict[str, List[Tuple[str, Dict[str, object], List[Dict[str, object]]]]] = {}
    for record_key, record, criteria_fields in filtered:
        value = record.get(field_name)
        if value is None:
            continue
        value_str = _stringify_alert_value(value)
        if not value_str:
            continue
        grouped.setdefault(value_str, []).append((record_key, record, criteria_fields))
    matches: List[AdvancedMatch] = []
    passed = False
    for group_value, entries in grouped.items():
        if len(entries) < min_count_value:
            continue
        if distinct_field:
            distinct_values: Set[str] = set()
            for _, record, _ in entries:
                distinct_value = record.get(distinct_field)
                if distinct_value is None:
                    continue
                distinct_str = _stringify_alert_value(distinct_value)
                if distinct_str:
                    distinct_values.add(distinct_str)
            if len(distinct_values) < 2:
                continue
        passed = True
        message = (
            f"{len(entries)} {object_key} records share {field_name} '{group_value}'"
        )
        for record_key, record, criteria_fields in entries:
            field_entries: List[Dict[str, object]] = []
            for criteria_field in criteria_fields:
                if isinstance(criteria_field, dict):
                    field_entries.append(dict(criteria_field))
            field_entries.append(
                {
                    "name": field_name,
                    "operator": "duplicates",
                    "filterValue": group_value,
                    "actualValue": record.get(field_name),
                    "matched": True,
                }
            )
            if distinct_field:
                field_entries.append(
                    {
                        "name": distinct_field,
                        "operator": "distinct",
                        "filterValue": None,
                        "actualValue": record.get(distinct_field),
                        "matched": True,
                    }
                )
            matches.append(AdvancedMatch(object_key, record_key, record, field_entries, message=message))
    if not passed:
        return AdvancedEvaluationResult(False, [])
    return AdvancedEvaluationResult(True, matches)


def _evaluate_advanced_node(
    node: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
    context: Optional[Tuple[str, str, Dict[str, object]]],
) -> AdvancedEvaluationResult:
    if not isinstance(node, dict):
        return AdvancedEvaluationResult(False, [])
    node_type = node.get("type")
    if node_type == "condition":
        return _evaluate_advanced_condition(node, account_pair, records_by_object, context)
    if node_type == "group":
        return _evaluate_advanced_group(node, account_pair, records_by_object, context)
    if node_type == "scope":
        return _evaluate_advanced_scope(node, account_pair, records_by_object, context)
    if node_type == "aggregate":
        return _evaluate_advanced_aggregate(node, account_pair, records_by_object, context)
    return AdvancedEvaluationResult(False, [])


def _evaluate_advanced_alert(
    advanced_definition: Dict[str, object],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
) -> List[Dict[str, object]]:
    context = ("Account", account_pair[0], account_pair[1])
    result = _evaluate_advanced_node(advanced_definition, account_pair, records_by_object, context)
    if not result.passed:
        return []
    return _convert_advanced_matches(result.matches)


def _evaluate_alerts_for_account(
    alerts: Sequence[Dict[str, object]],
    account_pair: Tuple[str, Dict[str, object]],
    records_by_object: MutableMapping[str, List[Tuple[str, Dict[str, object]]]],
) -> Tuple[
    List[Dict[str, object]],
    Dict[str, Dict[str, List[Dict[str, object]]]],
    Dict[str, Dict[str, Dict[str, List[Dict[str, object]]]]],
]:
    triggered_alerts: List[Dict[str, object]] = []
    record_alert_details: Dict[str, Dict[str, List[Dict[str, object]]]] = {}
    field_alert_details: Dict[str, Dict[str, Dict[str, List[Dict[str, object]]]]] = {}
    account_key, account_record = account_pair
    for alert in alerts:
        if not isinstance(alert, dict):
            continue
        mode = str(alert.get("mode") or "").strip().lower()
        alert_matches: List[Dict[str, object]] = []
        filters_payload = alert.get("filters")
        if mode == "advanced":
            advanced_definition = alert.get("advanced") if isinstance(alert.get("advanced"), dict) else None
            if not advanced_definition:
                continue
            alert_matches = _evaluate_advanced_alert(advanced_definition, account_pair, records_by_object)
            if not alert_matches:
                continue
        else:
            if not isinstance(filters_payload, list) or not filters_payload:
                continue
            grouped_filters: Dict[str, List[Dict[str, object]]] = {}
            for filter_definition in filters_payload:
                object_key = filter_definition.get("object")
                if not isinstance(object_key, str) or not object_key:
                    continue
                grouped_filters.setdefault(object_key, []).append(filter_definition)
            if not grouped_filters:
                continue
            alert_failed = False
            for object_key, object_filters in grouped_filters.items():
                if object_key == "Account":
                    candidate_records = [account_pair]
                else:
                    candidate_records = records_by_object.get(object_key, [])
                object_matches: List[Tuple[str, Dict[str, object], List[Dict[str, object]]]] = []
                for record_key, record in candidate_records:
                    matches = _evaluate_alert_filters_for_record(record, object_filters)
                    if matches is not None:
                        object_matches.append((record_key, record, matches))
                if not object_matches:
                    alert_failed = True
                    break
                for record_key, record, matches in object_matches:
                    record_id = record.get("Id") if isinstance(record, dict) else None
                    record_id_str = str(record_id) if record_id else None
                    alert_matches.append(
                        {
                            "object": object_key,
                            "recordId": record_id_str,
                            "recordKey": record_key,
                            "fields": matches,
                        }
                    )
            if alert_failed or not alert_matches:
                continue
        alert_id = str(alert.get("id") or uuid.uuid4())
        label = str(alert.get("label") or "").strip() or alert_id
        if mode == "advanced":
            alert_entry = {
                "id": alert_id,
                "label": label,
                "mode": "advanced",
                "advanced": dict(alert.get("advanced")) if isinstance(alert.get("advanced"), dict) else {},
                "matches": alert_matches,
            }
        else:
            alert_entry = {
                "id": alert_id,
                "label": label,
                "mode": "simple",
                "filters": [dict(item) for item in filters_payload if isinstance(item, dict)],
                "matches": alert_matches,
            }
        triggered_alerts.append(alert_entry)
        for match in alert_matches:
            object_key = match.get("object")
            if not isinstance(object_key, str):
                continue
            record_key = match.get("recordKey")
            if not isinstance(record_key, str) or not record_key:
                if object_key == "Account":
                    record_key = account_key
                else:
                    candidate_records = records_by_object.get(object_key, [])
                    record_key = candidate_records[0][0] if candidate_records else account_key
            record_alert_details.setdefault(object_key, {}).setdefault(record_key, []).append(
                {
                    "id": alert_id,
                    "label": label,
                    "object": object_key,
                    "recordId": match.get("recordId"),
                    "fields": match.get("fields", []),
                }
            )
            field_alert_details.setdefault(object_key, {}).setdefault(record_key, {})
            for field_match in match.get("fields", []):
                field_name = field_match.get("name")
                if not isinstance(field_name, str) or not field_name:
                    continue
                field_alert_details[object_key][record_key].setdefault(field_name, []).append(
                    {
                        "id": alert_id,
                        "label": label,
                        "operator": field_match.get("operator"),
                        "filterValue": field_match.get("filterValue"),
                        "actualValue": field_match.get("actualValue"),
                    }
                )
    return triggered_alerts, record_alert_details, field_alert_details


def _collect_objects_from_advanced(node: object, accumulator: Set[str]) -> None:
    if not isinstance(node, dict):
        return
    node_type = node.get("type")
    if node_type == "condition":
        object_key = node.get("object")
        if isinstance(object_key, str) and object_key:
            accumulator.add(object_key)
        return
    if node_type == "scope":
        object_key = node.get("object")
        if isinstance(object_key, str) and object_key:
            accumulator.add(object_key)
        for child in node.get("children") if isinstance(node.get("children"), list) else []:
            _collect_objects_from_advanced(child, accumulator)
        return
    if node_type == "group":
        for child in node.get("children") if isinstance(node.get("children"), list) else []:
            _collect_objects_from_advanced(child, accumulator)
        return
    if node_type == "aggregate":
        object_key = node.get("object")
        if isinstance(object_key, str) and object_key:
            accumulator.add(object_key)
        criteria = node.get("criteria")
        if isinstance(criteria, dict):
            _collect_objects_from_advanced(criteria, accumulator)


def _get_alert_object_keys(alerts: Sequence[Dict[str, object]]) -> Set[str]:
    object_keys: Set[str] = set()
    for alert in alerts or []:
        if not isinstance(alert, dict):
            continue
        mode = str(alert.get("mode") or "").strip().lower()
        if mode == "advanced":
            advanced_definition = alert.get("advanced") if isinstance(alert.get("advanced"), dict) else None
            if advanced_definition:
                _collect_objects_from_advanced(advanced_definition, object_keys)
            continue
        filters = alert.get("filters") if isinstance(alert.get("filters"), list) else None
        if not isinstance(filters, list):
            continue
        for filter_definition in filters:
            object_key = filter_definition.get("object") if isinstance(filter_definition, dict) else None
            if isinstance(object_key, str) and object_key:
                object_keys.add(object_key)
    return object_keys


def _get_related_records_for_account(
    object_key: str,
    account_id: str,
    *,
    results: Dict[str, List[Dict[str, object]]],
    contact_by_account: MutableMapping[str, List[Dict[str, object]]],
    individual_by_account: MutableMapping[str, Set[str]],
    individual_records: Dict[str, Dict[str, object]],
    contact_point_mappings: Dict[str, Dict[str, MutableMapping[str, List[Dict[str, object]]]]],
) -> List[Dict[str, object]]:
    if object_key == "Contact":
        return list(contact_by_account.get(account_id, []))
    if object_key in _DIRECT_OBJECTS:
        definition = _OBJECT_DEFINITIONS.get(object_key, {})
        filter_field = str(definition.get("filter_field", "AccountId"))
        return _filter_records_by_field(results.get(object_key, []), filter_field, account_id)
    if object_key == "Individual":
        individual_ids_for_account = individual_by_account.get(account_id, set())
        records = [individual_records.get(individual_id) for individual_id in individual_ids_for_account]
        return [record for record in records if record]
    if object_key in _CONTACT_POINT_OBJECTS:
        individual_ids_for_account = individual_by_account.get(account_id, set())
        contact_records_for_account = contact_by_account.get(account_id, [])
        contact_ids_for_account = [
            str(record.get("Id"))
            for record in contact_records_for_account
            if record and record.get("Id")
        ]
        mapping = contact_point_mappings.get(object_key, {})
        individual_mapping = mapping.get("individual", {}) if mapping else {}
        contact_mapping = mapping.get("contact", {}) if mapping else {}
        related_records: List[Dict[str, object]] = []
        for individual_id in individual_ids_for_account:
            related_records.extend(individual_mapping.get(individual_id, []))
        for contact_id in contact_ids_for_account:
            related_records.extend(contact_mapping.get(contact_id, []))
        if not related_records:
            return []
        deduped: List[Dict[str, object]] = []
        seen_ids: Set[str] = set()
        for record in related_records:
            if not isinstance(record, dict):
                continue
            record_id = record.get("Id")
            record_id_str = str(record_id) if record_id else ""
            if record_id_str and record_id_str in seen_ids:
                continue
            if record_id_str:
                seen_ids.add(record_id_str)
            deduped.append(record)
        return deduped
    return []


def run_explorer(org: OrgConfig, account_ids: Sequence[str]) -> ExplorerResult:
    sanitized_ids = _sanitize_account_ids(account_ids)
    if not sanitized_ids:
        raise ValueError("no_valid_ids")

    config = get_config()
    alerts_config = config.get_alerts()
    alert_object_keys = _get_alert_object_keys(alerts_config)
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
    for object_key in _DIRECT_OBJECTS:
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
    contact_point_mappings: Dict[
        str, Dict[str, MutableMapping[str, List[Dict[str, object]]]]
    ] = {}
    for object_key in _CONTACT_POINT_OBJECTS:
        definition = _OBJECT_DEFINITIONS.get(object_key, {})
        query_fields, display_fields = _build_query_fields(org, object_key, config)
        records_by_id: Dict[str, Dict[str, object]] = {}
        source_config = config.get_contact_point_sources(object_key)
        active_sources = {
            source for source, enabled in source_config.items() if enabled and source in _CONTACT_POINT_SOURCE_KEYS
        }
        if not active_sources:
            results[object_key] = []
            contact_point_mappings[object_key] = {"contact": {}, "individual": {}}
            continue
        individual_enabled = "individual" in active_sources
        contact_enabled = "contact" in active_sources
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
        if not individual_enabled:
            individual_field = ""
        elif (
            individual_field
            and individual_field.lower() != "none"
            and individual_field not in available_contact_point_fields
        ):
            individual_field = ""
        if not contact_enabled:
            contact_field = ""
        elif (
            contact_field
            and contact_field.lower() != "none"
            and contact_field not in available_contact_point_fields
        ):
            contact_field = ""
        if (
            individual_enabled
            and individual_field
            and individual_field.lower() != "none"
            and individual_ids
        ):
            for chunk in _chunk(individual_ids, 100):
                if object_key in warnings:
                    break
                soql = (
                    f"SELECT {', '.join(query_fields)} FROM {object_key} WHERE {individual_field} IN ({_format_ids_for_soql(chunk)})"
                )
                data = _query_all_with_handling(org, soql, object_key, warnings)
                for record in data.get("records", []):
                    _store_contact_point_record(records_by_id, record, "individual")
        if (
            object_key not in warnings
            and contact_enabled
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
                    _store_contact_point_record(records_by_id, record, "contact")
        records = list(records_by_id.values())
        results[object_key] = records
        contact_point_mappings[object_key] = _aggregate_contact_points(
            records,
            contact_field=contact_field,
            individual_field=individual_field,
            active_sources=active_sources,
        )

    contact_by_account = _map_records_by_field(contacts, "AccountId")
    individual_by_account = _aggregate_individuals_by_account(contacts, individual_records)

    generated_at = datetime.now(timezone.utc).isoformat()
    configured_objects = config.get_objects()

    explorer_data: Dict[str, object] = {
        "accounts": [],
        "objects": configured_objects,
        "config": {key: config.get_fields(key) for key in _OBJECT_DEFINITIONS.keys()},
        "alerts": alerts_config,
        "summary": {},
    }
    if warnings:
        explorer_data["warnings"] = dict(warnings)

    summary_counts: Dict[str, int] = {}
    for obj in configured_objects:
        summary_counts[obj["key"]] = len(results.get(obj["key"], []))
    explorer_data["summary"] = summary_counts

    configured_keys = {obj["key"] for obj in configured_objects}
    for account_id in sanitized_ids:
        account_record = account_records.get(account_id) or {}
        required_object_keys = set(configured_keys)
        required_object_keys.update(alert_object_keys)
        if "Account" in required_object_keys:
            required_object_keys.remove("Account")
        records_by_object: Dict[str, List[Tuple[str, Dict[str, object]]]] = {
            "Account": [(account_id, account_record)]
        }

        for object_key in required_object_keys:
            related_records = _get_related_records_for_account(
                object_key,
                account_id,
                results=results,
                contact_by_account=contact_by_account,
                individual_by_account=individual_by_account,
                individual_records=individual_records,
                contact_point_mappings=contact_point_mappings,
            )
            records_by_object[object_key] = _prepare_records_with_keys(object_key, related_records)

        triggered_alerts, record_alert_details, field_alert_details = _evaluate_alerts_for_account(
            alerts_config,
            (account_id, account_record),
            records_by_object,
        )

        account_field_alerts = field_alert_details.get("Account", {}).get(account_id, {})
        account_alert_entries = record_alert_details.get("Account", {}).get(account_id, [])

        account_payload = {
            "id": account_id,
            "fields": _record_to_field_list(
                account_display_fields,
                account_record,
                extra_fields=_get_object_link_fields("Account"),
                alert_details=account_field_alerts,
            ),
            "related": {},
        }
        if triggered_alerts:
            account_payload["alerts"] = triggered_alerts
        if account_alert_entries:
            account_payload["alertDetails"] = account_alert_entries

        for obj in configured_objects:
            key = obj["key"]
            _, display_fields = _build_query_fields(org, key, config)
            record_pairs = records_by_object.get(key, [])
            record_alert_map = record_alert_details.get(key, {})
            field_alert_map = field_alert_details.get(key, {})
            payload_records: List[Dict[str, object]] = []
            for record_key, record in record_pairs:
                if not record:
                    continue
                field_alerts_for_record = field_alert_map.get(record_key, {})
                record_alerts_for_record = record_alert_map.get(record_key, [])
                alert_ids: List[str] = []
                for detail in record_alerts_for_record:
                    alert_id = detail.get("id")
                    if isinstance(alert_id, str) and alert_id not in alert_ids:
                        alert_ids.append(alert_id)
                record_payload: Dict[str, object] = {
                    "id": record.get("Id"),
                    "fields": _record_to_field_list(
                        display_fields,
                        record,
                        extra_fields=_get_object_link_fields(key),
                        alert_details=field_alerts_for_record,
                    ),
                }
                if key in _CONTACT_POINT_OBJECTS:
                    link_sources = _get_contact_point_source_list(record)
                    if link_sources:
                        record_payload["linkSources"] = link_sources
                if alert_ids:
                    record_payload["alerts"] = alert_ids
                if record_alerts_for_record:
                    record_payload["alertDetails"] = record_alerts_for_record
                payload_records.append(record_payload)
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
