#!/usr/bin/env bash
# Ejecuta un script PowerShell en la SESION de Windows del PC de casa (via la tarea BibliotecaAH-Sesion)
# y espera su resultado. Necesario para docker build/pull, que fallan en sesiones SSH (credenciales).
# Uso:  ops/casa-sesion.sh trabajo.ps1 [espera_max_seg]
#       echo 'docker compose ... build' | ops/casa-sesion.sh - [espera_max_seg]
# Imprime la salida del trabajo y termina con su codigo. Un solo trabajo a la vez (la tarea ignora
# lanzamientos simultaneos): si ya hay uno en curso, este script espera a que acabe.
set -euo pipefail
FUENTE="${1:?Uso: casa-sesion.sh <script.ps1|-> [espera_max_seg]}"
MAX="${2:-3600}"
BASE='C:/srv/biblioteca-ah/sesion'
TMP="$(mktemp)"
if [ "$FUENTE" = "-" ]; then cat > "$TMP"; else cp "$FUENTE" "$TMP"; fi

# Esperar a que no haya otro trabajo en curso.
for _ in $(seq 1 720); do
  ocupado=$(ssh casa "if ((Get-ScheduledTask BibliotecaAH-Sesion).State -eq 'Running' -or (Test-Path $BASE/pendiente.ps1)) { 'si' } else { 'no' }" | tr -d '\r')
  [ "$ocupado" = "no" ] && break
  sleep 5
done

scp -q "$TMP" "casa:$BASE/pendiente.ps1"
rm -f "$TMP"
ssh casa "Remove-Item $BASE/fin.txt -ErrorAction SilentlyContinue; schtasks /run /tn BibliotecaAH-Sesion | Out-Null"

inicio=$(date +%s)
while :; do
  fin=$(ssh casa "if (Test-Path $BASE/fin.txt) { Get-Content $BASE/fin.txt } else { '' }" | tr -d '\r\n ')
  [ -n "$fin" ] && break
  if [ $(( $(date +%s) - inicio )) -gt "$MAX" ]; then echo "FALLA: el trabajo no termino en ${MAX}s (sigue en casa; ver $BASE/salida.log)"; exit 124; fi
  sleep 5
done
ssh casa "Get-Content $BASE/salida.log -Encoding utf8"
exit "$fin"
