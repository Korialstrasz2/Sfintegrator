from __future__ import annotations

import base64
import hashlib
import logging
from dataclasses import asdict
from typing import Dict, List, Optional, Tuple

import requests

from .storage import OrgConfig, storage

logger = logging.getLogger(__name__)


class SalesforceError(RuntimeError):
    pass


def _encode_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorize_url(org: OrgConfig, state: str, code_verifier: Optional[str] = None) -> str:
    params = {
        "response_type": "code",
        "client_id": org.client_id,
        "redirect_uri": org.redirect_uri,
        "scope": org.auth_scope,
        "state": state,
    }
    if code_verifier:
        params["code_challenge"] = _encode_code_challenge(code_verifier)
        params["code_challenge_method"] = "S256"
    query = "&".join(f"{key}={requests.utils.quote(value)}" for key, value in params.items())
    return f"{org.login_url}/services/oauth2/authorize?{query}"


def exchange_code_for_token(org: OrgConfig, code: str, code_verifier: Optional[str] = None) -> OrgConfig:
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": org.client_id,
        "client_secret": org.client_secret,
        "redirect_uri": org.redirect_uri,
    }
    if code_verifier:
        payload["code_verifier"] = code_verifier
    response = requests.post(f"{org.login_url}/services/oauth2/token", data=payload, timeout=30)
    if not response.ok:
        raise SalesforceError(f"Failed to exchange code: {response.text}")
    data = response.json()
    updated = OrgConfig(**{**asdict(org), **{k: data.get(k) for k in ("access_token", "refresh_token", "instance_url")}})
    storage.upsert(updated)
    return updated


def refresh_access_token(org: OrgConfig) -> OrgConfig:
    if not org.refresh_token:
        raise SalesforceError("Missing refresh token; please re-authorize the org")
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": org.refresh_token,
        "client_id": org.client_id,
        "client_secret": org.client_secret,
    }
    response = requests.post(f"{org.login_url}/services/oauth2/token", data=payload, timeout=30)
    if not response.ok:
        raise SalesforceError(f"Failed to refresh token: {response.text}")
    data = response.json()
    updated = OrgConfig(**{**asdict(org), **{k: data.get(k) for k in ("access_token", "instance_url")}})
    storage.upsert(updated)
    return updated


def _ensure_authorized(org: OrgConfig) -> None:
    if not org.access_token or not org.instance_url:
        raise SalesforceError("Org is not authorized. Please connect using OAuth first.")


def _authorized_get(
    org: OrgConfig, path: str, params: Optional[Dict[str, str]] = None
) -> Tuple[Dict, OrgConfig]:
    _ensure_authorized(org)
    url = f"{org.instance_url}{path}"
    headers = {"Authorization": f"Bearer {org.access_token}"}
    response = requests.get(url, headers=headers, params=params, timeout=30)

    if response.status_code == 401 and org.refresh_token:
        refreshed = refresh_access_token(org)
        url = f"{refreshed.instance_url}{path}"
        headers = {"Authorization": f"Bearer {refreshed.access_token}"}
        response = requests.get(url, headers=headers, params=params, timeout=30)
        org = refreshed

    if not response.ok:
        raise SalesforceError(f"Salesforce request failed: {response.text}")

    return response.json(), org


def query(org: OrgConfig, soql: str) -> Dict:
    data, _ = _authorized_get(org, "/services/data/v57.0/query", params={"q": soql})
    return data


def query_all(org: OrgConfig, soql: str, max_records: Optional[int] = None) -> Dict[str, object]:
    data, current_org = _authorized_get(org, "/services/data/v57.0/query", params={"q": soql})
    records = list(data.get("records", []))
    next_url = data.get("nextRecordsUrl")
    truncated = False

    while next_url:
        if max_records is not None and len(records) >= max_records:
            truncated = True
            break
        data, current_org = _authorized_get(current_org, next_url)
        chunk = data.get("records", [])
        if chunk:
            records.extend(chunk)
        next_url = data.get("nextRecordsUrl")

    if max_records is not None and len(records) > max_records:
        truncated = True
        records = records[:max_records]

    has_more = bool(next_url) or truncated
    payload: Dict[str, object] = {
        "records": records,
        "totalSize": len(records),
        "done": not has_more,
        "nextRecordsUrl": None if truncated else next_url,
        "truncated": truncated,
    }
    if max_records is not None and max_records > 0:
        payload["max_records"] = max_records
    return payload


def list_sobjects(org: OrgConfig) -> List[Dict[str, str]]:
    data, _ = _authorized_get(org, "/services/data/v57.0/sobjects")
    sobjects = []
    for item in data.get("sobjects", []):
        sobjects.append(
            {
                "name": item.get("name", ""),
                "label": item.get("label", ""),
                "custom": bool(item.get("custom")),
            }
        )
    return sobjects


def describe_sobject(org: OrgConfig, object_name: str) -> List[Dict[str, str]]:
    path = f"/services/data/v57.0/sobjects/{object_name}" if object_name else ""
    if not path:
        raise SalesforceError("Missing object name")
    data, _ = _authorized_get(org, f"{path}/describe")
    fields = []
    for field in data.get("fields", []):
        fields.append(
            {
                "name": field.get("name", ""),
                "label": field.get("label", ""),
                "type": field.get("type", ""),
            }
        )
    return fields


def serialize_org(org: OrgConfig) -> Dict[str, Optional[str]]:
    data = asdict(org)
    # Hide secrets when exposing to the browser
    data["client_secret"] = "***"
    if data.get("access_token"):
        data["access_token"] = "set"
    if data.get("refresh_token"):
        data["refresh_token"] = "set"
    return data
