Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""D:\soft\Erii\scripts\restart-silent.ps1""", 0, False
