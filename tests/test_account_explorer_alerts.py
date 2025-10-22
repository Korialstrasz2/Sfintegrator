import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import account_explorer
from app.storage import OrgConfig


def test_run_explorer_ignores_invalid_records(tmp_path, monkeypatch):
    config_path = tmp_path / "account_explorer_config.json"
    results_dir = tmp_path / "account_explorer_results"
    monkeypatch.setattr(account_explorer, "CONFIG_FILE", config_path)
    monkeypatch.setattr(account_explorer, "RESULTS_DIR", results_dir)

    config_path.write_text(
        json.dumps(
            {
                "fields": {},
                "objects": [],
                "alerts": [
                    {
                        "id": "alert-1",
                        "label": "Case Subject Alert",
                        "filters": [
                            {
                                "object": "Case",
                                "field": "Subject",
                                "operator": "equals",
                                "value": "Investigate",
                            }
                        ],
                    }
                ],
                "viewMode": "list",
            }
        ),
        encoding="utf-8",
    )

    org = OrgConfig(
        id="org1",
        label="Org",
        client_id="cid",
        client_secret="secret",
        environment="production",
        redirect_uri="https://example.com/callback",
        instance_url="https://example.com",
        access_token="token",
        refresh_token="refresh",
    )

    account_id = "001000000000001AAA"

    account_records = {
        "Account": {"records": [{"Id": account_id, "Name": "Acme"}]},
        "Case": {
            "records": [
                None,
                {
                    "Id": "500000000000001AAA",
                    "AccountId": account_id,
                    "Subject": "Investigate",
                },
            ]
        },
    }

    def fake_query_all(org_config, soql, max_records=None):
        if "FROM Account" in soql:
            return account_records["Account"]
        if "FROM Case" in soql:
            return account_records["Case"]
        return {"records": []}

    def fake_describe(org_config, object_name):
        if object_name == "Account":
            return [{"name": "Id"}, {"name": "Name"}]
        if object_name == "Case":
            return [
                {"name": "Id"},
                {"name": "AccountId"},
                {"name": "Subject"},
            ]
        return [{"name": "Id"}]

    with patch.object(account_explorer, "query_all", side_effect=fake_query_all), patch.object(
        account_explorer, "describe_sobject", side_effect=fake_describe
    ), patch.object(account_explorer, "get_session", return_value=account_explorer.ExplorerSession(id="sess")):
        result = account_explorer.run_explorer(org, [account_id])

    account_entries = result.data["accounts"]
    assert account_entries, "Expected account results to be returned"
    related_cases = account_entries[0]["related"]["Case"]
    assert len(related_cases) == 1
    assert related_cases[0]["id"] == "500000000000001AAA"
    assert account_entries[0]["alerts"][0]["id"] == "alert-1"
