from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .salesforce import SalesforceError, query
from .storage import OrgConfig


@dataclass
class RelationshipNode:
    """Represents a relationship selected in the complex account wizard."""

    id: str
    type: str  # "child" or "parent"
    object_name: str
    label: str
    relationship_name: Optional[str] = None
    relationship_field: Optional[str] = None
    fields: List[str] = field(default_factory=list)
    filters: str | None = None
    children: List["RelationshipNode"] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "object_name": self.object_name,
            "label": self.label,
            "relationship_name": self.relationship_name,
            "relationship_field": self.relationship_field,
            "fields": list(self.fields),
            "filters": self.filters,
            "children": [child.to_dict() for child in self.children],
        }


@dataclass
class ComplexAccountConfig:
    root_object: str
    root_label: str
    root_fields: List[str]
    filters: str | None = None
    relationships: List[RelationshipNode] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "root_object": self.root_object,
            "root_label": self.root_label,
            "root_fields": list(self.root_fields),
            "filters": self.filters,
            "relationships": [node.to_dict() for node in self.relationships],
        }


def _sanitize_field_list(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    sanitized: List[str] = []
    for value in values:
        if not value:
            continue
        normalized = str(value).strip()
        if normalized and normalized not in sanitized:
            sanitized.append(normalized)
    return sanitized


def _collect_parent_fields(node: RelationshipNode) -> List[str]:
    fields: List[str] = []
    for field in _sanitize_field_list(node.fields):
        fields.append(field)
    for child in node.children:
        if child.type == "parent" and child.relationship_name:
            prefix = child.relationship_name
            for field in _collect_parent_fields(child):
                fields.append(f"{prefix}.{field}")
        elif child.type == "child":
            subquery = _build_child_subquery(child)
            if subquery:
                fields.append(subquery)
    return fields


def _build_child_subquery(node: RelationshipNode) -> Optional[str]:
    if node.type != "child" or not node.relationship_name:
        return None

    select_fields: List[str] = []
    for field in _sanitize_field_list(node.fields):
        select_fields.append(field)
    for child in node.children:
        if child.type == "parent" and child.relationship_name:
            prefix = child.relationship_name
            for field in _collect_parent_fields(child):
                select_fields.append(f"{prefix}.{field}")
        elif child.type == "child":
            nested = _build_child_subquery(child)
            if nested:
                select_fields.append(nested)

    if not select_fields:
        select_fields.append("Id")

    select_clause = ", ".join(dict.fromkeys(select_fields))
    query = f"(SELECT {select_clause} FROM {node.relationship_name}"
    filters = (node.filters or "").strip()
    if filters:
        query += f" WHERE {filters}"
    query += ")"
    return query


def build_single_query(config: ComplexAccountConfig) -> str:
    """Builds a SOQL query that uses subselects for child relationships."""

    fields: List[str] = []
    base_fields = _sanitize_field_list(config.root_fields)
    if "Id" not in {field.split(" ")[0] for field in base_fields}:
        base_fields.insert(0, "Id")
    fields.extend(base_fields)

    for node in config.relationships:
        if node.type == "parent" and node.relationship_name:
            prefix = node.relationship_name
            for field in _collect_parent_fields(node):
                fields.append(f"{prefix}.{field}")
        elif node.type == "child":
            subquery = _build_child_subquery(node)
            if subquery:
                fields.append(subquery)

    if not fields:
        fields = ["Id"]

    select_clause = ", ".join(dict.fromkeys(fields))
    soql = f"SELECT {select_clause} FROM {config.root_object}"
    filters = (config.filters or "").strip()
    if filters:
        soql += f" WHERE {filters}"
    return soql


def run_complex_account_query(org: OrgConfig, config: ComplexAccountConfig) -> Dict[str, Any]:
    soql = build_single_query(config)
    try:
        result = query(org, soql)
    except SalesforceError as exc:  # pragma: no cover - passthrough for handler
        raise exc
    payload: Dict[str, Any] = {
        "query": soql,
        "records": result.get("records", []),
        "done": result.get("done", True),
        "totalSize": result.get("totalSize", 0),
    }
    return payload


def parse_relationship_node(data: Dict[str, Any]) -> RelationshipNode:
    node = RelationshipNode(
        id=str(data.get("id") or ""),
        type=str(data.get("type") or "child"),
        object_name=str(data.get("object_name") or ""),
        label=str(data.get("label") or data.get("object_label") or data.get("object") or ""),
        relationship_name=str(data.get("relationship_name") or data.get("relationshipName") or ""),
        relationship_field=data.get("relationship_field") or data.get("relationshipField"),
        fields=_sanitize_field_list(data.get("fields")),
        filters=(data.get("filters") or "").strip() or None,
        children=[],
    )
    if not node.id:
        raise ValueError("relationship node id is required")
    if not node.object_name:
        raise ValueError("relationship node object_name is required")
    if node.type not in {"child", "parent"}:
        raise ValueError("relationship node type must be 'child' or 'parent'")
    if node.type == "child" and not node.relationship_name:
        raise ValueError("child relationship requires relationship_name")
    children_data = data.get("children") or []
    for child in children_data:
        node.children.append(parse_relationship_node(child))
    return node


def parse_complex_account_config(data: Dict[str, Any]) -> ComplexAccountConfig:
    root_object = str(data.get("root_object") or "").strip()
    if not root_object:
        raise ValueError("root_object is required")
    root_label = str(data.get("root_label") or root_object).strip() or root_object
    root_fields = _sanitize_field_list(data.get("root_fields"))
    filters = (data.get("filters") or "").strip() or None
    relationships_data = data.get("relationships") or []
    relationships = [parse_relationship_node(item) for item in relationships_data]
    return ComplexAccountConfig(
        root_object=root_object,
        root_label=root_label,
        root_fields=root_fields,
        filters=filters,
        relationships=relationships,
    )


__all__ = [
    "ComplexAccountConfig",
    "RelationshipNode",
    "build_single_query",
    "parse_complex_account_config",
    "run_complex_account_query",
]
