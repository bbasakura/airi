$ErrorActionPreference = 'SilentlyContinue'
$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'
$repoRoot = 'D:\soft\Erii'

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "            Erii AI Companion 一键重启              " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host "[1/3] 正在停止旧进程并释放 17321 端口..." -ForegroundColor Yellow
Get-Process -Name "electron" | Stop-Process -Force -ErrorAction SilentlyContinue
$conns = Get-NetTCPConnection -LocalPort 17321 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1

Write-Host "[2/3] 正在拉起 Companion 侧车后台服务..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "`$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run companion:dev" -WindowStyle Minimized

Start-Sleep -Seconds 2

Write-Host "[3/3] 正在启动 AIRI 桌面前端视觉窗口..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "`$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Set-Location '$repoRoot'; pnpm run dev:tamagotchi"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] 一键重启完成！" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
