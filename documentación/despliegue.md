# Despliegue de La Biblioteca AH en el PC de casa

Todo se construye y se ejecuta en el PC de casa. `docker build`/`pull` no funcionan por SSH: se lanzan en la sesión de
Windows con `ops/casa-sesion.sh` (tarea programada `BibliotecaAH-Sesion`).
Oh Churus corre en el mismo equipo y **no se toca**: la biblioteca usa proyecto, red, volumen y puertos propios.

## Dónde queda cada cosa

| Qué | Dónde |
|---|---|
| Compose y `.env` | `C:\srv\biblioteca-ah\` (el `.env` solo existe allí; nunca en git) |
| Libros, EPUB normalizados, audio, portadas | `E:\LaBibliotecaAH\datos` → `/datos` (**sin respaldo**, ver «Respaldos») |
| Base de datos | volumen Docker `biblioteca-ah_bah-postgres-data` |
| Respaldos | `D:\respaldos\biblioteca\AAAA-MM-DD_HHMM\` + `respaldo.log` (disco USB) y espejo en `C:\respaldos-espejo\biblioteca\` (disco interno) |
| Vigía | tarea `BibliotecaAH-Vigia` cada 10 min → `C:\srv\biblioteca-ah\vigia.log` + notificación de Windows |
| Web | `https://casa.tail60fcb5.ts.net:7050` → `127.0.0.1:3100` (solo tailnet) |
| API (gateway) | `https://casa.tail60fcb5.ts.net:7051` → `127.0.0.1:8920` (solo tailnet) |

Puertos locales (todos en 127.0.0.1): postgres 5433, gateway 8920, auth 8921, biblioteca 8925, taller 8926, web 3100.
Eureka (discovery, 8860) ya **no** se publica en el host desde la 0.4.0: solo lo usan los servicios por la red del
compose. Oh Churus usa 3000/5432/8760/8820-8823 y Tailscale 7000/7001.

Límites de CPU por contenedor (`CPUS_*` del `.env`; por defecto Java 1,5 · postgres 2 · taller 2 · traductor 4 ·
web 0,5). **QA** pone en su `.env` valores más bajos para no competir con producción: `CPUS_JAVA=0.75`,
`CPUS_POSTGRES=0.5`, `CPUS_TALLER=1`, `CPUS_TRADUCTOR=1`, `CPUS_WEB=0.25`. Todos los contenedores llevan
`no-new-privileges` y `cap_drop: [ALL]` (postgres recupera solo CHOWN, DAC_OVERRIDE, FOWNER, SETGID y SETUID para su
arranque). Probado el 2026-11-14 levantando la 0.3.3 entera así: 8/8 healthy, login, catálogo, taller y traductor.

## Versión nueva (todo en casa; así se desplegaron la 0.2.0 el 2026-11-11 , la 0.3.0, la 0.3.1, la 0.3.2 y la 0.3.3 el 2026-11-12)

Con `TAG` ya cambiado en `C:\srv\biblioteca-ah\.env`, desde la consola (Git Bash):

```bash
C='docker compose -f C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH\docker-compose.yml --env-file C:\srv\biblioteca-ah\.env -p biblioteca-ah'
# 0a. CI EN VERDE para el commit exacto que se va a construir (si no dice "success", NO se despliega)
SHA=$(ssh casa 'git -C C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH rev-parse HEAD' | tr -d '\r')
MSYS_NO_PATHCONV=1 GH_TOKEN=$(gh auth token --user andersonhg19) gh run list -R andersonhg19/LaBibliotecaAH -w ci -c "$SHA" --json conclusion -q '.[0].conclusion'
# 0b. El TAG nuevo NO existe todavia (si existiera, el build pisaria esa imagen y el rollback se quedaria sin ella)
ssh casa '$t = ((Select-String C:\srv\biblioteca-ah\.env -Pattern "^TAG=").Line -split "=")[1]; docker image inspect "bah/gateway-service:$t" *> $null; if ($?) { "FALLA: bah/*:$t ya existe; cambia el TAG" } else { "ok: TAG $t nuevo" }'
# 1. Respaldo de las BASES (nunca de los libros); la ultima linea debe ser RESUMEN:
ssh casa 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\respaldo.ps1'
# 2. Construir en la sesion de Windows. La web toma API_URL del .env de produccion.
echo "$C build" | bash ops/casa-sesion.sh - 3000
# 3. Levantar sin construir (Flyway aplica las migraciones al arrancar)
ssh casa "$C up -d --no-build"
# 4. Humo: todo healthy, gateway UP, taller ok y web 200 (el gateway tarda ~30 s en ver los servicios en Eureka)
ssh casa "$C ps --format '{{.Service}} {{.Status}}'; curl.exe -s http://127.0.0.1:8920/actuator/health; curl.exe -s http://127.0.0.1:8926/salud; curl.exe -s -o NUL -w ' web %{http_code}' http://127.0.0.1:3100/"
```

