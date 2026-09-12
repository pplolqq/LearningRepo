@echo off
rem Launch seekFile. Everything must be running with its HTTP server enabled.
cd /d "%~dp0"
python server.py
if errorlevel 1 pause
