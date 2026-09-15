@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\next\package.json (
 echo Execute primeiro INSTALAR_E_INICIAR.cmd.
 pause
 exit /b 1
)
echo Deixe esta janela aberta enquanto utilizar o sistema.
echo Abra http://localhost:3000 quando aparecer Ready no terminal.
call npm.cmd run dev
pause
endlocal
