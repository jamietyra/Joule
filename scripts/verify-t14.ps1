# T14 Smoke Test — Joule entrypoint verify
# Usage: pwsh scripts/verify-t14.ps1
# Expected: any HTTP response (200/400/502) = PASS

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot

Set-Location $repoRoot

Write-Output "[T14] Starting Joule server..."
$job = Start-Process -FilePath "npx" `
  -ArgumentList "tsx", "--env-file=.env", "src/index.ts" `
  -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\joule-stdout.txt" `
  -RedirectStandardError "$env:TEMP\joule-stderr.txt"

Write-Output "[T14] Waiting 5s for server to bind..."
Start-Sleep -Seconds 5

# Show startup output
if (Test-Path "$env:TEMP\joule-stderr.txt") {
  $startupLog = Get-Content "$env:TEMP\joule-stderr.txt" -ErrorAction SilentlyContinue
  if ($startupLog) {
    Write-Output "[T14] Startup stderr:"
    $startupLog | ForEach-Object { Write-Output "  $_" }
  }
}
if (Test-Path "$env:TEMP\joule-stdout.txt") {
  $startupOut = Get-Content "$env:TEMP\joule-stdout.txt" -ErrorAction SilentlyContinue
  if ($startupOut) {
    Write-Output "[T14] Startup stdout:"
    $startupOut | ForEach-Object { Write-Output "  $_" }
  }
}

Write-Output "[T14] Sending smoke test request..."
$exitCode = 0
try {
  $body = '{"model":"any","messages":[{"role":"user","content":"hi"}]}'
  $response = Invoke-WebRequest `
    -Uri "http://localhost:3001/v1/chat/completions" `
    -Method POST `
    -Headers @{"Content-Type" = "application/json"} `
    -Body $body `
    -UseBasicParsing `
    -SkipHttpErrorCheck `
    -TimeoutSec 10
  Write-Output "[T14] HTTP $($response.StatusCode) — PASS (any 2xx/4xx/5xx = server running)"
  $exitCode = 0
} catch {
  Write-Output "[T14] Connection FAILED: $_"
  Write-Output "[T14] RESULT: FAIL — server did not respond"
  $exitCode = 1
}

Write-Output "[T14] Stopping server (PID $($job.Id))..."
Stop-Process -Id $job.Id -Force -ErrorAction SilentlyContinue

exit $exitCode
