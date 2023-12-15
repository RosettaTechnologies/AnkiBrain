@echo off
PowerShell -ExecutionPolicy Bypass -Command "Start-Process PowerShell -ArgumentList '-NoExit -ExecutionPolicy Bypass -File %~dp0win-setup-python-env.ps1'"