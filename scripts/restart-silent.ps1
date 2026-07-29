$ErrorActionPreference = 'SilentlyContinue'
$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
$repoRoot = 'D:\soft\Erii'

# 1. Stop old processes & free port 17321
Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force
$conns = Get-NetTCPConnection -LocalPort 17321 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

# 2. Launch Companion Core silently
Start-Process -FilePath "node" -ArgumentList "--env-file-if-exists=.env", "packages/companion-core/src/server.mjs" -WindowStyle Hidden -WorkingDirectory $repoRoot

Start-Sleep -Seconds 1

# 3. Launch Desktop UI without any terminal window
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -Command `$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run dev:tamagotchi" `
    -WindowStyle Hidden