`main` está protegida: solo entra lo que tiene el check de CI en verde, así que el paso 0a debería dar siempre
`success`; si da otra cosa (o nada, porque el commit no está subido), se para.

## Volver atrás

**Regla de las migraciones (expand/contract):** toda migración Flyway es **aditiva** y la versión N-1 tiene que seguir
funcionando con el esquema de N (tablas y columnas nuevas, nulas o con valor por defecto; nada de borrar ni renombrar).
Lo que sobra se borra en una versión **posterior** (contract), cuando N-1 ya no hace falta. Así volver atrás casi nunca
necesita tocar la base.

**Camino A — solo código (lo normal):** poner el `TAG` anterior en `.env` (hay copias en `.env.antes-*`) y repetir el
paso 3. Flyway de N-1 acepta las migraciones de N como «futuras» y arranca (probado el 2026-11-14: la 0.3.3 contra una
base con una V6 simulada → `Successfully validated 6 migrations`, `Current version of schema "public": 6`, arranca en
7 s). Las imágenes viejas siguen en casa.

**Camino B — hay que restaurar la base** (datos estropeados por N, o una migración que no era aditiva). Nunca con
`pg_restore --clean` sobre la base en uso: solo borra lo que está en el dump, deja las tablas nuevas, la historia de
Flyway vuelve atrás y el siguiente despliegue de N falla con «already exists» (comprobado). Se restaura en una base
**nueva** y se cambian los nombres; la vieja queda aparte para mirar qué pasó. En casa, en PowerShell (ejemplo con
`biblioteca_db`, cuyos dueños son `biblioteca-service` y `taller`; para `auth_db` el dueño es `auth-service`):

```powershell
$C  = @('compose', '-f', 'C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH\docker-compose.yml', '--env-file', 'C:\srv\biblioteca-ah\.env', '-p', 'biblioteca-ah')
$PG = 'biblioteca-ah-postgres-1'
$DB = 'biblioteca_db'                              # o auth_db
$R  = 'D:\respaldos\biblioteca\AAAA-MM-DD_HHMM'    # el respaldo elegido, nunca uno -FALLIDO (o su copia en C:\respaldos-espejo\biblioteca)
# 1. El respaldo esta entero (todas True)
Get-Content "$R\sha256.txt" | ForEach-Object { $h, $f = $_ -split '\s+', 2; "$f " + ((Get-FileHash "$R\$f" -Algorithm SHA256).Hash.ToLower() -eq $h) }
# 2. Parar los servicios duenos de esa base (auth_db: auth-service)
docker @C stop biblioteca-service taller
# 3. Restaurar en una base NUEVA
docker cp "$R\$DB.dump" "${PG}:/tmp/r.dump"
docker exec -e DB=$DB $PG sh -c 'createdb -U "$POSTGRES_USER" "${DB}_restaurada" && pg_restore -U "$POSTGRES_USER" --exit-on-error -d "${DB}_restaurada" /tmp/r.dump'
# 4. Cambiar los nombres (la zona horaria de la base no viaja en el dump: se pone aqui)
@"
ALTER DATABASE ${DB}_restaurada SET timezone TO 'America/Bogota';
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$DB', '${DB}_restaurada') AND pid <> pg_backend_pid();
ALTER DATABASE $DB RENAME TO ${DB}_antes_$(Get-Date -Format yyyyMMdd_HHmm);
ALTER DATABASE ${DB}_restaurada RENAME TO $DB;
"@ | docker exec -i $PG sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1'
docker exec $PG rm -f /tmp/r.dump
# 5. Verificar: historia de Flyway y zona horaria de la base restaurada
"select string_agg(version, ' ' order by installed_rank) from flyway_schema_history; show timezone;" |
    docker exec -i -e DB=$DB $PG sh -c 'psql -U "$POSTGRES_USER" -d "$DB" -tA'
# 6. TAG anterior en .env y levantar
docker @C up -d --no-build
```

