from __future__ import annotations

import json
import re
import secrets
import threading
from pathlib import Path
from typing import List

from flask import (Blueprint, Response, current_app, jsonify, redirect,
                   render_template, request, send_file, session, url_for)

from itsdangerous import BadSignature, URLSafeSerializer

from . import account_explorer, data_import
from .salesforce import (
    SalesforceError,
    build_authorize_url,
    describe_sobject,
    exchange_code_for_token,
    list_sobjects,
    query,
    query_all,
    serialize_org,
)
from .i18n import (DEFAULT_LANGUAGE, get_frontend_translations,
                   get_language_codes, get_language_name, get_language_pack,
                   translate)
from .storage import (OrgConfig, query_history_storage, saved_queries_storage,
                      storage)

main_bp = Blueprint("main", __name__)

THEMES = ["classic", "modern", "dark", "sci-fi"]
DEFAULT_THEME = THEMES[0]

_FROM_PATTERN = re.compile(r"\bFROM\s+([a-zA-Z0-9_.]+)", re.IGNORECASE)


def _extract_object_name(soql: str | None) -> str | None:
    if not soql:
        return None
    match = _FROM_PATTERN.search(soql)
    if not match:
        return None
    return match.group(1)


@main_bp.app_context_processor
def inject_i18n_context() -> dict[str, object]:
    language = session.get("language", DEFAULT_LANGUAGE)
    theme = session.get("theme", DEFAULT_THEME)
    if theme not in THEMES:
        theme = DEFAULT_THEME

    def _translate(key: str, **kwargs: str) -> str:
        text = translate(key, language)
        if kwargs:
            try:
                return text.format(**kwargs)
            except (KeyError, ValueError):
                return text
        return text

    language_pack = get_language_pack(language)
    available_languages = [
        {"code": code, "label": get_language_name(code)}
        for code in get_language_codes()
    ]
    frontend_translations = json.dumps(
        get_frontend_translations(language), ensure_ascii=False
    )

    themes_translations = (
        language_pack.get("settings", {}).get("themes", {}) if language_pack else {}
    )
    available_themes = [
        {
            "id": theme_key,
            "label": themes_translations.get(
                theme_key, theme_key.replace("-", " ").title()
            ),
        }
        for theme_key in THEMES
    ]

    return {
        "t": _translate,
        "current_language": language,
        "current_theme": theme,
        "available_languages": available_languages,
        "available_themes": available_themes,
        "language_pack": language_pack,
        "frontend_translations_json": frontend_translations,
    }


def _state_serializer() -> URLSafeSerializer:
    secret_key = current_app.config.get("SECRET_KEY")
    return URLSafeSerializer(secret_key, salt="oauth-state")


_code_verifiers = {}
_code_verifier_lock = threading.Lock()


def _store_code_verifier(nonce: str, code_verifier: str) -> None:
    with _code_verifier_lock:
        _code_verifiers[nonce] = code_verifier


def _pop_code_verifier(nonce: str) -> str | None:
    with _code_verifier_lock:
        return _code_verifiers.pop(nonce, None)


@main_bp.route("/")
def index() -> str:
    orgs = [serialize_org(org) for org in storage.list()]
    return render_template("index.html", orgs=orgs)


@main_bp.route("/orgs")
def manage_orgs() -> str:
    orgs = storage.list()
    return render_template("orgs.html", orgs=orgs)


@main_bp.route("/guide")
def guide() -> str:
    return render_template("guide.html")


@main_bp.route("/account-explorer")
def account_explorer_page() -> str:
    session_state = account_explorer.get_session()
    result = session_state.result.to_dict() if session_state.result else None
    config = account_explorer.get_config()
    language = session.get("language", DEFAULT_LANGUAGE)
    page_title = translate("account_explorer.title", language)
    return render_template(
        "account_explorer.html",
        account_explorer_objects=account_explorer.CONNECTED_OBJECTS,
        account_explorer_config=config.to_dict(),
        account_explorer_result=result,
        account_explorer_limit=account_explorer.MAX_ACCOUNT_IDS,
        title=page_title,
    )


