@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "CLIENT_ID=01ab8ac9400c4e429b23"

where winget >nul 2>nul || (
  echo winget is required but was not found.
  goto :end_error
)

where gh >nul 2>nul || (
  echo Installing GitHub CLI with winget...
  winget install --exact --id GitHub.cli --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto :fail_install
)

gh auth status >nul 2>nul || (
  echo Starting GitHub CLI sign-in...
  gh auth login --web --hostname github.com --git-protocol https --skip-ssh-key
  if errorlevel 1 goto :fail_auth
)

for /f "usebackq delims=" %%I in (`curl --silent --show-error -X POST https://github.com/login/device/code -H "Accept: application/json" -H "Content-Type: application/x-www-form-urlencoded" --data "client_id=%CLIENT_ID%&scope=read:user"`) do set "FLOW_JSON=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:FLOW_JSON | ConvertFrom-Json; [Console]::Write($j.user_code)"`) do set "USER_CODE=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:FLOW_JSON | ConvertFrom-Json; [Console]::Write($j.device_code)"`) do set "DEVICE_CODE=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:FLOW_JSON | ConvertFrom-Json; [Console]::Write($j.verification_uri)"`) do set "VERIFY_URL=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:FLOW_JSON | ConvertFrom-Json; if ($null -eq $j.interval) { [Console]::Write(5) } else { [Console]::Write($j.interval) }"`) do set "INTERVAL=%%I"
if not defined INTERVAL set "INTERVAL=5"

if not defined USER_CODE goto :fail_device_flow
if not defined DEVICE_CODE goto :fail_device_flow
if not defined VERIFY_URL goto :fail_device_flow

powershell -NoProfile -Command "Start-Process $env:VERIFY_URL" >nul 2>nul || (
  echo Could not open the browser automatically.
)
echo Open: %VERIFY_URL%
echo Enter code: %USER_CODE%
echo Waiting for approval...

:poll
timeout /t %INTERVAL% /nobreak >nul
for /f "usebackq delims=" %%I in (`curl --silent --show-error -X POST https://github.com/login/oauth/access_token -H "Accept: application/json" -H "Content-Type: application/x-www-form-urlencoded" --data "client_id=%CLIENT_ID%&device_code=%DEVICE_CODE%&grant_type=urn:ietf:params:oauth:grant-type:device_code"`) do set "TOKEN_JSON=%%I"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:TOKEN_JSON | ConvertFrom-Json; if ($null -eq $j.error) { [Console]::Write('') } else { [Console]::Write($j.error) }"`) do set "ERROR_CODE=%%I"

if not defined ERROR_CODE goto have_github_token

if /I "%ERROR_CODE%"=="authorization_pending" (
  set "ERROR_CODE="
  goto poll
)

if /I "%ERROR_CODE%"=="slow_down" (
  set /a INTERVAL=%INTERVAL%+5
  set "ERROR_CODE="
  goto poll
)

echo Device flow failed: %TOKEN_JSON%
goto :end_error

:have_github_token
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$j = $env:TOKEN_JSON | ConvertFrom-Json; [Console]::Write($j.access_token)"`) do set "GITHUB_TOKEN=%%I"

curl --silent --show-error ^
  -H "Authorization: Bearer %GITHUB_TOKEN%" ^
  -H "Accept: application/json" ^
  -H "Editor-Version: vscode/1.96.0" ^
  -H "Editor-Plugin-Version: copilot-chat/0.23.0" ^
  -H "Copilot-Integration-Id: vscode-chat" ^
  https://api.github.com/copilot_internal/v2/token ^
| powershell -NoProfile -Command "$j = $input | Out-String | ConvertFrom-Json; [Console]::Write($j.token)"

echo.
goto :end_success

:fail_install
echo Failed to install GitHub CLI with winget.
goto :end_error

:fail_auth
echo GitHub CLI sign-in was cancelled or failed.
goto :end_error

:fail_device_flow
echo GitHub device flow did not return the expected fields.
echo Response: %FLOW_JSON%
goto :end_error

:end_success
echo Token ready. Press any key to close this window.
pause >nul
goto :eof

:end_error
echo Press any key to close this window.
pause >nul
goto :eof