Probado el 2026-11-14 en un postgres desechable con el respaldo de QA y una V6 simulada (tabla nueva, columna nueva y
fila de Flyway): tras el camino B la base tiene sus 14 tablas, Flyway `1 2 3 4 5`, zona `America/Bogota`, ningún
resto de la V6, y volver a aplicar la V6 no choca. La base `*_antes_*` se borra a mano (`dropdb`) cuando ya no haga
falta.

## Relleno de géneros tras desplegar la v1.4 (una vez; se puede repetir sin riesgo)

Los libros convertidos antes de la v1.4 no tienen las materias del archivo (`dc:subject`) y sus obras llegan sin
género. Tras levantar la versión nueva, una cuenta **ADMIN** pide el relleno:

```bash
# Desde la consola (Git Bash). 1) credenciales de una cuenta ADMIN en un fichero temporal en casa
echo '{"usuario":"admin@biblioteca.ah","password":"<SEED_ADMIN_PASSWORD del .env>"}' > /tmp/la.json
scp -q /tmp/la.json casa:C:/srv/biblioteca-ah/login-admin.json; rm /tmp/la.json
# 2) token y relleno (probado tal cual contra QA, puerto 9920, el 2026-11-12)
T=$(ssh casa "curl.exe -s -X POST http://127.0.0.1:8920/AUTH-SERVICE/biblioteca/v1/auth/login -H 'Content-Type: application/json' --data-binary '@C:\srv\biblioteca-ah\login-admin.json'" | sed -E 's/.*"token":"([^"]+)".*/\1/')
ssh casa "curl.exe -s -X POST http://127.0.0.1:8920/BIBLIOTECA-SERVICE/biblioteca/v1/admin/libros/rellenar-generos -H 'Authorization: Bearer $T'"
# -> {"correct":true,...,"object":{"archivosEncolados":N,"obrasSinGenero":M}}
ssh casa 'Remove-Item C:\srv\biblioteca-ah\login-admin.json'
```

Qué hace: encola un trabajo `RELEER_METADATOS` (prioridad 200, detrás de cualquier conversión) por cada archivo `LISTO`
con alguna obra sin géneros cuyas materias aún no se leyeron. El taller **solo abre el OPF** (o las palabras clave de
PDF/DOCX) del original: no reconvierte, no toca el EPUB normalizado, títulos, autores ni portadas. Después
biblioteca-service rellena los géneros de las obras que **no tienen ninguno** (lo editado a mano no se pisa) y añade
forma/público («Novela», «Juvenil») a las etiquetas. En unos segundos por libro:

```bash
ssh casa "docker logs --since 10m biblioteca-ah-taller-1 2>&1" | grep "Materias releídas"          # una línea por archivo
ssh casa "docker logs --since 10m biblioteca-ah-biblioteca-service-1 2>&1" | grep "generos rellenados"  # cuántas obras por archivo
```

Idempotente: un archivo ya releído (con `materias` en sus metadatos, aunque sea `[]`) no vuelve a encolarse, y
mientras sus trabajos están pendientes tampoco; una segunda llamada responde `archivosEncolados: 0`. Un usuario sin
rol ADMIN recibe HTTP 403. Los libros sin `dc:subject` siguen sin género (clasificarlos queda pendiente).

## Primera instalación (hecha el 2026-11-10)

1. Carpetas `C:\srv\biblioteca-ah`, `E:\LaBibliotecaAH\datos`, `D:\respaldos\biblioteca`.
2. `.env` con secretos generados al azar (distintos a los de desarrollo). Las contraseñas iniciales de
   admin/anderson/samy son `SEED_*_PASSWORD` de ese archivo: verlas con `type C:\srv\biblioteca-ah\.env`.
3. `docker load` + `docker compose up -d --no-build`.
4. Tailscale: `tailscale serve --bg --https=7050 http://127.0.0.1:3100` y `tailscale serve --bg --https=7051 http://127.0.0.1:8920`.
5. Tarea programada `BibliotecaAH-Respaldo` (diaria 03:30) que ejecuta `C:\srv\biblioteca-ah\respaldo.ps1`.
6. (0.4.0) Tarea `BibliotecaAH-Vigia` con `ops/instalar-vigia.ps1` (ver «Vigía»).

