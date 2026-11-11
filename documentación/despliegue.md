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

## Respaldos

- Manual: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\respaldo.ps1`
- La última línea de `D:\respaldos\biblioteca\respaldo.log` dice `RESUMEN:` o `FALLA:`.
- Se guardan 14 días. Los originales van en espejo (lo único irrecuperable); normalizados y audio se regeneran.

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
