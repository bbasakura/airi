$ErrorActionPreference = 'SilentlyContinue'
$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
$repoRoot = 'D:\soft\Erii'

# 1. Stop old Electron app instances
Get-Process -Name "electron" | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Free port 17321 (Companion Core)
$conns = Get-NetTCPConnection -LocalPort 17321 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

# 3. Launch Companion Core silently in background
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run companion:dev" `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

# 4. Launch Desktop Electron UI window
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run dev:tamagotchi"
