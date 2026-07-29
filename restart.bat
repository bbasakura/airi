@echo off
chcp 65001 >nul
set "NODE_OPTIONS=--max-old-space-size=1536"
set "PATH=C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs;%PATH%"

echo ===================================================
echo             Erii AI Companion 滚动日志模式          
echo ===================================================

echo [1/3] 正在清理旧进程并释放 17321 端口...
taskkill /F /IM electron.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :17321 ^| findstr LISTEN 2^>nul') do taskkill /F /PID %%a 2>nul

timeout /t 1 /nobreak >nul

echo [2/3] 正在后台启动 Companion 侧车服务 (Port 17321)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:PATH += ';C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs'; Start-Process -FilePath 'node' -ArgumentList '--env-file-if-exists=.env', 'packages/companion-core/src/server.mjs' -WindowStyle Hidden -WorkingDirectory 'D:\soft\Erii'"

echo [3/3] 正在运行 Erii 桌面端并持续输出实时滚动日志...
pnpm run dev:tamagotchi
