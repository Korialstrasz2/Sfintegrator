@echo off
setlocal enabledelayedexpansion

:: Determine the root directory of the project (the directory of this script)
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Create a Python virtual environment if it doesn't exist yet
if not exist "%SCRIPT_DIR%venv" (
    echo Creating Python virtual environment...
    python -m venv "%SCRIPT_DIR%venv"
    if errorlevel 1 (
        echo Failed to create virtual environment. Ensure Python is installed and on PATH.
        exit /b 1
    )
)

:: Activate the virtual environment
call "%SCRIPT_DIR%venv\Scripts\activate.bat"
if errorlevel 1 (
    echo Failed to activate virtual environment.
    exit /b 1
)

:: Upgrade pip to the latest version for reliability
echo Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo Failed to upgrade pip.
    exit /b 1
)

:: Install project dependencies
echo Installing project dependencies...
pip install -r "%SCRIPT_DIR%requirements.txt"
if errorlevel 1 (
    echo Failed to install dependencies.
    exit /b 1
)

:: Configure Flask application environment variable
set "FLASK_APP=app"

:: Start the Flask development server
echo Starting Flask development server...
flask run

endlocal
