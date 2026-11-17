@echo off
cd /d "%~dp0"
start "" http://localhost:4173
node local-dev-server.js
