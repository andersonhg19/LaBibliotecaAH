# Construye las imagenes de La Biblioteca AH desde una sesion SSH, cuando la tarea de sesion (ops/casa-sesion.sh,
# tarea BibliotecaAH-Sesion) no corre. Por SSH "docker build" falla por dos motivos:
#   1. el credsStore de Docker Desktop (desktop/wincred) no se puede usar fuera de la sesion de Windows;
#   2. BuildKit no arranca por SSH.
# Arreglo: DOCKER_BUILDKIT=0 (constructor clasico) y un DOCKER_CONFIG propio con "credsStore": "" y el mismo
# contexto de Docker que la sesion. Las imagenes base tienen que estar ya en casa (el pull tampoco va por SSH).
# Limitacion: el traductor usa "RUN --mount" (solo BuildKit) y NO se construye asi; si cambio, construirlo por la
# sesion (despliegue.md, "Traductor") o, si su codigo no cambio, reetiquetar la imagen anterior:
#   docker tag bah/traductor:<TAG anterior> bah/traductor:<TAG nuevo>
# Uso (en casa):  powershell -NoProfile -ExecutionPolicy Bypass -File construir-ssh.ps1 [-EnvFile C:\srv\biblioteca-ah\.env]
#                   [-Tag 0.4.0] [-ApiUrl https://...:7051] [-Repo <ruta del repo>] [-Servicios taller,frontend]
# TAG y API_URL se leen del .env si no se pasan (nada mas se lee de el; no imprime secretos).
# Imprime una linea BUILD por imagen y termina con 1 si alguna falla.
param(
    [string]$EnvFile = 'C:\srv\biblioteca-ah\.env',
    [string]$Tag = '',
    [string]$ApiUrl = '',
    [string]$Repo = 'C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH',
    [string]$DockerConfig = (Join-Path $env:LOCALAPPDATA 'biblioteca-ah\dockercfg-ssh'),
    [string[]]$Servicios = @('postgres', 'discovery-service', 'gateway-service', 'auth-service', 'biblioteca-service', 'taller', 'frontend')
)

function LeerEnv([string]$clave) {
    if (-not (Test-Path $EnvFile)) { return '' }
    $linea = Select-String -Path $EnvFile -Pattern "^$clave=" | Select-Object -First 1
    if ($null -eq $linea) { return '' }
    return ($linea.Line -split '=', 2)[1].Trim()
}

if ($Tag -eq '') { $Tag = LeerEnv 'TAG' }
if ($ApiUrl -eq '') { $ApiUrl = LeerEnv 'API_URL' }
if ($Tag -eq '') { 'FALLA: sin TAG (ni -Tag ni TAG= en el .env)'; exit 1 }
if ($Servicios -contains 'frontend' -and $ApiUrl -eq '') { 'FALLA: la web necesita API_URL (-ApiUrl o API_URL= en el .env)'; exit 1 }
if ($Servicios -contains 'traductor') { 'FALLA: el traductor usa RUN --mount y no se construye sin BuildKit; construirlo por la sesion'; exit 1 }

# DOCKER_CONFIG sin credsStore y con el contexto de la sesion (se crea la primera vez).
if (-not (Test-Path (Join-Path $DockerConfig 'config.json'))) {
    New-Item -ItemType Directory -Force $DockerConfig | Out-Null
    $contexto = 'default'
    $original = Join-Path $env:USERPROFILE '.docker\config.json'
    if (Test-Path $original) {
        $c = Get-Content $original -Raw | ConvertFrom-Json
        if ($c.currentContext) { $contexto = $c.currentContext }
    }
    $contextos = Join-Path $env:USERPROFILE '.docker\contexts'
    if (Test-Path $contextos) { Copy-Item $contextos $DockerConfig -Recurse -Force }
    $json = '{"auths":{},"credsStore":"","currentContext":"' + $contexto + '"}'
    [IO.File]::WriteAllText((Join-Path $DockerConfig 'config.json'), $json, (New-Object Text.UTF8Encoding($false)))
}
$env:DOCKER_BUILDKIT = '0'
$env:DOCKER_CONFIG = $DockerConfig

$fallos = 0
foreach ($s in $Servicios) {
    switch ($s) {
        'postgres' { $ctx = "$Repo\backend\init-db"; $df = "$Repo\backend\init-db\Dockerfile"; $extra = @() }
        'taller'   { $ctx = "$Repo\taller";   $df = "$Repo\taller\Dockerfile";   $extra = @() }
        'frontend' { $ctx = "$Repo\frontend"; $df = "$Repo\frontend\Dockerfile"; $extra = @('--build-arg', "EXPO_PUBLIC_API_URL=$ApiUrl") }
        default    { $ctx = "$Repo\backend";  $df = "$Repo\backend\$s\Dockerfile"; $extra = @() }
    }
    $t0 = Get-Date
    $out = docker build -q -t "bah/${s}:$Tag" -f $df @extra $ctx 2>&1
    $rc = $LASTEXITCODE
    if ($rc -ne 0) { $fallos++ }
    "BUILD bah/${s}:$Tag rc=$rc $([int]((Get-Date) - $t0).TotalSeconds)s $(($out | Select-Object -Last 2) -join ' | ')"
}
if ($fallos -gt 0) { "FALLA: $fallos imagen(es) sin construir"; exit 1 }
"RESUMEN: $($Servicios.Count) imagen(es) bah/*:$Tag construidas por SSH"
