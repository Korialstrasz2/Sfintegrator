from __future__ import annotations

import os

from flask import Flask

from .routes import main_bp
from .storage import ensure_storage


def create_app() -> Flask:
    """Application factory."""
    ensure_storage()
    app = Flask(__name__)
    app.config.from_mapping(SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "dev"))
    app.register_blueprint(main_bp)
    return app


app = create_app()
