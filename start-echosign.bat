@echo off
title EchoSign (http://localhost:5000)
cd /d "%~dp0backend"
echo Building the app and starting EchoSign...
echo When you see "Server ready", open http://localhost:5000
call npm run live
pause
