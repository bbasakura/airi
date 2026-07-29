$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
Set-Location 'D:\soft\Erii'

Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Stop-Process -Force
$conns = Get-NetTCPConnection -LocalPort 17321 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'packages/companion-core/src/server.mjs' -WindowStyle Hidden -WorkingDirectory 'D:\soft\Erii'

Start-Sleep -Seconds 1

pnpm run dev:tamagotchi