## Traductor (contratos v1.3.1)

Servicio `traductor` del compose: imagen propia **`bah/traductor`** construida desde `traductor/` (Opus-MT de
Helsinki-NLP en↔es convertido a CTranslate2 int8, CPU, FastAPI, API de LibreTranslate). Los modelos van **dentro de
la imagen** (se descargan con sha256 verificado y se convierten en la etapa `modelos` del Dockerfile): el contenedor
arranca sin internet y **sin volumen**. **Sin puerto en el host** (solo lo ve biblioteca-service por la red del
compose; QA y producción no chocan). Usuario no root `traductor` (uid 10002). `HEALTHCHECK` real: `/health` solo
responde 200 con los dos modelos cargados y probados con una frase.

| Dato | Medido en casa (2026-11-11, Intel Core 5 210H, sin GPU) | LibreTranslate v1.9.6 (antes) |
|---|---|---|
| Imagen | 244 MB comprimida (`docker save`) / 821 MB en disco, modelos incluidos (158 MB) | 201 MB / 847 MB **+ 394 MB de modelos** en volumen |
| Arranque | ~1 s hasta `/health` 200, sin red | ~28 s el primero (descarga), < 10 s después |
| RAM | ~240 MB en reposo; ~400–520 MB tras traducir; pico 527 MB (`TRADUCTOR_HILOS=4`, `LOTES_PARALELOS=1`); `mem_limit` 768 MB | ~200–260 MB en reposo; ~460 MB con 2 procesos; `mem_limit` 1536 MB |
| Velocidad | ~0,11 s una frase suelta; capítulo de 3 125 palabras (150 frases, lotes de 40) **4,8 s**; 2 lotes de 40 a la vez 2,5 s | ~0,19 s; 12,6 s; 14,4 s |
| Calidad (15 frases de novela) | 1 error grave (*apples tasted of summer and regret*) | 7 errores graves |

Ajustes (`.env`, todos con valor por defecto): `TRADUCTOR_HILOS` (4: hilos de CTranslate2 por lote; con 6 u 8 se
pisa con el resto de la casa y va 3 veces más lento), `TRADUCTOR_LOTES_PARALELOS` (1; con 2 cada par de idiomas
carga dos réplicas: subir `mem_limit` a 1 GB), `TRADUCTOR_BEAM` (4; con 2 el capítulo tarda 3,0 s pero aparecen
errores de concordancia). Límites: 100 textos y 20 000 caracteres por petición (413).

Construir en casa por la sesión de Windows (el `pull` de la base y las descargas no funcionan por SSH). Desde el PC
de desarrollo, en Git Bash:

```bash
cat > /tmp/traductor.ps1 <<'PS'
Set-Location C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH\traductor
docker build --target pruebas -t bah/traductor:pruebas . ; docker run --rm bah/traductor:pruebas  # ruff, mypy, pytest + humo con el modelo
docker build -t bah/traductor:0.1.1 .
PS
bash ops/casa-sesion.sh /tmp/traductor.ps1
```

La primera construcción baja ~800 MB (torch CPU para convertir + los dos modelos) y tarda unos minutos; las
siguientes reutilizan la caché (`RUN --mount=type=cache` para las descargas). Después, en casa, con el `TAG` de la
instancia: `docker compose up -d traductor` (con el `--env-file`/`-p` de la instancia). El volumen de LibreTranslate,
si llegó a crearse, sobra: `docker volume rm <proyecto>_bah-traductor-modelos`.

biblioteca-service **no depende** del traductor ni cambia (mismo `TRADUCTOR_URL=http://traductor:5000`): si está
caído o arrancando, solo `/v1/traducir*` responde 503. Diagnóstico: `docker compose logs --tail 50 traductor` (una
línea por petición con número de textos, caracteres, idiomas y ms; nunca el texto) y `docker compose ps traductor`
(estado del `HEALTHCHECK`). Actualizar dependencias: editar `traductor/requisitos/*.in` y regenerar los
`requirements` con hashes con `traductor/requisitos/compilar.sh` (instrucciones dentro).

