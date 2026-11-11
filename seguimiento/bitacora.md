# La Biblioteca AH - Registro de Mejoras y Actividades
## Estado: Ola 0 desplegada en casa (rama main, github.com/andersonhg19/LaBibliotecaAH)
## Microservicios propuestos: discovery (8860), gateway (8920), auth (8921, segun D1), biblioteca-service (8925), taller-service Python (8926)
## Ultima actualizacion: 2026-11-11

---

## Estado Actual
- Plan maestro redactado: `documentación/plan-maestro.md`.
- Pendiente: aprobacion del plan y respuesta a decisiones D1-D5 (seccion 17 del plan).

---

### 2026-11-10 - Fase 0: Investigacion y plan
**Actividad:**
- Investigacion de la app de referencia "Lector de textos" / Voice Aloud Reader (App Store ES/US/GB/DE, politica de privacidad, ficha ONCE, 595 resenas).
- Investigacion de voces TTS en espanol (edge-tts, Azure, Polly, Google, Piper, Kokoro, Chatterbox, Qwen3-TTS), reproduccion en segundo plano (react-native-track-player v5; expo-audio topa en 2x), conversion de documentos (PyMuPDF, ebooklib, pandoc, LibreOffice, Calibre), lector (foliate-js), metadatos (Open Library, Google Books, Claude) y distribucion iOS.
- Exploracion de Oh Churus para reutilizar: auth/JWT/roles/modulos/auditoria, gateway, discovery, frontend (contextos, atomos, tema), CI, Sonar.
- Inspeccion del servidor casa: Intel Core 5 210H, 32 GB RAM, RTX 5050 Laptop 8 GB; C: NVMe 1 TB; D: (WD Elements USB) y E: (ADATA HD330 USB) externos.

**Hallazgos clave:**
- No existe una voz "Carlos" de Espana en ningun catalogo: Polly Carlos = es-US; Nuance Carlos = es-CO; Azure Carlos = es-HN.
- La referencia no tiene notas, marcadores ni temporizador; su biblioteca es pobre (lo que mas critican).

**Decisiones (Anderson, 2026-11-10):**
- D1: copia propia del modulo administrativo (Oh Churus no se toca).
- D2: nada instalado; web en Docker usada desde Safari/Chrome por Tailscale. Primera tarea de la Ola 0: prueba P1 de pantalla bloqueada en el iPhone.
- D3: voz por defecto Alvaro (es-ES-AlvaroNeural, edge-tts); las otras 8 voces de la Sala de voces quedan disponibles.
- D4: archivos en E:\LaBibliotecaAH, respaldos en D:.
- D5: los libros estan en Google Drive, iCloud y el iPhone; Anderson los sube a mano. La subida web debe aceptar varios archivos y funcionar con el selector de Safari/Chrome (que da acceso a iCloud Drive y Google Drive).
- Anderson aprobo el plan y pidio avanzar todo lo posible, no solo la Ola 0.

### 2026-11-10 - Ola 0: Cimientos (en curso)
**Hecho:**
- `git init` en `Z:\Personales\LaBibliotecaAH` (rama main; safe.directory agregado en el PC Rhiscom), `.gitignore`, `README.md`.
- `documentación/contratos.md`: contrato entre backend, taller y frontend (puertos, /datos, ids de frase, estructura.json, tiempos.json, cola de trabajos en Postgres, API y DTOs).
- Puertos en casa verificados libres: 3100, 5433, 8860, 8920, 8921, 8925, 8926. Tailscale: **7050** (web) y **7051** (API) — 7010/7011 ya estaban ocupados por otro proyecto.
- **Prueba P1 desplegada** en casa: `https://casa.tail60fcb5.ts.net:7052/` (contenedor `bah-p1`, nginx:1.28-alpine, 127.0.0.1:3102, archivos en `C:\srv\biblioteca-p1`). Dos capitulos con Alvaro en m4a AAC 48 kbps + variantes 2x. **Resultado 2026-11-10 (iPhone de Anderson, Safari): OK** — la voz de Alvaro suena y los botones de velocidad funcionan. El plan web (sin app instalada) queda confirmado. Pendiente confirmar en Android.
  Para retirarla: `docker rm -f bah-p1` y `tailscale serve --https=7052 off`.
