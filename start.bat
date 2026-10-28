@echo off
title COLLECT PRO
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n'est pas installe. Telechargez la version LTS sur https://nodejs.org puis relancez. & pause & exit /b)
if not exist .env echo [!] Fichier .env absent : copiez .env.example en .env et renseignez ADMIN_EMAIL et ADMIN_PASSWORD.
start "" http://localhost:3000/admin.html
node --disable-warning=ExperimentalWarning server.js
pause
