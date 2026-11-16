@echo off
cd /d "%~dp0"
where node >nul 2>&1
if not errorlevel 1 (
  node server.mjs
) else (
  if not exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    echo Node.js was not found. Install Node.js or open this folder in Codex and run node server.mjs.
    pause
    exit /b 1
  )
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
)
if errorlevel 1 pause
