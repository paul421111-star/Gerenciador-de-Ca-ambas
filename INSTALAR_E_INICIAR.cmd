@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instale o Node.js 22.16 ou superior da linha 22 e abra este arquivo novamente.
 pause
 exit /b 1
)
echo === JR CACAMBAS - PRIMEIRA INSTALACAO ===
echo Esta etapa precisa de internet para baixar as dependencias.
call npm.cmd install
if errorlevel 1 goto falha
call npm.cmd run setup
if errorlevel 1 goto falha
start "" "http://localhost:3000"
call npm.cmd run dev
goto fim
:falha
echo.
echo Nao foi possivel concluir. Veja o erro acima e o arquivo docs\INSTALACAO.md.
echo Se o banco ja foi criado, use INICIAR.cmd. Nenhum dado foi sobrescrito.
pause
exit /b 1
:fim
endlocal
