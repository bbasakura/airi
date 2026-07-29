@echo off
chcp 65001 >nul
title Erii AI Companion Restart

set "PATH=C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs;%PATH%"

echo ===================================================
echo               Erii AI Companion 重启器             
echo ===================================================

echo [1/3] 正在终止旧 Electron 进程及清理 17321 端口...
taskkill /F /IM electron.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :17321 ^| findstr LISTEN 2^>nul') do taskkill /F /PID %%a 2>nul

timeout /t 1 /nobreak >nul

echo [2/3] 正在拉起 Companion Core 后台服务...
start "Erii-Companion-Core" /min cmd /c "cd /d D:\soft\Erii && set PATH=C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs;%%PATH%% && pnpm run companion:dev"

timeout /t 2 /nobreak >nul

echo [3/3] 正在拉起 Erii 桌面端...
start "Erii-Desktop-UI" cmd /c "cd /d D:\soft\Erii && set PATH=C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs;%%PATH%% && pnpm run dev:tamagotchi"

echo ===================================================
echo [SUCCESS] Erii AI Companion 已成功拉起重启！
echo ===================================================
