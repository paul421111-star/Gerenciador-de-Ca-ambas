@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\next\package.json (
 call npm.cmd install
 if errorlevel 1 goto falha
)
if not exist data\demo.sqlite (
 call npm.cmd run demo
 if errorlevel 1 goto falha
)
echo MODO DEMONSTRATIVO. O banco real nao sera alterado.
echo Abra http://localhost:3000 quando aparecer Ready no terminal.
call npm.cmd run dev:demo
goto fim
:falha
pause
exit /b 1
:fim
endlocal