@main_bp.route("/data-import")
def data_import_page() -> str:
    import_session = data_import.get_import_session()
    status = import_session.get_status()
    return render_template(
        "data_import.html",
        data_import_objects=data_import.DATA_IMPORT_OBJECTS,
        data_import_status=status,
        title="Data Import All Files",
    )


@main_bp.route("/settings", methods=["GET", "POST"])
def settings() -> str:
    if request.method == "POST":
        language = request.form.get("language", DEFAULT_LANGUAGE)
        if language not in get_language_codes():
            language = DEFAULT_LANGUAGE
        theme = request.form.get("theme", DEFAULT_THEME)
        if theme not in THEMES:
            theme = DEFAULT_THEME
        session["language"] = language
        session["theme"] = theme
        return redirect(url_for("main.settings", saved=1))

    saved = request.args.get("saved") == "1"
    config = account_explorer.get_config()
    return render_template(
        "settings.html",
        settings_saved=saved,
        account_explorer_objects=account_explorer.list_objects(),
        account_explorer_config=config.to_dict(),
        account_explorer_limit=account_explorer.MAX_ACCOUNT_IDS,
    )


@main_bp.route("/api/data-import/status", methods=["GET"])
def api_data_import_status() -> Response:
    import_session = data_import.get_import_session()
    return jsonify(import_session.get_status())


@main_bp.route("/api/data-import/upload", methods=["POST"])
def api_data_import_upload() -> Response:
    object_key = request.form.get("object")
    if not object_key:
        return jsonify({"error": "missing_object"}), 400
    if not data_import.get_object_definition(object_key):
        return jsonify({"error": "unknown_object"}), 400
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "missing_file"}), 400
    file_bytes = file.read()
    try:
        dataset = data_import.parse_tabular_file(file.filename, file_bytes)
    except ModuleNotFoundError:
        return jsonify({"error": "invalid_file", "code": "missing_dependency"}), 400
    except ValueError as exc:
        error_code = exc.args[0] if exc.args else "invalid_file"
        if not isinstance(error_code, str):
            error_code = "invalid_file"
        return jsonify({"error": "invalid_file", "code": error_code}), 400

    import_session = data_import.get_import_session()
    import_session.set_object_data(object_key, dataset)
    return jsonify({"status": import_session.get_status(), "object": object_key})


@main_bp.route("/api/data-import/upload", methods=["DELETE"])
def api_data_import_remove() -> Response:
    payload = request.get_json(silent=True) or {}
    object_key = payload.get("object")
    if not object_key:
        return jsonify({"error": "missing_object"}), 400
    if not data_import.get_object_definition(object_key):
        return jsonify({"error": "unknown_object"}), 400
    import_session = data_import.get_import_session()
    import_session.clear_object_data(object_key)
    return jsonify({"status": import_session.get_status(), "object": object_key})


@main_bp.route("/api/data-import/fields", methods=["GET"])
def api_data_import_fields() -> Response:
    object_key = request.args.get("object", "")
    if not object_key:
        return jsonify({"error": "missing_object"}), 400
    if not data_import.get_object_definition(object_key):
        return jsonify({"error": "unknown_object"}), 400
    import_session = data_import.get_import_session()
    fields = import_session.get_fields(object_key)
    return jsonify({"object": object_key, "fields": fields})


@main_bp.route("/api/data-import/autocomplete", methods=["GET"])
def api_data_import_autocomplete() -> Response:
    object_key = request.args.get("object", "")
    field_name = request.args.get("field", "")
    term = request.args.get("term", "")
    if not object_key or not field_name:
        return jsonify({"error": "missing_parameters"}), 400
    if not data_import.get_object_definition(object_key):
        return jsonify({"error": "unknown_object"}), 400
    import_session = data_import.get_import_session()
    values = import_session.get_autocomplete_values(object_key, field_name, term)
    return jsonify({"values": values})


