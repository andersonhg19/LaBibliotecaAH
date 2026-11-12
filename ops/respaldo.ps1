# Respaldo nocturno de La Biblioteca AH (estandares: pg_dump -Fc + sha256 + rotacion; imprime RESUMEN:/FALLA:).
# Que se respalda:
#   - auth_db y biblioteca_db con pg_dump -Fc (usuarios, ejemplares, progreso, notas, estantes...).
#   - NADA de libros, audio ni portadas: se decidio no copiarlos para no llenar el disco.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File respaldo.ps1 [-Destino D:\respaldos\biblioteca] [-Dias 14]
param(
    [string]$Destino = 'D:\respaldos\biblioteca',
    [string]$Datos = 'E:\LaBibliotecaAH\datos',
    [string]$Contenedor = 'biblioteca-ah-postgres-1',
    [int]$Dias = 14
)
$ErrorActionPreference = 'Stop'
$inicio = Get-Date
$carpeta = Join-Path $Destino ($inicio.ToString('yyyy-MM-dd_HHmm'))
$log = Join-Path $Destino 'respaldo.log'

function Escribir([string]$texto) {
    $linea = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto
    Write-Output $linea
    Add-Content -Path $log -Value $linea -Encoding utf8
}

try {
    New-Item -ItemType Directory -Force $carpeta | Out-Null

    $estado = docker inspect -f '{{.State.Health.Status}}' $Contenedor 2>$null
    if ($estado -ne 'healthy') { throw "el contenedor $Contenedor no esta sano (estado: '$estado')" }

    foreach ($db in 'auth_db', 'biblioteca_db') {
        $dentro = "/tmp/$db.dump"
        docker exec $Contenedor sh -c "pg_dump -U `"`$POSTGRES_USER`" -Fc -f $dentro $db"
        if ($LASTEXITCODE -ne 0) { throw "pg_dump de $db fallo (codigo $LASTEXITCODE)" }
        docker cp "${Contenedor}:$dentro" (Join-Path $carpeta "$db.dump") | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "docker cp de $db fallo" }
        docker exec $Contenedor rm -f $dentro | Out-Null
    }

    Get-ChildItem $carpeta -Filter *.dump | ForEach-Object {
        '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
    } | Set-Content (Join-Path $carpeta 'sha256.txt') -Encoding ascii

    # Los LIBROS no se copian (decision de Anderson, 2026-11-11): una copia de la biblioteca
    # gastaria el almacenamiento del servidor. Solo se respaldan las bases.

    $borradas = 0
    Get-ChildItem $Destino -Directory | Where-Object {
        $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' -and $_.LastWriteTime -lt $inicio.AddDays(-$Dias)
    } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force; $borradas++ }

    $mb = [math]::Round(((Get-ChildItem $carpeta -File | Measure-Object Length -Sum).Sum / 1MB), 2)
    Escribir "RESUMEN: respaldo OK en $carpeta ($mb MB de bases, sin libros), $borradas respaldos viejos rotados (> $Dias dias)"
    exit 0
} catch {
    Escribir "FALLA: $($_.Exception.Message)"
    exit 1
}
