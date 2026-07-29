$ErrorActionPreference = 'SilentlyContinue'
$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
$repoRoot = 'D:\soft\Erii'

# Stop old Electron windows
Get-Process -Name "electron" | Stop-Process -Force -ErrorAction SilentlyContinue

# Free port 17321 to prevent EADDRINUSE
$conns = Get-NetTCPConnection -LocalPort 17321 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

# Launch Companion Core completely hidden
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run companion:dev" `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

# Launch Desktop UI completely hidden
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run dev:tamagotchi" `
    -WindowStyle Hidden
