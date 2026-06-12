if ($PSVersionTable.PSEdition -ne 'Desktop') {
    Write-Host 'This script must be run with Windows PowerShell, not PowerShell 7+.'
    Write-Host 'Run it with:'
    Write-Host 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\a.ps1'
    return
}

$ErrorActionPreference = 'Stop'
$clientId = '01ab8ac9400c4e429b23'
$deviceCodeUrl = 'https://github.com/login/device/code'
$accessTokenUrl = 'https://github.com/login/oauth/access_token'
$copilotTokenUrl = 'https://api.github.com/copilot_internal/v2/token'

try {
    $device = Invoke-RestMethod -Method Post -Uri $deviceCodeUrl -Headers @{
        Accept = 'application/json'
    } -Body @{
        client_id = $clientId
        scope = 'read:user'
    }

    if (-not $device.device_code -or -not $device.user_code -or -not $device.verification_uri) {
        throw "GitHub device flow response was missing required fields: $($device | ConvertTo-Json -Compress)"
    }

    Start-Process $device.verification_uri
    Write-Host "Open: $($device.verification_uri)"
    Write-Host "Enter code: $($device.user_code)"
    Write-Host 'Waiting for approval...'

    $interval = if ($device.interval) { [int]$device.interval } else { 5 }
    $expiresAt = (Get-Date).AddSeconds([int]$device.expires_in)
    $githubToken = $null

    while ((Get-Date) -lt $expiresAt) {
        Start-Sleep -Seconds $interval

        $tokenResponse = Invoke-RestMethod -Method Post -Uri $accessTokenUrl -Headers @{
            Accept = 'application/json'
        } -Body @{
            client_id = $clientId
            device_code = $device.device_code
            grant_type = 'urn:ietf:params:oauth:grant-type:device_code'
        }

        if ($tokenResponse.access_token) {
            $githubToken = $tokenResponse.access_token
            break
        }

        switch ($tokenResponse.error) {
            'authorization_pending' { continue }
            'slow_down' { $interval += 5; continue }
            'access_denied' { throw 'Authorization was denied.' }
            'expired_token' { throw 'The device code expired.' }
            default { throw "Device flow failed: $($tokenResponse | ConvertTo-Json -Compress)" }
        }
    }

    if (-not $githubToken) {
        throw 'Timed out waiting for approval.'
    }

    $copilot = Invoke-RestMethod -Method Get -Uri $copilotTokenUrl -Headers @{
        Authorization = "Bearer $githubToken"
        Accept = 'application/json'
        'Editor-Version' = 'vscode/1.96.0'
        'Editor-Plugin-Version' = 'copilot-chat/0.23.0'
        'Copilot-Integration-Id' = 'vscode-chat'
    }

    if (-not $copilot.token) {
        throw "Copilot token response was missing token: $($copilot | ConvertTo-Json -Compress)"
    }

    $bundle = [ordered]@{
        github_token = $githubToken
        copilot_token = $copilot.token
        copilot_expires_at = $copilot.expires_at
    }

    Write-Host ''
    Write-Host 'Paste this refreshable auth bundle into GroupChat:'
    $bundle | ConvertTo-Json -Compress
} catch {
    Write-Error $_.Exception.Message
    return
}
