@echo off
chcp 65001 >nul
cd /d D:\soft\Erii

set "NODE_OPTIONS=--max-old-space-size=1536"
set "PATH=C:\Users\kk\AppData\Roaming\npm;D:\devsoft\nodejs;%PATH%"

echo ===================================================
echo              Erii AI Companion  启动中
echo ===================================================

echo [1/4] 清理旧进程，释放端口 17321 / 17494...
taskkill /F /IM electron.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :17321 ^| findstr LISTEN 2^>nul') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :17494 ^| findstr LISTEN 2^>nul') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] 启动 FunASR SenseVoice STT (Port 17494)...
start "" /B python -u packages\funasr-server\server.py > packages\funasr-server\server.log 2>&1
timeout /t 1 /nobreak >nul

echo [3/4] 启动 Companion 侧车服务 (Port 17321)...
start "" /B node --env-file-if-exists=.env packages\companion-core\src\server.mjs
timeout /t 2 /nobreak >nul

echo [4/4] 启动 Erii 桌面端 (实时滚动日志)...
pnpm run dev:tamagotchi