@main_bp.route("/api/data-import/related", methods=["POST"])
def api_data_import_related() -> Response:
    payload = request.get_json(force=True)
    object_key = payload.get("object") if isinstance(payload, dict) else None
    field_name = payload.get("field") if isinstance(payload, dict) else None
    value = payload.get("value") if isinstance(payload, dict) else None
    if not object_key or not field_name or value is None:
        return jsonify({"error": "missing_parameters"}), 400
    if not data_import.get_object_definition(object_key):
        return jsonify({"error": "unknown_object"}), 400
    import_session = data_import.get_import_session()
    matches = import_session.search_records(object_key, field_name, str(value))
    if not matches:
        return jsonify({"error": "no_matches"}), 404
    graph = import_session.get_related_component(matches)
    return jsonify(graph)


@main_bp.route("/api/account-explorer/config", methods=["GET"])
def api_account_explorer_get_config() -> Response:
    config = account_explorer.get_config()
    objects = account_explorer.list_objects()
    resolved = {definition["key"]: config.get_fields(definition["key"]) for definition in objects}
    payload = {
        "config": config.to_dict(),
        "resolved": resolved,
        "objects": objects,
        "connectedObjects": account_explorer.CONNECTED_OBJECTS,
        "limit": account_explorer.MAX_ACCOUNT_IDS,
    }
    return jsonify(payload)


@main_bp.route("/api/account-explorer/config", methods=["POST"])
def api_account_explorer_update_config() -> Response:
    payload = request.get_json(force=True)
    fields = payload.get("fields") if isinstance(payload, dict) else None
    if not isinstance(fields, dict):
        return jsonify({"error": "invalid_fields"}), 400
    config = account_explorer.update_config(fields)
    objects = account_explorer.list_objects()
    resolved = {definition["key"]: config.get_fields(definition["key"]) for definition in objects}
    return jsonify({
        "config": config.to_dict(),
        "resolved": resolved,
        "objects": objects,
        "limit": account_explorer.MAX_ACCOUNT_IDS,
    })


@main_bp.route("/api/account-explorer/parse", methods=["POST"])
def api_account_explorer_parse() -> Response:
    ids: List[str] = []
    if request.content_type and "multipart/form-data" in request.content_type:
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "missing_file"}), 400
        file_bytes = file.read()
        try:
            ids = account_explorer.parse_account_ids_from_file(file.filename, file_bytes)
        except ModuleNotFoundError:
            return jsonify({"error": "invalid_file", "code": "missing_dependency"}), 400
        except ValueError as exc:
            code = exc.args[0] if exc.args else "invalid_file"
            if not isinstance(code, str):
                code = "invalid_file"
            return jsonify({"error": "invalid_file", "code": code}), 400
    else:
        payload = request.get_json(force=True)
        text = payload.get("text") if isinstance(payload, dict) else ""
        ids = account_explorer.parse_account_ids_from_text(text or "")
    return jsonify({"ids": ids, "count": len(ids), "limit": account_explorer.MAX_ACCOUNT_IDS})


