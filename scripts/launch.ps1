param([switch]$NoWindow)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$appUrl = 'http://localhost:3000'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Test-App {
    try {
        $health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 3
        return $health.app -eq 'creator-algorithm-tracker'
    } catch { return $false }
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\CreatorAlgorithmTrackerLauncher')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(180000) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launcher is still starting the app. Try again shortly.' }

    # Restart this machine's existing self-owned cluster when needed. Never initialize or alter a database.
    $envFile = Join-Path $projectRoot '.env'
    $dbLine = if (Test-Path -LiteralPath $envFile) { Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } }
    $pgData = Join-Path $env:USERPROFILE 'pgdata-creator-tracker'
    $pgCtl = Join-Path $env:ProgramFiles 'PostgreSQL\17\bin\pg_ctl.exe'
    if ($dbLine -match '@(localhost|127\.0\.0\.1):5433/' -and (Test-Path -LiteralPath $pgData) -and (Test-Path -LiteralPath $pgCtl)) {
        & $pgCtl status -D $pgData *> $null
        if ($LASTEXITCODE -ne 0) {
            $pgStart = Start-Process -FilePath $pgCtl -ArgumentList @('start', '-D', ('"' + $pgData + '"'), '-l', ('"' + (Join-Path $runtimeDir 'postgres.log') + '"'), '-o', '"-p 5433"', '-w') -WindowStyle Hidden -Wait -PassThru
            if ($pgStart.ExitCode -ne 0) { throw 'Could not start PostgreSQL. See .runtime\postgres.log.' }
        }
    }

    if (-not (Test-App)) {
        $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if ($listener) { throw 'Port 3000 is busy but the app is not responding. Restart the existing dev server, then try again.' }
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $nextPath = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
        if (-not (Test-Path -LiteralPath $nextPath)) { throw 'Dependencies are missing. Run npm install in the project folder first.' }
        Start-Process -FilePath $nodePath -ArgumentList @(('"' + $nextPath + '"'), 'dev', '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'app.log') -RedirectStandardError (Join-Path $runtimeDir 'app-error.log') | Out-Null
        $deadline = (Get-Date).AddSeconds(150)
        while (-not (Test-App)) {
            if ((Get-Date) -gt $deadline) { throw 'The app did not become ready. See .runtime\app-error.log.' }
            Start-Sleep -Milliseconds 750
        }
    }
    if (-not $NoWindow) {
        $browserPaths = @(
            (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
        )
        $browserPath = $browserPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $browserPath) { throw 'Install Microsoft Edge or Google Chrome to open the app window.' }
        # Reuse the normal browser profile so existing localhost sign-in cookies remain available.
        Start-Process -FilePath $browserPath -ArgumentList "--app=$appUrl/dashboard"
    }
    Write-Output 'Creator Algorithm Tracker is ready at http://localhost:3000/dashboard'
} catch {
    $_ | Out-String | Add-Content -LiteralPath (Join-Path $runtimeDir 'launcher-error.log')
    if (-not $NoWindow) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Creator Algorithm Tracker') | Out-Null
    }
    throw
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
