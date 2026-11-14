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
| Respaldos | `D:\respaldos\biblioteca\AAAA-MM-DD_HHMM\` + `respaldo.log` (disco USB), espejo en `C:\respaldos-espejo\biblioteca\` (disco interno) y copia del log en `C:\srv\biblioteca-ah\respaldo.log` |
| Vigía | tarea `BibliotecaAH-Vigia` cada 10 min → `C:\srv\biblioteca-ah\vigia.log` + notificación de Windows |
| Web | `https://casa.tail60fcb5.ts.net:7050` → `127.0.0.1:3100` (solo tailnet) |
| API (gateway) | `https://casa.tail60fcb5.ts.net:7051` → `127.0.0.1:8920` (solo tailnet) |

Puertos locales (todos en 127.0.0.1): postgres 5433, gateway 8920, auth 8921, biblioteca 8925, taller 8926, web 3100.
Eureka (discovery, 8860) ya **no** se publica en el host desde la 0.4.0: solo lo usan los servicios por la red del
compose. Oh Churus usa 3000/5432/8760/8820-8823 y Tailscale 7000/7001.

Versiones (0.4.0): backend Java 17 con **Spring Boot 3.5.16 / Spring Cloud 2025.0.3** (trae Flyway 11: por eso
auth-service y biblioteca-service llevan también `flyway-database-postgresql`), web construida con **Node 22.23.5**
(imagen fijada por digest; la misma línea que el CI y `.nvmrc`), postgres 14.15.

Límites de CPU por contenedor (`CPUS_*` del `.env`). Son **techos**, no reservas: un contenedor en reposo no gasta
nada. El PC tiene 12 hilos; cada uno de los 4 servicios Java tiene su propio `CPUS_JAVA`.

| `.env` | `CPUS_JAVA` (×4) | `CPUS_POSTGRES` | `CPUS_TALLER` | `CPUS_TRADUCTOR` | `CPUS_WEB` | techo total |
|---|---|---|---|---|---|---|
| Producción (= valores por defecto del compose) | 1.5 | 2 | 2 | 4 | 0.5 | 14,5 |
| QA (más bajo, para no competir con producción) | 0.75 | 0.5 | 1 | 1 | 0.25 | 5,75 |

Producción: el traductor necesita 4 porque `TRADUCTOR_HILOS=4`, y el taller 2 para la voz (edge-tts + ffmpeg). QA:
son los valores con los que se levantó la 0.3.3 entera (8/8 healthy en ~1 min); más bajo no se ha probado (Spring
Boot arranca mucho más despacio con medio núcleo y se arriesgan los reintentos de los healthchecks). Líneas para `C:\srv\biblioteca-ah-qa\.env` (se aplican al
recrear QA con `up -d`):

```
CPUS_JAVA=0.75
CPUS_POSTGRES=0.5
CPUS_TALLER=1
CPUS_TRADUCTOR=1
CPUS_WEB=0.25
```

En producción no hace falta añadir nada; si se quieren explícitos: `CPUS_JAVA=1.5`, `CPUS_POSTGRES=2`,
`CPUS_TALLER=2`, `CPUS_TRADUCTOR=4`, `CPUS_WEB=0.5`. Todos los contenedores llevan
`no-new-privileges` y `cap_drop: [ALL]` (postgres recupera solo CHOWN, DAC_OVERRIDE, FOWNER, SETGID y SETUID para su
arranque). Probado el 2026-11-14 levantando la 0.3.3 entera así: 8/8 healthy, login, catálogo, taller y traductor.

## Versión nueva (todo en casa; así se desplegaron la 0.2.0 el 2026-11-11, la 0.3.0, la 0.3.1, la 0.3.2 y la 0.3.3 el 2026-11-12; la 0.4.0 lleva además su orden propio, abajo)

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

Cuando `main` esté protegida (último paso del despliegue de la 0.4.0; hasta entonces **no** lo está) solo entrará lo
que tenga los 5 checks del CI en verde y el paso 0a debería dar siempre `success`. Mientras tanto el 0a es la única
barrera: si da otra cosa (o nada, porque el commit no está subido), se para.

