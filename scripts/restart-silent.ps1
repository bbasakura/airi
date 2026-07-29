$ErrorActionPreference = 'SilentlyContinue'
$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
$repoRoot = 'D:\soft\Erii'

Get-Process -Name "electron" | Stop-Process -Force

Start-Sleep -Seconds 1

# Launch Companion Core completely hidden
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run companion:dev" `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

# Launch Desktop UI
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run dev:tamagotchi" `
    -WindowStyle Hidden
