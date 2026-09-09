$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Creator Algorithm Tracker.lnk'
$launcherPath = Join-Path $PSScriptRoot 'launch.ps1'
$runtimeDir = Join-Path $projectRoot '.runtime'
$iconPath = Join-Path $runtimeDir 'creator-algorithm-tracker.ico'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

# Create a small local app icon without downloading or installing anything.
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 128, 128
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(8, 11, 18))
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(76, 111, 255))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$graphics.FillEllipse($blue, 12, 12, 104, 104)
$font = New-Object System.Drawing.Font 'Segoe UI', 38, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString('CAT', $font, $white, (New-Object System.Drawing.RectangleF 10, 10, 108, 108), $format)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Dispose(); $icon.Dispose(); $format.Dispose(); $font.Dispose(); $white.Dispose(); $blue.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcherPath + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.WindowStyle = 7
$shortcut.Description = 'Launch Creator Algorithm Tracker'
$shortcut.IconLocation = $iconPath + ',0'
$shortcut.Save()
Write-Output "Installed: $shortcutPath"
