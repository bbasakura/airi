@echo off
chcp 65001 >nul
echo [FunASR] Starting SenseVoice STT on port 17494...
cd /d D:\soft\Erii\packages\funasr-server
python -u server.py
