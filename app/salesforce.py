from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Dict, Optional

import requests

from .storage import OrgConfig, storage

logger = logging.getLogger(__name__)


class SalesforceError(RuntimeError):
    pass


def build_authorize_url(org: OrgConfig, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": org.client_id,
        "redirect_uri": org.redirect_uri,
        "scope": org.auth_scope,
        "state": state,
    }
    query = "&".join(f"{key}={requests.utils.quote(value)}" for key, value in params.items())
    return f"{org.login_url}/services/oauth2/authorize?{query}"


def exchange_code_for_token(org: OrgConfig, code: str) -> OrgConfig:
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": org.client_id,
        "client_secret": org.client_secret,
        "redirect_uri": org.redirect_uri,
    }
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


def query(org: OrgConfig, soql: str) -> Dict:
    if not org.access_token or not org.instance_url:
        raise SalesforceError("Org is not authorized. Please connect using OAuth first.")

    headers = {"Authorization": f"Bearer {org.access_token}"}
    params = {"q": soql}
    url = f"{org.instance_url}/services/data/v57.0/query"
    response = requests.get(url, headers=headers, params=params, timeout=30)

    if response.status_code == 401 and org.refresh_token:
        refreshed = refresh_access_token(org)
        headers = {"Authorization": f"Bearer {refreshed.access_token}"}
        response = requests.get(url, headers=headers, params=params, timeout=30)

    if not response.ok:
        raise SalesforceError(f"Salesforce query failed: {response.text}")

    return response.json()


def serialize_org(org: OrgConfig) -> Dict[str, Optional[str]]:
    data = asdict(org)
    # Hide secrets when exposing to the browser
    data["client_secret"] = "***"
    if data.get("access_token"):
        data["access_token"] = "set"
    if data.get("refresh_token"):
        data["refresh_token"] = "set"
    return data