- En paralelo (agentes): `backend/` (copia adaptada de Oh Churus + biblioteca-service), `taller/` (conversion + voz), `frontend/` (web).
- `documentación/estandares.md` (39 reglas, a pedido de Anderson: nivel HexaQuantum/Oh Churus o mejor), CI `.github/workflows/ci.yml`, hook `.githooks/commit-msg` (commits convencionales), compose endurecido (TZ Bogota, CORS obligatorio, postgres:14.15).

#### Taller (Python) — TERMINADO 2026-11-10
- Capas `app/{api,config,dominio,cola,conversion,voz}`; Dockerfile multi-etapa `python:3.12.16-slim-bookworm`, no root, healthcheck (imagen 1,19 GB por LibreOffice/ffmpeg/pandoc).
- Calidad: ruff + mypy limpios, **73 pruebas, 89% cobertura**; pruebas con postgres:14 real (cola, SKIP LOCKED con 4 hilos) y edge-tts real.
- Humo real: 4 formatos convertidos a LISTO, PDF escaneado → ERROR con mensaje claro, 9 muestras de voz, capitulo con Alvaro 24,42 s (1x) / 12,20 s (2x), tiempos exactos contra ffprobe.

| Decision | Eleccion | Motivo |
|---|---|---|
| Toma de trabajos | filtro `tipo = ANY(:tipos)` | un hilo de conversion y otro de voz, sin robarse trabajos |
| frases.json | + `finParrafo`, `esTitulo` | pausas naturales (250/500/700 ms) |
| Reintentos | vuelve a PENDIENTE con el error; ERROR al 3.º o si no tiene arreglo | no perder trabajos por fallos transitorios |
| PyMuPDF | 1.28.2 (no 2.x) | la 2.x arrastra onnxruntime+numpy (~200 MB) sin uso |

Pendiente del taller: OCR, Piper, RTF/MOBI, imagenes internas de PDF.

#### Backend (Java) — TERMINADO 2026-11-10
- `mvn -B clean verify` verde en los 5 modulos con JaCoCo bloqueante: auth-service 230 pruebas (95,5% lineas / 84,6% ramas); biblioteca-service 91 pruebas con Testcontainers postgres:14 (97,1% / 88,7%); gateway 4; discovery 1.
- Documentacion: `documentación/codigos-de-error.md`, `documentación/api/{auth,biblioteca}-service.json` (vigiladas por `LaSpecPublicadaEstaAlDiaTest`), `collection/La Biblioteca AH.postman_collection.json` (52 peticiones).
- Compose: los servicios Java construyen con `context: ./backend` (Dockerfile multi-etapa con pom padre); se quito `AUTH_SERVICE_URL` (no se usa).

| Decision | Eleccion | Motivo |
|---|---|---|
| Obra | una por ejemplar; autores `text[]` | corregir datos de un libro no altera el del otro usuario |
| Pagina por defecto | 30 (max 200) | lo fija el contrato |
| Registro publico | asigna rol USER | hueco heredado de Oh Churus cerrado |
| Semilla de usuarios | solo si existe `SEED_*_PASSWORD` | sin contrasenas en el repo |
| Cobertura en Z: | archivo jacoco en tmp local, cierre de JVM 300 s | en el recurso SMB la cobertura salia en 0% |
| Progreso | no se audita en `bah_lib_cambio` | llega cada pocos segundos |

Pendiente del backend: Karate; archivo huerfano en `originales/` si falla la transaccion a mitad; sesiones de lectura, `visible_hogar` y bibliotecario IA (olas posteriores).

