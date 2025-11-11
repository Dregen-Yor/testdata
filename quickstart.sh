#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  echo "[*] Creating virtual environment..."
  python3 -m venv .venv
fi

# shellcheck source=/dev/null
source .venv/bin/activate

echo "[*] Installing dependencies (fast)..."
pip install --disable-pip-version-check -q -r requirements.txt

URL="http://127.0.0.1:8000/"
echo "[*] Opening $URL in your browser..."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif [[ "$OSTYPE" == darwin* ]]; then
  open "$URL" || true
fi

echo "[*] Starting dev server (Ctrl+C to stop)..."
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
