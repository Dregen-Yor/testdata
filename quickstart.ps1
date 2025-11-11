$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (!(Test-Path ".venv")) {
  Write-Host "[*] Creating virtual environment..."
  python -m venv .venv
}

$pip = Join-Path ".venv\Scripts" "pip.exe"
$py  = Join-Path ".venv\Scripts" "python.exe"

Write-Host "[*] Installing dependencies (fast)..."
& $pip install --disable-pip-version-check -q -r requirements.txt | Out-Null

Write-Host "[*] Opening http://127.0.0.1:8000/ in your browser..."
Start-Process "http://127.0.0.1:8000/"

Write-Host "[*] Starting dev server (Ctrl+C to stop)..."
& $py -m uvicorn server:app --host 127.0.0.1 --port 8000 --reload
