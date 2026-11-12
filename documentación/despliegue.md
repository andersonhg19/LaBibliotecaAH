# Despliegue de La Biblioteca AH en el PC de casa

El PC de casa **no construye** imágenes (no puede hacer `docker build` ni `pull` por SSH). Las imágenes se construyen
en el PC de desarrollo, se exportan con `docker save`, se copian con `scp` y se cargan con `docker load`.
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

## Versión nueva (desde el PC de desarrollo, Git Bash)

```bash
cd /z/Personales/LaBibliotecaAH
V=0.1.1
# 1. Imagenes. La web lleva la URL de la API dentro: se construye con la de casa.
docker compose build postgres discovery-service gateway-service auth-service biblioteca-service taller
for s in postgres discovery-service gateway-service auth-service biblioteca-service taller; do docker tag bah/$s:latest bah/$s:$V; done
API_URL=https://casa.tail60fcb5.ts.net:7051 TAG=$V docker compose build frontend
# 2. Exportar y copiar (solo hace falta incluir las imagenes que cambiaron)
docker save bah/postgres:$V bah/discovery-service:$V bah/gateway-service:$V bah/auth-service:$V \
  bah/biblioteca-service:$V bah/taller:$V bah/frontend:$V | gzip -1 > bah-$V.tar.gz
scp bah-$V.tar.gz docker-compose.yml casa:C:/srv/biblioteca-ah/
scp ops/respaldo.ps1 casa:C:/srv/biblioteca-ah/
```

En casa (PowerShell):

```powershell
cd C:\srv\biblioteca-ah
docker load -i bah-0.1.1.tar.gz
# Cambiar TAG=0.1.1 en .env y levantar sin construir:
docker compose up -d --no-build
docker compose ps
Remove-Item bah-0.1.1.tar.gz
```

Volver atrás: poner el `TAG` anterior en `.env` y `docker compose up -d --no-build` (las imágenes viejas siguen cargadas).
Flyway solo avanza: si la versión nueva trajo migraciones, restaurar antes el respaldo de la base (abajo).

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
