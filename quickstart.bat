@echo off
setlocal
cd /d %~dp0

REM Create venv if missing
if not exist .venv (
  echo [*] Creating virtual environment...
  py -3 -m venv .venv
)

set "PIP=%CD%\.venv\Scripts\pip.exe"
set "PY=%CD%\.venv\Scripts\python.exe"

echo [*] Installing dependencies (fast)...
"%PIP%" install --disable-pip-version-check -q -r requirements.txt

echo [*] Opening http://127.0.0.1:8000/ in your browser...
start "" http://127.0.0.1:8000/

echo [*] Starting dev server (Ctrl+C to stop)...
"%PY%" -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload

endlocal
