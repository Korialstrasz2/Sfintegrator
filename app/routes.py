from __future__ import annotations

import secrets

from flask import (Blueprint, Response, current_app, jsonify, redirect,
                   render_template, request, url_for)

from itsdangerous import BadSignature, URLSafeSerializer

from .salesforce import (SalesforceError, build_authorize_url,
                         exchange_code_for_token, query, serialize_org)
from .storage import OrgConfig, storage

main_bp = Blueprint("main", __name__)


def _state_serializer() -> URLSafeSerializer:
    secret_key = current_app.config.get("SECRET_KEY")
    return URLSafeSerializer(secret_key, salt="oauth-state")


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
    state_payload = {"org_id": org_id, "nonce": secrets.token_urlsafe(24)}
    state_token = _state_serializer().dumps(state_payload)
    return redirect(build_authorize_url(org, state_token))


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
    if not org_id:
        return jsonify({"error": "Invalid state payload"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    updated = exchange_code_for_token(org, code)
    return redirect(url_for("main.index", message=f"Connected {updated.label}"))


@main_bp.route("/api/query", methods=["POST"])
def api_query() -> Response:
    payload = request.get_json(force=True)
    org_id = payload.get("org_id")
    soql = payload.get("query")
    if not org_id or not soql:
        return jsonify({"error": "org_id and query are required"}), 400

    org = storage.get(org_id)
    if not org:
        return jsonify({"error": "Unknown org"}), 404

    try:
        result = query(org, soql)
    except SalesforceError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result)


@main_bp.errorhandler(SalesforceError)
def handle_salesforce_error(exc: SalesforceError):
    return jsonify({"error": str(exc)}), 400
