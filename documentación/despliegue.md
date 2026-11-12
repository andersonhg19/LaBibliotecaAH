# Despliegue de La Biblioteca AH en el PC de casa

Todo se construye y se ejecuta en el PC de casa. `docker build`/`pull` no funcionan por SSH: se lanzan en la sesión de
Windows con `ops/casa-sesion.sh` (tarea programada `BibliotecaAH-Sesion`).
Oh Churus corre en el mismo equipo y **no se toca**: la biblioteca usa proyecto, red, volumen y puertos propios.

## Dónde queda cada cosa

| Qué | Dónde |
|---|---|
| Compose y `.env` | `C:\srv\biblioteca-ah\` (el `.env` solo existe allí; nunca en git) |
| Libros, EPUB normalizados, audio, portadas | `E:\LaBibliotecaAH\datos` → `/datos` |
| Base de datos | volumen Docker `biblioteca-ah_bah-postgres-data` |
| Respaldos | `D:\respaldos\biblioteca\AAAA-MM-DD_HHMM\` + `originales-espejo\` + `respaldo.log` |
| Web | `https://casa.tail60fcb5.ts.net:7050` → `127.0.0.1:3100` (solo tailnet) |
| API (gateway) | `https://casa.tail60fcb5.ts.net:7051` → `127.0.0.1:8920` (solo tailnet) |

Puertos locales (todos en 127.0.0.1): postgres 5433, discovery 8860, gateway 8920, auth 8921, biblioteca 8925,
taller 8926, web 3100. Oh Churus usa 3000/5432/8760/8820-8823 y Tailscale 7000/7001.

## Versión nueva (todo en casa; así se desplegaron la 0.2.0 el 2026-11-11 y la 0.3.0 el 2026-11-12)

Con `TAG` ya cambiado en `C:\srv\biblioteca-ah\.env`, desde la consola (Git Bash):

```bash
C='docker compose -f C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH\docker-compose.yml --env-file C:\srv\biblioteca-ah\.env -p biblioteca-ah'
# 1. Respaldo de las BASES (nunca de los libros)
ssh casa 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\respaldo.ps1'
# 2. Construir en la sesion de Windows. La web toma API_URL del .env de produccion.
echo "$C build" | bash ops/casa-sesion.sh - 3000
# 3. Levantar sin construir (Flyway aplica las migraciones al arrancar)
ssh casa "$C up -d --no-build"
```

Volver atrás: poner el `TAG` anterior en `.env` (hay copias en `.env.antes-0.2.0` y `.env.antes-0.3.0`) y repetir el paso 3; las imágenes
viejas siguen en casa.
Flyway solo avanza: si la versión nueva trajo migraciones, restaurar antes el respaldo de la base (abajo).

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

- Manual: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\respaldo.ps1`
- La última línea de `D:\respaldos\biblioteca\respaldo.log` dice `RESUMEN:` o `FALLA:`.
- Se guardan 14 días. **Solo las bases de datos** (unos KB): los libros, el audio y las portadas NO se copian, por
  decisión de Anderson (2026-11-11), para no gastar el almacenamiento del servidor.

Restaurar una base (con el servicio dueño detenido):

```powershell
docker compose stop biblioteca-service taller
docker cp D:\respaldos\biblioteca\2026-11-11_0330\biblioteca_db.dump biblioteca-ah-postgres-1:/tmp/r.dump
docker exec biblioteca-ah-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" --clean --if-exists -d biblioteca_db /tmp/r.dump'
docker compose start biblioteca-service taller
```

## Diagnóstico rápido

```powershell
docker compose ps                         # todos "healthy"
docker compose logs --tail 100 taller     # conversion y voz
curl.exe -s http://127.0.0.1:8926/salud   # taller
tailscale serve status                    # 7050 y 7051 presentes
```

- Si `E:` se desconecta, la API sigue respondiendo y los binarios devuelven 503 con mensaje claro.
- El gateway tarda ~30 s tras arrancar en ver los servicios en Eureka (404 en ese lapso es normal).
