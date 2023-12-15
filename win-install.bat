@echo off
:: PowerShell -NoProfile -ExecutionPolicy Bypass -File win-admin-install-core-deps.ps1 -Verb RunAs

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process PowerShell -Verb RunAs -ArgumentList '-NoExit -ExecutionPolicy Bypass -File %~dp0win-admin-install-core-deps.ps1'"
pause


PowerShell -ExecutionPolicy Bypass -Command "Start-Process PowerShell -ArgumentList '-NoExit -ExecutionPolicy Bypass -File %~dp0win-setup-python-env.ps1'"