from __future__ import annotations

import json
import re
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ORGS_DATA_FILE = DATA_DIR / "orgs.json"
SAVED_QUERIES_DATA_FILE = DATA_DIR / "saved_queries.json"
QUERY_HISTORY_DATA_FILE = DATA_DIR / "query_history.json"

_lock = threading.Lock()


@dataclass
class OrgConfig:
    id: str
    label: str
    client_id: str
    client_secret: str
    environment: str
    redirect_uri: str
    auth_scope: str = "full refresh_token"
    custom_domain: Optional[str] = None
    instance_url: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None

    def __post_init__(self) -> None:
        self.environment = (self.environment or "").strip().lower() or "production"

        # Backwards compatibility: older installations stored the custom domain
        # directly in the environment field. When we detect this scenario we
        # migrate the value to the new ``custom_domain`` attribute on the fly.
        if self.environment not in {"production", "sandbox", "custom"}:
            if not self.custom_domain:
                self.custom_domain = self.environment
            self.environment = "custom"

        if self.custom_domain:
            normalized = self.custom_domain.strip()
            if normalized and not normalized.startswith(("http://", "https://")):
                normalized = f"https://{normalized}"
            normalized = normalized.rstrip("/")
            self.custom_domain = normalized or None

        if self.environment == "custom" and not self.custom_domain:
            # Fall back to the production login so the application keeps
            # working instead of failing with an exception. This mirrors the
            # behaviour prior to the introduction of custom domains.
            self.environment = "production"

    @property
    def login_url(self) -> str:
        if self.environment == "production":
            return "https://login.salesforce.com"
        if self.environment == "sandbox":
            return "https://test.salesforce.com"
        if self.custom_domain:
            return self.custom_domain
        return "https://login.salesforce.com"


class OrgStorage:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load_all(self) -> Dict[str, OrgConfig]:
        if not self.path.exists():
            return {}
        with self.path.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
        return {item["id"]: OrgConfig(**item) for item in raw}

    def save_all(self, orgs: Dict[str, OrgConfig]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump([asdict(org) for org in orgs.values()], fh, indent=2, sort_keys=True)

    def upsert(self, org: OrgConfig) -> OrgConfig:
        with _lock:
            orgs = self.load_all()
            orgs[org.id] = org
            self.save_all(orgs)
            return org

    def delete(self, org_id: str) -> None:
        with _lock:
            orgs = self.load_all()
            if org_id in orgs:
                del orgs[org_id]
                self.save_all(orgs)

    def get(self, org_id: str) -> Optional[OrgConfig]:
        return self.load_all().get(org_id)

    def list(self) -> List[OrgConfig]:
        return list(self.load_all().values())


@dataclass
class SavedQuery:
    id: str
    label: str
    soql: str


class SavedQueryStorage:
    def __init__(self, path: Path) -> None:
        self.path = path

    def load_all(self) -> Dict[str, SavedQuery]:
        if not self.path.exists():
            return {}
        with self.path.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
        return {item["id"]: SavedQuery(**item) for item in raw}

    def save_all(self, queries: Dict[str, SavedQuery]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump([asdict(query) for query in queries.values()], fh, indent=2, sort_keys=True)

    def _generate_id(self, label: str, existing: Dict[str, SavedQuery]) -> str:
        tokens = re.findall(r"[a-z0-9]+", label.lower())
        base = "-".join(tokens) or "query"
        candidate = base
        index = 1
        while candidate in existing:
            candidate = f"{base}-{index}"
            index += 1
        return candidate

    def upsert(self, label: str, soql: str, query_id: Optional[str] = None) -> Tuple[SavedQuery, bool]:
        with _lock:
            queries = self.load_all()
            created = False
            if query_id and query_id in queries:
                identifier = query_id
            else:
                identifier = self._generate_id(label, queries)
                created = True
            saved = SavedQuery(id=identifier, label=label, soql=soql)
            queries[identifier] = saved
            self.save_all(queries)
            return saved, created

    def delete(self, query_id: str) -> None:
        with _lock:
            queries = self.load_all()
            if query_id in queries:
                del queries[query_id]
                self.save_all(queries)

    def get(self, query_id: str) -> Optional[SavedQuery]:
        return self.load_all().get(query_id)

    def list(self) -> List[SavedQuery]:
        return list(self.load_all().values())


@dataclass
class QueryHistoryEntry:
    id: str
    org_id: str
    soql: str
    object_name: Optional[str]
    executed_at: str


class QueryHistoryStorage:
    max_entries: int = 1000

    def __init__(self, path: Path) -> None:
        self.path = path

    def load_all(self) -> List[QueryHistoryEntry]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
        return [QueryHistoryEntry(**item) for item in raw]

    def save_all(self, entries: List[QueryHistoryEntry]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as fh:
            json.dump([asdict(entry) for entry in entries], fh, indent=2, sort_keys=True)

    def add(self, org_id: str, soql: str, object_name: Optional[str]) -> QueryHistoryEntry:
        with _lock:
            entries = self.load_all()
            entry = QueryHistoryEntry(
                id=uuid.uuid4().hex,
                org_id=org_id,
                soql=soql,
                object_name=object_name,
                executed_at=datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            )
            entries.append(entry)
            if len(entries) > self.max_entries:
                entries = entries[-self.max_entries :]
            self.save_all(entries)
            return entry

    def list(self, object_name: Optional[str] = None) -> List[QueryHistoryEntry]:
        entries = self.load_all()
        if object_name:
            entries = [
                entry
                for entry in entries
                if entry.object_name and entry.object_name.lower() == object_name.lower()
            ]
        return list(reversed(entries))

    def list_objects(self) -> List[str]:
        entries = self.load_all()
        objects = {entry.object_name for entry in entries if entry.object_name}
        return sorted(objects, key=lambda value: value.lower())


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for path in (ORGS_DATA_FILE, SAVED_QUERIES_DATA_FILE, QUERY_HISTORY_DATA_FILE):
        if not path.exists():
            path.write_text("[]", encoding="utf-8")


storage = OrgStorage(ORGS_DATA_FILE)
saved_queries_storage = SavedQueryStorage(SAVED_QUERIES_DATA_FILE)
query_history_storage = QueryHistoryStorage(QUERY_HISTORY_DATA_FILE)
