from __future__ import annotations

import json
import threading
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "orgs.json"

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
    instance_url: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None

    @property
    def login_url(self) -> str:
        if self.environment == "production":
            return "https://login.salesforce.com"
        if self.environment == "sandbox":
            return "https://test.salesforce.com"
        return self.environment


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


def ensure_storage() -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text("[]", encoding="utf-8")


storage = OrgStorage(DATA_FILE)