#### Frontend (Expo web) — TERMINADO 2026-11-10
- tsc limpio, ESLint `--max-warnings=0`, Prettier, Jest 17 suites / 184 pruebas; export web y Docker multi-etapa (node 20.18.1-alpine, no root, healthcheck).
- Estanteria de roble procedural, efecto de libro fisico (sacar, girar, bisagra), catalogo con 7 pestanas y facetas, subida multiple, ficha, lector foliate-js con notas re-ancladas, motor de voz de un solo `<audio>` + Media Session, 0.5–5x, resaltado de frase/palabra.
- Modo demo (`npm run demo`) con libro propio "El guardian de los lomos".

### 2026-11-10 - Integracion local (stack completo en docker compose)
**Fallos encontrados y corregidos:**

| Fallo | Causa | Arreglo |
|---|---|---|
| `database "auth_db" does not exist` | Docker Desktop no ve bind mounts de la unidad de red Z:; en casa tampoco habria repo | imagen propia `bah/postgres` con `init-databases.sql` horneado (`backend/init-db/Dockerfile`) |
| Conversion → `PermissionError` | biblioteca-service (uid 999) creaba originales 0600; el taller es uid 10001 | todas las imagenes Java con uid/gid 10001 + `temporal()` crea 0644 |
| Taller sin tablas al arrancar | arrancaba antes que Flyway de biblioteca-service | `depends_on: biblioteca-service: service_healthy` |
| Web atascada en "preparando" con ERROR_CONVERSION | el tipo `EstadoAudio` no tenia los estados v1.1 | tipos + mensajes + 2 pruebas en `motorAudio.test.ts`; contrato §API actualizado |

**Humo de punta a punta por el gateway (todo OK):** login, token invalido → 401, subida de 2 archivos (EPUB + TXT) → LISTO en 2 s con metadatos del EPUB, EPUB con Range → 206, voces con Alvaro por defecto, audio cap. 0 con Alvaro LISTO en 8 s (1x, 2x y tiempos servidos con 206), progreso guardado y retomado, Samy no ve el libro de Anderson (404). CORS acepta `localhost:3100` y rechaza otros origenes (403).
**Web real contra el backend (Chrome sin cabeza):** entrada → estanteria → ficha (indice con minutos) → lector (EPUB del servidor) → reproductor; todas las llamadas 200 y consola sin errores.
- Verificacion final 2026-11-10: biblioteca-service 91 pruebas + puerta JaCoCo OK tras el cambio de permisos; motorAudio 11 pruebas OK; tsc y ESLint limpios; imagen web reconstruida.

### 2026-11-11 - Ola 8 (adelantada): despliegue en casa
- Repo publico `github.com/andersonhg19/LaBibliotecaAH` (cuenta personal), commit inicial `7aa9e05`; `.gitattributes` fija LF.
- Imagenes `0.1.0` (web construida con `API_URL=https://casa.tail60fcb5.ts.net:7051`) → `docker save | gzip` (1 GB) → scp → `docker load` → `docker compose up -d --no-build` en `C:\srv\biblioteca-ah`.
- `.env` de casa con secretos nuevos (solo en casa). Datos en `E:\LaBibliotecaAH\datos`.
- Tailscale: **7050** web → 3100, **7051** API → 8920 (solo tailnet).
- Humo en casa por la tailnet con la cuenta admin (luego retirados los libros): todo OK, conversion 4 s, voz Alvaro 4 s, CORS solo para el origen 7050.
- Respaldo: `ops/respaldo.ps1` + tarea `BibliotecaAH-Respaldo` diaria 03:30; prueba manual OK (`D:\respaldos\biblioteca\2026-11-11_0004`).
- Oh Churus sin cambios (contenedores siguen arriba).
- Pendiente: probar en el iPhone y en el Android de Samy; retirar la prueba P1 (`bah-p1`, puerto 7052) cuando ya no haga falta.
