@echo off
REM Serve the dashboard over http:// and open it in the default browser.
REM
REM Why this exists: opening index.html straight from the explorer puts the page
REM on a file:// origin, where fetch() cannot read activity_logs.db at all (the
REM Fetch API does not implement the file: scheme, flags included). The app then
REM silently falls back to demo data. Serving over http:// is what makes
REM loadDefault(), Refresh and polling work against the real database.
REM
REM Bound to 127.0.0.1 on purpose: the logs are not exposed to the local network.
REM Close this window to stop the server.

setlocal
cd /d "%~dp0"

set "PORT=8250"
set "URL=http://127.0.0.1:%PORT%/index.html"

REM Prefer the py launcher, fall back to python on PATH.
set "PY=python"
where py >nul 2>&1 && set "PY=py"

if not exist "activity_logs.db" (
  echo WARNING: activity_logs.db not found in %CD%.
  echo The dashboard will start, but it will fall back to demo data.
  echo.
)

REM Open the browser only once the port actually accepts a connection, so the
REM first request cannot race the server's startup. Runs detached; the server
REM below keeps this window. Output is suppressed because /b shares this
REM console, and a failed auto-open would otherwise garble the request log.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 150; $i++) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %PORT%); $c.Close(); Start-Process '%URL%'; break } catch { Start-Sleep -Milliseconds 100 } }" >nul 2>&1

echo LogReporter serving %CD%
echo   %URL%
echo.
echo If a browser tab did not open, paste that URL in yourself.
echo Close this window (or press Ctrl+C) to stop the server.
echo.

REM serve.py, not `-m http.server`: it adds the POST /api/delete endpoint that
REM makes Maintenance deletes actually persist to activity_logs.db.
%PY% serve.py %PORT%

REM Reached on Ctrl+C as well as on a bind failure; keep the window up so the
REM error text stays readable instead of vanishing with the console.
echo.
echo Server stopped. If the port was already in use, the dashboard you saw was
echo being served by an instance that is still running in another window.
pause