## Respaldos

- Tarea `BibliotecaAH-Respaldo` (diaria 03:30) → `C:\srv\biblioteca-ah\respaldo.ps1`. Manual:
  `powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\respaldo.ps1`
- Qué hace: `pg_dump -Fc` de `auth_db` y `biblioteca_db`, comprueba cada dump con `pg_restore --list`, escribe
  `sha256.txt` y lo verifica, y copia la carpeta al **espejo** `C:\respaldos-espejo\biblioteca\` (disco interno; el
  principal está en D:, USB), donde vuelve a verificar el sha256. Rota a los 14 días en los dos sitios por la fecha
  del **nombre** de la carpeta (las que no siguen el patrón, p. ej. `manual-no-borrar`, no se tocan).
- Un respaldo que falla **no** deja una carpeta con pinta de buena: se renombra a `AAAA-MM-DD_HHMM-FALLIDO`. Si solo
  falla el espejo, el principal es válido y el log lo dice.
- La última línea de `respaldo.log` (está en los dos sitios) dice `RESUMEN:` o `FALLA:`; si el respaldo ocupa menos de
  la mitad que el anterior, el `RESUMEN:` lleva un `AVISO:`. El vigía lee esas líneas.
- **Solo las bases de datos** (unos KB): los libros, el audio y las portadas NO se copian, por decisión de Anderson
  (2026-11-11), para no gastar el almacenamiento del servidor. **Riesgo aceptado**: si se pierde E: (disco USB), se
  pierde la biblioteca; y como el espejo está en el mismo PC, un robo, un rayo o un ransomware se llevan también los
  respaldos.
- Restaurar una base: «Volver atrás», camino B (restaurar en base nueva y cambiar los nombres).

## Vigía (desde la 0.4.0)

`C:\srv\biblioteca-ah\vigia.ps1` cada 10 min y al iniciar sesión (tarea `BibliotecaAH-Vigia`, en la sesión de ander
para que se vean las notificaciones). Solo lee; no reinicia nada. Avisa con una notificación de Windows y una línea
`AVISO [clave]` en `C:\srv\biblioteca-ah\vigia.log` si:

- un contenedor de `biblioteca-ah` falta, no corre, está `unhealthy` o lleva más de 10 min arrancando;
- el último respaldo es `FALLA:`, trae `AVISO:` o tiene más de 26 h;
- C:, D: o E: tienen menos del 10 % o de 20 GB libres, o D:/E: no están conectados;
- no existe `E:\LaBibliotecaAH\datos`;
- 7050/7051 no están en `tailscale serve` o aparecen en **Funnel** (internet público).

El mismo aviso no se repite más de una vez por hora (`SIGUE [clave]` en el log); cuando se arregla escribe y avisa
`RESUELTO [clave]`. Cada pasada sin problemas deja `OK: ...`. Instalar (una vez, en casa):

```powershell
$repo = 'C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH'
Copy-Item "$repo\ops\respaldo.ps1", "$repo\ops\vigia.ps1", "$repo\ops\instalar-vigia.ps1" C:\srv\biblioteca-ah\
powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\instalar-vigia.ps1            # solo muestra lo que hara
powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\instalar-vigia.ps1 -Instalar  # la registra y la lanza
Get-Content C:\srv\biblioteca-ah\vigia.log -Tail 5
```

La tarea corre con `conhost --headless` (sin ventana que parpadee cada 10 min); por eso su «último resultado» siempre
es 0: la fuente de verdad es `vigia.log`.

## Diagnóstico rápido

```powershell
$C = @('compose', '-f', 'C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH\docker-compose.yml', '--env-file', 'C:\srv\biblioteca-ah\.env', '-p', 'biblioteca-ah')
docker @C ps                              # todos "healthy"
docker @C logs --tail 100 taller          # conversion y voz
curl.exe -s http://127.0.0.1:8926/salud   # taller
tailscale serve status                    # 7050 y 7051 presentes (y en Funnel nunca)
Get-Content C:\srv\biblioteca-ah\vigia.log -Tail 20   # lo que vio el vigia
```

- Si `E:` se desconecta, la API sigue respondiendo y los binarios devuelven 503 con mensaje claro.
- El gateway tarda ~30 s tras arrancar en ver los servicios en Eureka (404 en ese lapso es normal).