Si la tarea de sesión no corre (paso 2), ver «Construir por SSH» más abajo.

### Despliegue de la 0.4.0 (orden)

Cambia mucho por debajo (Spring Boot 3.5 con Flyway 11, Node 22, compose con límites de CPU y sin puerto de Eureka)
y trae dos migraciones de `biblioteca_db`, las dos solo aditivas (`auth_db` no cambia):

- **V6** `voz por capitulo y sesiones`: tablas `bah_lib_capitulo_voz` y `bah_lib_sesion` y un índice.
- **V7** `diccionario de pronunciacion`: tabla `bah_lib_pronunciacion` (diccionario por libro, B17; contratos v1.8).

En orden (todo en casa; los pasos 0a–4 son los de «Versión nueva»):

1. **Copiar los scripts de operación** (el `respaldo.ps1` de `C:\srv\biblioteca-ah` es el viejo, sin espejo):
   `Copy-Item <repo>\ops\respaldo.ps1, <repo>\ops\vigia.ps1, <repo>\ops\instalar-vigia.ps1 C:\srv\biblioteca-ah\`.
2. **Instalar el vigía** (sección «Vigía», desde la sesión de Windows o por `ops/casa-sesion.sh`) y ver
   `OK: biblioteca-ah sano, ...` en `vigia.log`. Desde aquí, un respaldo fallido o un contenedor caído avisan.
3. **CI y respaldo**: pasos 0a, 0b y **1**. La última línea de `C:\srv\biblioteca-ah\respaldo.log` tiene que ser
   `RESUMEN: ... espejo OK ...`; anotar la carpeta `D:\respaldos\biblioteca\AAAA-MM-DD_HHMM`: es la vuelta atrás
   del camino B.
4. **TAG**: `Copy-Item C:\srv\biblioteca-ah\.env C:\srv\biblioteca-ah\.env.antes-0.4.0` y cambiar solo `TAG=0.4.0`
   (los `CPUS_*` tienen valor por defecto; `PUERTO_DISCOVERY` ya no se usa y se puede quitar).
5. **Construir**: paso 2 (sesión de Windows). Si la tarea de sesión no corre, «Construir por SSH» (el traductor
   se construye por la sesión o se reetiqueta, ver allí).
6. **Levantar**: paso 3. Con el compose nuevo se **recrean todos** los contenedores (cambian cpus y capacidades). En
   el log de biblioteca-service deben salir `Migrating schema "public" to version "6 - voz por capitulo y sesiones"`,
   `... to version "7 - diccionario de pronunciacion"` y después `Started`.
7. **Reclasificar la estructura** de los libros ya convertidos, con una cuenta **ADMIN** (sección «Reclasificar la
   estructura»; una vez, se puede repetir).
8. **Humo**: paso 4 (todo healthy, gateway UP, taller ok, web 200) y, desde el iPhone o el PC por Tailscale: entrar,
   abrir un libro reclasificado (índice agrupado y capítulos numerados), Escuchar, y en la ficha abrir «Cómo se
   pronuncia» (lista vacía, sin error). `ssh casa "docker logs --since 15m biblioteca-ah-biblioteca-service-1 2>&1" |
   grep -c ERROR` → 0.
9. **Proteger `main`** (H2), solo cuando `main` ya apunte al commit desplegado y su CI esté en verde (con
   `enforce_admins: true`, a partir de aquí a `main` solo se sube un SHA que ya tenga los 5 checks en verde: subir antes
   la rama, esperar el verde y `git push origin <sha>:main`). Desde Git Bash en el PC de desarrollo:

   ```bash
   MSYS_NO_PATHCONV=1 GH_TOKEN=$(gh auth token --user andersonhg19) gh api -X PUT \
     repos/andersonhg19/LaBibliotecaAH/branches/main/protection --input - <<'JSON'
   {
     "required_status_checks": {
       "strict": false,
       "checks": [
         {"context": "secretos", "app_id": 15368},
         {"context": "backend", "app_id": 15368},
         {"context": "taller", "app_id": 15368},
         {"context": "traductor", "app_id": 15368},
         {"context": "frontend", "app_id": 15368}
       ]
     },
     "enforce_admins": true,
     "required_pull_request_reviews": null,
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   JSON
   # comprobar: los 5 checks y true
   MSYS_NO_PATHCONV=1 GH_TOKEN=$(gh auth token --user andersonhg19) gh api repos/andersonhg19/LaBibliotecaAH/branches/main/protection -q '.required_status_checks.checks[].context, .enforce_admins.enabled'
   ```

   El `GH_TOKEN` de la cuenta del repo es imprescindible: la cuenta activa de `gh` en el PC de desarrollo es otra.
   Para poder saltarla en una urgencia: `enforce_admins: false` (pero entonces no obliga a nadie con permisos de admin).

**Vuelta atrás 0.4.0 → 0.3.3 (camino A, sin tocar la base):** `Copy-Item .env.antes-0.4.0 .env` (o `TAG=0.3.3`) y
repetir el paso 3 de «Versión nueva» (`up -d --no-build`). **Verificado** el 2026-11-14 con la V6: la imagen `bah/biblioteca-service:0.3.3` (Flyway 9)
arranca sobre la base con la V6 real que dejó la 0.4.0 (Flyway 11), en un postgres desechable con el respaldo de QA
0.4.0 → `Successfully validated 6 migrations`, `Current version of schema "public": 6`, `Started`. Con la **V7 no se
ha repetido** esa prueba; es del mismo tipo (solo una tabla nueva, que la 0.3.3 no conoce) y Flyway la trata igual
como migración «futura». Las tablas nuevas se quedan sin usar (preferencias de voz, sesiones y diccionario se
conservan para cuando se vuelva a la 0.4.0). La `estructura.json` v2 que deja la reclasificación la lee también la
0.3.3 (solo usa `capitulos[]`, cuyos campos se conservan). Con el compose viejo Eureka vuelve a publicarse en 8860.
Solo si la 0.4.0 estropeó datos: camino B con el respaldo anotado en el paso 3 de esta lista.

### Construir por SSH (cuando la tarea de sesión no corre)

Por SSH `docker build` falla por las credenciales de Docker Desktop (`credsStore`) y porque BuildKit no arranca. Se
puede construir con el constructor clásico y un `DOCKER_CONFIG` propio sin `credsStore` (así se construyó QA en las
rondas de validación de la 0.4.0). `ops/construir-ssh.ps1` lo hace: crea la primera vez ese `DOCKER_CONFIG` en
`%LOCALAPPDATA%\biblioteca-ah\dockercfg-ssh` (`{"credsStore": ""}` y el contexto de Docker de la sesión), pone
`DOCKER_BUILDKIT=0` y construye `bah/<servicio>:<TAG>` de postgres, discovery, gateway, auth, biblioteca, taller y web
(la web con `EXPO_PUBLIC_API_URL` = `API_URL` del `.env`, como el compose). Lee del `.env` solo `TAG` y `API_URL`.

```bash
scp -q ops/construir-ssh.ps1 casa:C:/srv/biblioteca-ah/construir-ssh.ps1
ssh casa 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\construir-ssh.ps1'   # una linea BUILD por imagen + RESUMEN o FALLA
```

Limitaciones:
- **El traductor no se construye así**: su Dockerfile usa `RUN --mount=type=cache` (solo BuildKit). O se construye
  por la sesión (sección «Traductor») o, si su código no cambió, se reetiqueta la imagen anterior:
  `docker tag bah/traductor:<TAG anterior> bah/traductor:<TAG nuevo>`. En la 0.4.0 el traductor solo cambia la versión
  de `pip` del Dockerfile, así que reetiquetar `0.3.3` como `0.4.0` es aceptable (se queda con el pip anterior).
- Las imágenes base (`maven`, `eclipse-temurin`, `node`, `python`, `postgres`) tienen que estar ya en casa: el `pull`
  tampoco va por SSH. Si falta una, el `BUILD` de esa imagen sale con `rc` distinto de 0.
- Sin BuildKit no hay caché de montaje: la construcción es más lenta que por la sesión.

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

## Reclasificar la estructura tras desplegar la 0.4.0 (una vez; se puede repetir sin riesgo)

Los libros convertidos antes de la 0.4.0 tienen `estructura.json` v1 (sin tipo ni región de capítulo ni `enVoz`):
todos sus capítulos van en voz y sin numerar. Tras levantar la 0.4.0, una cuenta **ADMIN** pide la reclasificación,
igual que el relleno de géneros (crear antes el `login-admin.json` temporal como en el paso 1 de la sección
siguiente):

```bash
T=$(ssh casa "curl.exe -s -X POST http://127.0.0.1:8920/AUTH-SERVICE/biblioteca/v1/auth/login -H 'Content-Type: application/json' --data-binary '@C:\srv\biblioteca-ah\login-admin.json'" | sed -E 's/.*"token":"([^"]+)".*/\1/')
ssh casa "curl.exe -s -X POST http://127.0.0.1:8920/BIBLIOTECA-SERVICE/biblioteca/v1/admin/libros/reclasificar-estructura -H 'Authorization: Bearer $T'"
# -> {"correct":true,...,"object":{"archivosEncolados":N,"yaReclasificados":0,"yaEnCola":0,"sinEstructura":M}}
ssh casa 'Remove-Item C:\srv\biblioteca-ah\login-admin.json'
```

Qué hace: encola un trabajo `RECLASIFICAR_ESTRUCTURA` (prioridad 200, detrás de cualquier conversión o voz) por cada
archivo `LISTO` cuya `estructura.json` no es v2 **o es v2 de un clasificador anterior** al mínimo
(`"clasificador"` en la raíz; mínimo `BIBLIOTECA_CLASIFICADOR_MINIMO`, por defecto 2: así se rehacen también los libros
clasificados con la primera regla de la 0.4.0). El taller lee el original y reescribe `estructura.json` a v2
**conservando** índice, título, href y palabras de cada capítulo: nunca cambia el número de capítulos (progreso,
notas y audio intactos; comprobado en QA sobre 309 libros v1 y otra vez sobre 363 libros con el clasificador 2,
sin un solo cambio en esos datos). Idempotente: con los
trabajos pendientes responde `archivosEncolados: 0` y `yaEnCola: N`; cuando terminan, `yaReclasificados: N`. Sin rol
ADMIN → 403; sin `/datos` (E: desconectado) → 503 `datosNoDisponibles`. Volver a llamar al final permite comprobar
que `archivosEncolados` es 0.

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
- **D: desconectado** (lo más probable: es USB): el dump se hace igual, directamente en el espejo de C:, con su sha256
  verificado, y el log dice `FALLA: principal: destino D:\respaldos\biblioteca no disponible (...); dump hecho solo
  en el espejo ... (el espejo SI es valido)`; sale con 1. Ese día hay respaldo (en C:) y el vigía avisa.
- `respaldo.log` se escribe en D:, en el espejo y **siempre** en `C:\srv\biblioteca-ah\respaldo.log` (`-LogFijo`):
  la `FALLA:` queda escrita aunque falten los dos discos de respaldo. Su última línea dice `RESUMEN:` o `FALLA:`; si
  el respaldo ocupa menos de la mitad que el anterior, el `RESUMEN:` lleva un `AVISO:`. El vigía lee los tres logs.
- Pruebas del script y del vigía (sin Docker ni discos reales: un `docker` falso y una unidad que no existe), desde
  el repo: `powershell -NoProfile -ExecutionPolicy Bypass -Command "Import-Module Pester; Invoke-Pester ops\pruebas"`
  (Pester 3.4, el que trae Windows).
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
- el último respaldo (la línea más reciente de los tres `respaldo.log`: D:, espejo y `C:\srv\biblioteca-ah`) es
  `FALLA:`, trae `AVISO:` o tiene más de 26 h;
- C:, D: o E: tienen menos del 10 % o de 20 GB libres, o D:/E: no están conectados (el log de respaldo de un disco
  desconectado se salta sin errores; si ese disco no está en `-Discos`, avisa `respaldo-<letra>`);
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
