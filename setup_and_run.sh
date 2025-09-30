#!/usr/bin/env bash
set -euo pipefail

# Determine the directory where this script lives so that all commands
# operate relative to the project root regardless of the caller's cwd.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="$SCRIPT_DIR/venv"

# Attempt to update the repository before doing anything else so that the
# application is always run with the latest code.
if command -v git >/dev/null 2>&1; then
    echo "Updating repository..."
    if ! git pull --ff-only; then
        echo "Warning: Failed to update repository. Continuing with existing files." >&2
    fi
else
    echo "Git is not installed or not on PATH; skipping repository update." >&2
fi

# Prefer python3 when available, otherwise fall back to python.
if command -v python3 >/dev/null 2>&1; then
    PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON="python"
else
    echo "Python is not installed or not on PATH." >&2
    exit 1
fi

# Create the virtual environment if it does not already exist.
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment..."
    "$PYTHON" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# Upgrade pip to ensure reliable installs.
echo "Upgrading pip..."
python -m pip install --upgrade pip

echo "Installing project dependencies..."
pip install -r "$SCRIPT_DIR/requirements.txt"

export FLASK_APP=app

echo "Starting Flask development server..."
flask run