@main_bp.route("/api/account-explorer/run", methods=["POST"])
def api_account_explorer_run() -> Response:
    payload = request.get_json(force=True)
    org_id = (payload.get("org_id") or "").strip() if isinstance(payload, dict) else ""
    account_ids = payload.get("account_ids") if isinstance(payload, dict) else None
    if not org_id or not isinstance(account_ids, list):
        return jsonify({"error": "missing_parameters"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        result = account_explorer.run_explorer(org, account_ids)
    except ValueError as exc:
        code = exc.args[0] if exc.args else "invalid_accounts"
        if not isinstance(code, str):
            code = "invalid_accounts"
        return jsonify({"error": "invalid_accounts", "code": code}), 400
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result.to_dict())


@main_bp.route("/api/account-explorer/result", methods=["GET"])
def api_account_explorer_result() -> Response:
    session_state = account_explorer.get_session()
    result = session_state.result.to_dict() if session_state.result else None
    return jsonify({"result": result})


@main_bp.route("/api/account-explorer/download", methods=["GET"])
def api_account_explorer_download():
    session_state = account_explorer.get_session()
    if not session_state.result or not session_state.result.file_path:
        return jsonify({"error": "no_result"}), 404
    file_path = Path(session_state.result.file_path)
    if not file_path.exists():
        return jsonify({"error": "file_missing"}), 404
    return send_file(
        file_path,
        mimetype="application/json",
        download_name=file_path.name,
        as_attachment=True,
    )


@main_bp.route("/api/account-explorer/fields", methods=["GET"])
def api_account_explorer_fields() -> Response:
    org_id = (request.args.get("org_id") or "").strip()
    object_name = (request.args.get("object") or "").strip()
    term = (request.args.get("term") or "").strip().lower()
    if not org_id or not object_name:
        return jsonify({"error": "missing_parameters"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        fields = account_explorer.describe_object(org, object_name)
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    if term:
        filtered = [
            field
            for field in fields
            if term in (field.get("name", "").lower())
            or term in (field.get("label", "").lower())
        ]
    else:
        filtered = fields
    return jsonify({"fields": filtered})


@main_bp.route("/api/orgs", methods=["GET"])
def api_list_orgs() -> Response:
    orgs = [serialize_org(org) for org in storage.list()]
    return jsonify(orgs)


@main_bp.route("/api/orgs", methods=["POST"])
def api_create_org() -> Response:
    data = request.get_json(force=True)
    required = {"id", "label", "client_id", "environment", "redirect_uri"}
    missing = required - data.keys()
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(sorted(missing))}"}), 400

    existing = storage.get(data["id"])
    client_secret = data.get("client_secret") or (existing.client_secret if existing else None)
    if not client_secret:
        return jsonify({"error": "client_secret is required for new orgs"}), 400

    payload = {key: data.get(key) for key in OrgConfig.__dataclass_fields__.keys()}
    payload["client_secret"] = client_secret.strip()
    if payload.get("auth_scope"):
        payload["auth_scope"] = payload["auth_scope"].strip() or "full refresh_token"
    else:
        payload["auth_scope"] = "full refresh_token"
    if payload.get("client_id"):
        payload["client_id"] = payload["client_id"].strip()
    if payload.get("label"):
        payload["label"] = payload["label"].strip()
    if payload.get("environment"):
        payload["environment"] = payload["environment"].strip()
    if payload.get("redirect_uri"):
        payload["redirect_uri"] = payload["redirect_uri"].strip()
    if not payload.get("environment"):
        return jsonify({"error": "environment is required"}), 400
    if not payload.get("redirect_uri"):
        return jsonify({"error": "redirect_uri is required"}), 400
    if existing:
        payload["access_token"] = existing.access_token if data.get("access_token") is None else data.get("access_token")
        payload["refresh_token"] = existing.refresh_token if data.get("refresh_token") is None else data.get("refresh_token")
        payload["instance_url"] = existing.instance_url if data.get("instance_url") is None else data.get("instance_url")

    org = OrgConfig(**payload)
    storage.upsert(org)
    return jsonify(serialize_org(org)), 201 if not existing else 200


@main_bp.route("/api/orgs/<org_id>", methods=["DELETE"])
def api_delete_org(org_id: str) -> Response:
    storage.delete(org_id)
    return Response(status=204)


@main_bp.route("/auth/<org_id>")
def start_auth(org_id: str):
    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404
    nonce = secrets.token_urlsafe(24)
    code_verifier = secrets.token_urlsafe(64)
    _store_code_verifier(nonce, code_verifier)
    state_payload = {"org_id": org_id, "nonce": nonce}
    state_token = _state_serializer().dumps(state_payload)
    return redirect(build_authorize_url(org, state_token, code_verifier))


@main_bp.route("/oauth/callback")
def oauth_callback():
    error = request.args.get("error")
    if error:
        description = request.args.get("error_description")
        message = description or f"Salesforce authorization failed: {error}"
        return jsonify({"error": message}), 400

    state = request.args.get("state")
    code = request.args.get("code")
    if not state or not code:
        return jsonify({"error": "Missing state or code"}), 400

    try:
        state_data = _state_serializer().loads(state, max_age=600)
    except BadSignature:
        return jsonify({"error": "Invalid or expired state"}), 400

    org_id = state_data.get("org_id")
    nonce = state_data.get("nonce")
    if not org_id:
        return jsonify({"error": "Invalid state payload"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    code_verifier = _pop_code_verifier(nonce) if nonce else None
    updated = exchange_code_for_token(org, code, code_verifier)
    return redirect(url_for("main.index", message=f"Connected {updated.label}"))


@main_bp.route("/api/query", methods=["POST"])
def api_query() -> Response:
    payload = request.get_json(force=True)
    org_id = payload.get("org_id")
    soql = payload.get("query")
    if not org_id or not soql:
        return jsonify({"error": "org_id and query are required"}), 400

    raw_options = payload.get("options")
    options = raw_options if isinstance(raw_options, dict) else {}
    fetch_all = bool(options.get("fetch_all"))
    max_records = None
    if fetch_all:
        raw_max = options.get("max_records")
        try:
            parsed = int(raw_max)
        except (TypeError, ValueError):
            parsed = None
        if parsed and parsed > 0:
            max_records = parsed

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        if fetch_all:
            result = query_all(org, soql, max_records=max_records)
        else:
            result = query(org, soql)
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        query_history_storage.add(
            org_id=org_id,
            soql=soql,
            object_name=_extract_object_name(soql),
        )
    except Exception:  # pragma: no cover - defensive logging
        current_app.logger.exception("Unable to store query history entry")

    return jsonify(result)


@main_bp.route("/api/saved-queries", methods=["GET"])
def api_list_saved_queries() -> Response:
    queries = [
        {"id": item.id, "label": item.label, "soql": item.soql}
        for item in saved_queries_storage.list()
    ]
    return jsonify(queries)


@main_bp.route("/api/saved-queries", methods=["POST"])
def api_save_query() -> Response:
    payload = request.get_json(force=True)
    label = (payload.get("label") or "").strip()
    soql = (payload.get("soql") or "").strip()
    query_id = (payload.get("id") or "").strip() or None

    if not label:
        return jsonify({"error": "label is required"}), 400
    if not soql:
        return jsonify({"error": "soql is required"}), 400

    saved, created = saved_queries_storage.upsert(label, soql, query_id)
    status = 201 if created else 200
    return jsonify({"id": saved.id, "label": saved.label, "soql": saved.soql}), status


@main_bp.route("/api/saved-queries/<query_id>", methods=["DELETE"])
def api_delete_saved_query(query_id: str) -> Response:
    saved_queries_storage.delete(query_id)
    return Response(status=204)


@main_bp.route("/api/query-history", methods=["GET"])
def api_query_history() -> Response:
    object_name = request.args.get("object") or None
    entries = [
        {
            "id": item.id,
            "org_id": item.org_id,
            "soql": item.soql,
            "object_name": item.object_name,
            "executed_at": item.executed_at,
        }
        for item in query_history_storage.list(object_name)
    ]
    objects = query_history_storage.list_objects()
    payload = {
        "entries": entries,
        "objects": objects,
        "selected_object": object_name,
    }
    return jsonify(payload)


@main_bp.route("/api/sobjects", methods=["GET"])
def api_list_sobjects_endpoint() -> Response:
    org_id = request.args.get("org_id")
    if not org_id:
        return jsonify({"error": "org_id is required"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        objects = list_sobjects(org)
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(objects)


@main_bp.route("/api/sobjects/<object_name>/fields", methods=["GET"])
def api_list_sobject_fields(object_name: str) -> Response:
    org_id = request.args.get("org_id")
    if not org_id:
        return jsonify({"error": "org_id is required"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        fields = describe_sobject(org, object_name)
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(fields)


@main_bp.errorhandler(SalesforceError)
def handle_salesforce_error(exc: SalesforceError):
    return jsonify({"error": str(exc)}), 400
