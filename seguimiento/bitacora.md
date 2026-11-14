# La Biblioteca AH - Registro de Mejoras y Actividades
## Estado: Ola 0 desplegada en casa (rama main, github.com/andersonhg19/LaBibliotecaAH)
## Microservicios propuestos: discovery (8860), gateway (8920), auth (8921, segun D1), biblioteca-service (8925), taller-service Python (8926)
## Ultima actualizacion: 2026-11-14

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

### 2026-11-11 - Todo pasa al PC de casa; ronda de QA especializada
**Pedido de Anderson:** el Lenovo queda solo como consola; construir, probar y desplegar se hace en casa. Claves de admin/anderson/samy = `<clave>` e inicio de sesion con correo **o alias** (`anderson`). QA a fondo con QA especializados (como en Oh Churus) porque "falta muchisimo en diseño" y hay muchos bugs.

| Decision | Eleccion | Motivo |
|---|---|---|
| Docker build/pull en casa | tarea `BibliotecaAH-Sesion` (Interactive) + `ops/en-sesion.ps1` y `ops/casa-sesion.sh` | por SSH falla el gestor de credenciales de Docker Desktop ("A specified logon session does not exist") |
| Instancia de QA | proyecto `biblioteca-ah-qa` en casa, `.env` en `C:\srv\biblioteca-ah-qa`, datos `E:\LaBibliotecaAH-qa`, puertos web 4100 / gateway 9920 | probar sin tocar produccion ni Oh Churus |
| Puertos del compose | `PUERTO_*` en `.env` (por defecto los de siempre) | dos instancias en la misma maquina |
| Maven en casa | 3.9.9 portable en `C:\tools` (sha512 verificado) | no habia; pruebas del backend en casa |
| Claves <clave> | produccion: UPDATE directo con hash bcrypt (no en migraciones: repo publico); QA: `SEED_*=<clave>` | pedido explicito de Anderson |

- Stack local del Lenovo bajado y sus imagenes borradas.
- QA lanzados sobre la instancia de casa: UX/diseño, lector y voz, biblioteca, seguridad, conversion y datos; en paralelo, desarrollo del login por alias.

### 2026-11-11 - Backend: arreglos de la ronda de QA (seguridad, biblioteca, datos) — contrato v1.2
Sin commit. Detalle de cambios de API en `documentación/contratos.md` (Cambios v1.2) y `codigos-de-error.md`.

| Decision | Eleccion | Motivo |
|---|---|---|
| Revocar sesiones (SE-02) | claim `ver` + columna `version_sesion` (V4 auth); auth la comprueba en BD por peticion; biblioteca pregunta a `POST /v1/auth/sesion` con cache 30 s por (usuario, version), revocada 10 min, auth caido = pasa con la firma (5 s) | auth_db es de auth; leerla desde biblioteca ataria esquemas; 30 s de retraso maximo es aceptable para 2 usuarios y no tumba la lectura si auth cae |
| Vida del token | `EXP_TIME` 24 h + `POST /v1/auth/renovar` | token robado acotado aunque la revocacion fallara; la web renueva sin pedir clave |
| Registro publico (SE-03) | `REGISTRO_PUBLICO=false` por defecto | app privada; el admin crea cuentas |
| Correos (SE-04) | normalizar en codigo + migracion Java V5; gemelas NO se fusionan (WARN con ids); indice unico `lower(email)` solo en PostgreSQL y solo sin gemelas | fusionar mezclaria bibliotecas; un indice que falla tumbaria el arranque |
| Freno de login (SE-08) | por cuenta+origen (5/5 min), por origen (20/10 min), global (60/min); origen = X-Forwarded-For contando `LOGIN_PROXIES_CONFIABLES` saltos | backoff solo no evita que otro te bloquee; con el origen fiable, los fallos ajenos no te bloquean |
| Retirar (BI-01) | borrado logico del ejemplar (V2 biblioteca: `retirado_en`, `archivo_sha256`); reaparece al volver a subir el mismo fichero; deseos se borran | conserva todo sin tocar el modelo de anotaciones; el archivo fisico se libera igual |
| null en `/libros/save` (BI-07/08) | setters que anotan los campos presentes | distingue ausente de null sin dependencias nuevas |
| Doble peticion (BI-09/10) | `ON CONFLICT DO NOTHING` en estantes/favoritos; candado `pg_advisory_xact_lock` + ventana 10 s para comentarios y anotaciones; `DataIntegrityViolation` → 101 | sin columnas nuevas ni claves de idempotencia que la web aun no manda |
| Subida simultanea (DA-13) | `saveAndFlush` + reintento unico; si la transaccion se deshace el fichero vuelve a su temporal | ni 103 ni carpetas huerfanas |
| Restos del taller (DA-14/28) | borrar trabajos/audio al retirar el ultimo; `TareaLimpieza` horaria (filas sin archivo y carpetas UUID sin fila con > 6 h) | el taller puede escribir tarde; el contrato le pide comprobar que el archivo existe |
| Audio en ERROR (DA-02) | se informa con `error`; solo `reintentar: true` reencola; sin latido 10 min = muerto en biblioteca (`TrabajoRepository.MINUTOS_SIN_LATIDO`), el taller ya reabre a los 5 (`TALLER_MINUTOS_ATASCADO`) (DA-01; corregido en v1.3.2: aqui decia 30) | evita la cola infinita |
| Progreso (SE-13/BI-05) | fecha > ahora+2 min → hora del servidor (tambien la guardada); NaN/rango → 120 | descongela progresos y no confia en relojes adelantados |
| Topes (SE-07) | env para subida/espacio/estantes; @Size fijos en DTO para textos | los de despliegue cambian por maquina; los de texto son contrato |

Pendiente para frontend: renovar token, reemplazar token tras cambiar la clave, 401 = volver a login, texto del dialogo de retirar, `reintentar` en el reproductor, `yaLoTenias`, facetas por pestaña, `null` para vaciar, Recién llegados con `pestana TODO`, CSP en `serve.json`, clave minima 10.
Taller: ya comprueba que el archivo existe antes de escribir y late cada 60 s (cambios anotados en contratos v1.2).
- Compilacion 2026-11-11: `mvn -B clean verify` en casa OK en los 5 modulos (auth 355 pruebas, biblioteca 128, gateway 8, discovery 1); JaCoCo auth lineas 0.966 / ramas 0.871, biblioteca 0.96 / 0.87. Specs regeneradas y coleccion Postman (59 peticiones).

### 2026-11-11 - Traducción autoalojada inglés → español (contrato v1.3)
**Pedido de Anderson:** "la opción de traducción desde inglés que tiene la app de referencia sería genial". Sin commit.

| Decision | Eleccion | Motivo |
|---|---|---|
| Motor | LibreTranslate `v1.9.6` (imagen oficial, modelos Argos en↔es) | funciona tal cual, mantenido, sin codigo propio; medido en casa: ~0,2 s por frase, capitulo de 1 100 palabras en ~6 s, 3 100 en ~13 s, ~460 MB con 2 procesos |
| Alternativa medida | Opus-MT `opus-mt-en-es` con CTranslate2 int8 en CPU: ~0,09 s por frase, 3 100 palabras en 4,7 s, modelo 78 MB, y claramente mejor en las 15 frases de prueba (LibreTranslate: ~7 errores graves, p. ej. "lighthouse keeper" → "guardaespaldas"; Opus-MT: 1). `tc-big` mas fluido pero 2x mas lento | no se adopta aun: exige imagen y servicio propios (API compatible con LibreTranslate, deteccion de idioma, pruebas y puerta de calidad). Queda como opcion B para Anderson: el cliente ya habla el protocolo de LibreTranslate, el cambio seria solo de imagen |
| GPU | no | la CPU ya traduce un capitulo en segundos; CUDA en la RTX 5050 (sm_120) complica la imagen sin necesidad |
| Capitulos en segundo plano | ejecutor acotado en biblioteca-service (1 hilo, cola 20, 429 si se llena), NO la cola `bah_lib_trabajo` del taller | el traductor es HTTP y el cliente con timeouts ya esta en Java; el taller esta ocupado con la voz y tocarlo exige Python + puerta de calidad; si se reinicia, el estado sale de los ficheros y la siguiente consulta relanza |
| Corto vs largo | <= 1500 caracteres en la misma peticion (LISTO); mas, PENDIENTE con `progreso` | lo corto no obliga a la web a sondear |
| Cache | textos sueltos en `bah_lib_traduccion` (V3, sha256 de origen\|destino\|texto, sin usuario, purga a 180 dias); capitulos en `normalizados/{archivoId}/traducciones/{destino}/cap-NNN.json` con el sha256 de las frases | compartido por archivo; si el taller reconvierte, se rehace solo; se borra con el archivo |
| Freno | 20 000 caracteres/min por usuario en textos sueltos (la cache no cuenta) y 30 capitulos nuevos/hora → 429 | nadie satura el traductor; leer lo ya traducido es libre |
| Traductor caido | 503 `traductorNoDisponible` solo en traduccion; biblioteca-service sin `depends_on` al traductor | la lectura no depende del traductor |
| Puerto | sin publicar (solo red interna) | QA y produccion usan el mismo compose: un puerto fijo en 127.0.0.1 chocaria |

- Prueba real en casa (jar nuevo + postgres:14 + LibreTranslate propios, contenedores borrados al terminar): capitulo de 78 frases / 1 092 palabras (texto original escrito para la prueba) → PENDIENTE en 0,4 s, LISTO en 6,6 s; segunda lectura 27 ms; otro usuario 102; texto suelto 194 ms frio / 15 ms de cache; traductor parado → 503 con mensaje y el resto de la API OK.
- Pendiente para frontend: boton traducir seleccion (`/v1/traducir`) y modo "capitulo traducido" (`/v1/traducir/capitulo`, sondear cada 2-3 s mientras PENDIENTE, mostrar `progreso`, `error` y `reintentar`).
- Pendiente de despliegue: la imagen `libretranslate/libretranslate:v1.9.6` ya esta descargada en casa; primer arranque descarga ~394 MB de modelos al volumen.
- Compilacion 2026-11-11: `mvn -B -pl biblioteca-service clean verify` en casa OK, 161 pruebas (antes 128), JaCoCo lineas 0.966 / ramas 0.887. Spec regenerada; coleccion Postman 63 peticiones.

### 2026-11-11 - Traductor propio: Opus-MT + CTranslate2 en lugar de LibreTranslate (contrato v1.3.1)
**Pedido de Anderson:** adoptar la opcion B medida en la entrada anterior (Opus-MT con CTranslate2), con servicio
propio y la misma API, sin tocar biblioteca-service. Sin commit.

| Decision | Eleccion | Motivo |
|---|---|---|
| Motor | Opus-MT `Helsinki-NLP/opus-mt-en-es` y `opus-mt-es-en` (revisiones `5bc4493` y `c96e2c5`, sha256 de cada archivo fijado) en CTranslate2 int8, CPU | 1 error grave frente a 7 de LibreTranslate en las 15 frases de novela; 2,6x mas rapido en un capitulo; 79 MB por modelo |
| Servicio | `traductor/` (FastAPI) con la API de LibreTranslate que usa `TraductorClient` (`POST /translate` con `q` texto o lista, `source` incl. `auto`, `translatedText`, `detectedLanguage`), mas `/detect`, `/languages`, `/health` | biblioteca-service no cambia (mismo puerto 5000 y `TRADUCTOR_URL`); verificado con su jar real |
| Modelos | convertidos EN LA CONSTRUCCION (etapa `modelos`: torch CPU 2.5.1 + transformers 4.46.3 + ctranslate2 4.6.0, solo ahi); la imagen final lleva ctranslate2 + sentencepiece + fastapi/uvicorn | arranca en ~1 s sin internet y sin volumen; nada de torch en ejecucion |
| ctranslate2 | 4.6.0 en conversion y en ejecucion | el conversor de 4.9.0 pasa `dtype=` y exige transformers >= 4.56 (+ torch >= 2.6 para leer `pytorch_model.bin`); 4.6.0 es la combinacion ya probada en casa y misma version a ambos lados = mismo formato |
| Tokenizacion | SentencePiece directo (`source.spm` + `</s>`, `target.spm` al decodificar) | reproduce exactamente al tokenizador de transformers: 15/15 frases identicas a `opus.json` con beam 4 |
| Dependencias | `requisitos/*.in` → `requirements*.txt` y `requisitos/convertir.txt` con hashes (pip-tools 7.6.2, `--require-hashes`); base `python:3.12.16-slim-bookworm` | versiones exactas y verificables |
| beam | 4 (`TRADUCTOR_BEAM`) | medido: beam 1 = 10 de 15 frases distintas y peores ("el viento se desgarró en las persianas"); beam 2 = 4 distintas, una con error de concordancia ("silencio... pesadas y pacientes... la rompiera") y 3,0 s por capitulo frente a 4,8 s; beam 5 no mejora y es mas lento |
| Hilos | `TRADUCTOR_HILOS=4`, `TRADUCTOR_LOTES_PARALELOS=1` | capitulo: 4x1 = 4,8 s; 2x1 = 7,1 s; 6x1 = 14,7 s; 8x1 = 17,8 s (se pisa con la casa); 4x2 = 8,5 s; 2x2 = 6,6 s y pico al limite de 768 MB |
| Segmentacion | frases sin cortar en abreviaturas (Mr., Dr., St., Sra., e.g., U.S.), iniciales ni citas abiertas; corta antes del inciso del narrador ("—¿Quien anda ahi? —pregunto.") ; frases > 400 caracteres por ; : o , | conserva espacios, sangrias y saltos tal cual |
| Tipografia | comillas “” y «» se enderezan para el modelo y se reponen (Opus-MT BORRA las “”); raya inicial y cursiva que envuelve la frase se apartan; cursivas interiores con segunda pasada marcada con «» (el modelo borra los `*`); coma fuera de las comillas en espanol | medido con casos en casa |
| Nombres propios | heuristica de mayusculas (no al inicio de frase salvo rachas de 2+ palabras, o nombres ya vistos en el lote); si la 1a traduccion no conserva el nombre, 2a pasada con marcador ("Xantor") y se repone; si el marcador no sobrevive, queda la 1a; titulos en mayusculas se excluyen | "Thomas" ya no sale "Tomas", "Tobias"/"Elias" consistentes en todo el capitulo (LibreTranslate mezclaba Elias/Elías); nunca empeora la frase |
| Limites | 100 textos, 20 000 caracteres, 1 MB por peticion → 413; errores `{"error"}` 400/404/405/500/503 sin trazas | como `LT_BATCH_LIMIT`/`LT_CHAR_LIMIT` anteriores |
| Compose | `bah/traductor:${TAG}`, `build: ./traductor`, sin puerto, sin volumen, `mem_limit` 768 MB; se elimina `bah-traductor-modelos` | pico medido 527 MB |

Medidas en casa (contenedores propios `bah-traductor-prueba`, `-exp`, `-pg`, borrados al terminar), mismos scripts del
agente anterior (`C:\srv\biblioteca-ah-qa\qa\traductor-ct2\`):

| | LibreTranslate v1.9.6 | Traductor propio |
|---|---|---|
| Frase suelta (media de 15) | 186 ms | 109 ms |
| Capitulo 3 125 palabras (150 frases, 4 lotes de 40) | 12,6 s | 4,8 s |
| 2 lotes de 40 en paralelo | 14,4 s | 2,5 s |
| Punta a punta con biblioteca-service (capitulo 78 frases / 1 092 palabras) | LISTO en 6,6 s | LISTO en 3,5 s (2,3 s en el servidor) |
| Texto suelto por biblioteca-service, frio / cache | 194 / 15 ms | 133 / 18 ms |
| RAM reposo / tras traducir / pico | 200-260 / ~460 MB | 240 / 400-520 / 527 MB |
| Imagen | 201 MB comprimida + 394 MB de modelos al primer arranque | 244 MB comprimida con modelos |
| Arranque | ~28 s el primero (descarga), < 10 s despues | ~1 s, sin red |
| Errores graves en 15 frases | 7 | 1 |

- Punta a punta con el jar real de biblioteca-service: PENDIENTE en 0,35 s → LISTO 3,5 s; segunda lectura 40 ms; otro
  usuario 102; texto suelto con `origenDetectado: en`; traductor parado → 503 con mensaje y el resto de la API OK.
- Puerta: ruff + ruff format + mypy limpios; pytest 127 pruebas (126 unitarias con traductor falso + 1 de humo con el
  modelo real en la imagen `pruebas`), cobertura 99,5 %. CI: job `traductor` (sin el modelo).
- Pendiente (no hace falta para funcionar): `TraductorDeCapitulos` escribe `"motor": "libretranslate"` en el fichero
  del capitulo traducido (solo informativo); cambiarlo a `opus-mt` cuando se toque biblioteca-service.
- Pendiente de despliegue: construir `bah/traductor` en casa (ver `documentación/despliegue.md`) y `docker compose up -d traductor`.
- Compilacion 2026-11-11: `docker build --target pruebas` + `docker run` en casa OK (127 pruebas, 99,46 %); imagen final `bah/traductor:prueba-ct2` 821 MB.

### 2026-11-11 - Arreglos de la QA de regresion (contrato v1.3.2)
Informe: `documentación/pruebas/qa-regresion-api.md` (NU-01, NU-02, BI-15, BI-24, SE-16) + RG-02 (parte de
biblioteca-service) y UX-14 (textos de auth) pedidos por el integrador. El gateway lo arreglo el integrador (no se toco).

| Decision | Eleccion | Motivo |
|---|---|---|
| NU-01 frases largas | segmentador: `; : ,` → espacio mas cercano al centro → corte a 400 caracteres; motor: `trocear_tokens` a 480 piezas (prefiere `, ; :`, luego inicio de palabra) y `max_input_length=512` de red | nunca 503 por longitud, sin perder texto; la red de tokens cubre textos raros (simbolos, palabras enormes) |
| NU-02 idioma en el taller | heuristica de palabras vacias exclusivas (es/en/pt/fr/it/de) sobre inicio/centro/final, minimo 20 aciertos y 2x sobre el segundo; si no, `null` | `langdetect` no es determinista y esta sin mantener; `lingua` pesa cientos de MB; misma tecnica que el traductor; sin dependencia nueva |
| NU-02 en biblioteca | idioma del libro desconocido o igual al destino → `/detect` del capitulo (2000 caracteres, confianza ≥ 60) y 120 solo si es el destino; si no, `origen=auto` | arregla tambien los libros ya guardados con el "es" inventado, sin migrar datos; un fallo de `/detect` no impide traducir |
| BI-15 «Ya lo tengo» | `deseoId` en `/subir`: el ejemplar que llega (nuevo, ya tenido o retirado) hereda nota/etiquetas/estantes/ISBN y el deseo se borra en una transaccion; `save` no saca un DESEO de su tipo | un mismo camino para los tres casos de la ingesta; nunca un libro sin archivo |
| BI-24 orden por autor | funcion SQL `bah_clave_autor` (V4 biblioteca, IMMUTABLE) en el ORDER BY | sin columna ni relleno ni desincronizacion; vale para obras viejas y nuevas |
| SE-16 a | `ErrorJsonValve` (ErrorReportValve del host) en auth y biblioteca | lo que Tomcat rechaza antes de Spring sale como ResultDTO JSON, sin HTML ni version |
| SE-16 c | `ArchivoController` valida el Range con `HttpRange` antes de servir | 416 sin cuerpo con `Content-Range: bytes */N` |
| RG-02 | `swallowAbortedUploads=true` + `max-swallow-size` = tope por peticion | Tomcat descarta el resto del cuerpo en streaming y responde el 413 sin cortar la conexion |
| UX-14 | tildes en textos de auth; V6 auth actualiza nombres visibles solo si conservan el texto de la semilla | V2 no se puede editar (checksum); codigos y rutas intactos |
| Latido (DA-01) | documentado 10 min en biblioteca y 5 min en el taller (la tabla de la ola v1.2 decia 30) | coincide con `MINUTOS_SIN_LATIDO` y `TALLER_MINUTOS_ATASCADO` |

- Compilacion 2026-11-11 (en casa): `mvn -B clean verify` auth-service OK, 361 pruebas, JaCoCo lineas 0.966 / ramas
  0.871; biblioteca-service OK, 183 pruebas, lineas 0.967 / ramas 0.885 (spec regenerada con `-Dactualizar.spec=true`).
  Taller: ruff + format + mypy + pytest OK, 164 pruebas, 90,9 % (imagen `bah/taller:pruebas` reconstruida).
  Traductor: puerta OK con la de humo del modelo real, 137 pruebas, 99,4 %.
- Coleccion Postman: 66 peticiones (script `postman_v132.py` ejecutado en `bah/taller:qa`).
- Pendiente para la web (contratos v1.3.2): «Ya lo tengo» ya no debe borrar el deseo tras subir con `deseoId`; mostrar
  el 120 `deseoSoloConArchivo` si se intenta cambiar el tipo de un deseo.
- Pendiente de despliegue: reconstruir taller, traductor, auth y biblioteca; RG-02 punta a punta por el gateway de QA.

### 2026-11-11 - Integracion de la ronda de QA (version 0.2.0 candidata)
- Cinco QA especializados (UX/diseño, lector y voz, biblioteca, seguridad, conversion y datos) + dos QA de regresion; informes en `documentación/pruebas/`.
- Arreglos de taller, backend (contrato v1.2 → v1.3.2), web (rediseño de lujo, lector tipo papel, modo «Hojas», Mis notas como cuaderno, colecciones, tema de dia), login por correo o alias, traduccion inglés↔español con servicio propio `traductor/` (Opus-MT + CTranslate2).
- Puertas en casa: backend `mvn clean verify` verde (auth 361, biblioteca 183, gateway 10), web 412 pruebas, taller 164, traductor 137.
- Humo de punta a punta en la instancia QA: alias, voz, traduccion de frase y capitulo, progreso a 5x, null explicito, subida 250 MB OK y 301 MB → 413.

| Incidente en la integracion | Causa | Arreglo |
|---|---|---|
| CORS roto (preflight 403) | bloque `loadbalancer` mal sangrado dejo `globalcors` fuera de `spring.cloud.gateway` | YAML corregido + `LaConfiguracionDelGatewayEsLaEsperadaTest` |
| Subidas grandes → OOM en el gateway | el filtro Retry de Spring Cloud Gateway guarda en memoria el cuerpo de TODA peticion | Retry eliminado; Tomcat de biblioteca descarta el cuerpo sobrante y responde 413 |
| ~90 s de 500 tras redesplegar | Eureka y el balanceador guardaban la IP vieja | latido 5 s, baja a 15 s, desalojo 5 s, cache del balanceador 5 s; queda el arranque (~15 s) |
| Claves en un repo publico | informes y pruebas citaban la clave real | tachadas en documentos; pruebas con «clave-de-prueba» |

Pendientes menores: orden por autor con apellidos compuestos (usar `file-as` del EPUB), DA-22/23/26, desplazamiento tactil del modo Hojas sin verificar en un telefono real, prueba de pantalla bloqueada en iPhone y Android.

## 2026-11-11 — Versión 0.2.0 en producción
- Respaldo previo solo de las bases (0,07 MB). Desde hoy `respaldo.ps1` ya no copia libros (decisión de Anderson: gastaría el disco).
- `.env` de producción: TAG=0.2.0, EXP_TIME=86400000 (24 h con renovación), REGISTRO_PUBLICO=false, LOGIN_PROXIES_CONFIABLES=2.
- Imágenes construidas en casa (commit 911b1fe): rediseño, modo Hojas, anotaciones, traductor Opus-MT, login por alias, lomos legibles en el móvil y baldas por género/autor con filtros.
- Verificado en 7050/7051: 8 contenedores sanos; CORS 200 (7050) / 403 (ajeno); entran anderson, samy y admin; 18 libros de Anderson; facetas; traducción; captura iPhone con títulos completos en los lomos.
- Pendiente: confirmar los lomos en Safari de un iPhone real.

## 2026-11-12 — Géneros desde las materias del archivo (contratos v1.4, sin desplegar en producción)
- taller: `metadatos.materias` (EPUB `dc:subject`, PDF/DOCX `keywords`), OPF Windows-1252 que dice UTF-8 recodificado,
  mojibake reparado; trabajo nuevo `RELEER_METADATOS` (hilo «metadatos») que solo relee materias.
- biblioteca-service: tabla única `util/ClasificadorDeMaterias` (sinónimos → lista canónica; forma y público a
  etiquetas); rellena géneros solo si la obra no tiene; `POST /v1/admin/libros/rellenar-generos` (ADMIN, idempotente);
  403 con ResultDTO en `/v1/admin/**`.
- Verde: `mvn verify` (235 pruebas, JaCoCo ok), taller ruff+mypy+pytest (193, incl. PostgreSQL real, 91 %).
- QA (imágenes `:qa` reconstruidas): 4 EPUB fabricados → Fantasía/Suspense/Romance (OPF Latin-1)/Fantasía con sus
  etiquetas; relleno: 259 archivos releídos, 2 «viejos» simulados rellenados, el vaciado por el usuario no se rellena,
  2.ª llamada 0, samy 403.
- Producción: tras desplegar, lanzar el relleno (`despliegue.md` § Relleno de géneros).

## 2026-11-12 — La voz empieza en segundos + «Ver texto» al escuchar (contratos v1.5, sin desplegar en producción)
- Causa del «tarda muchísimo / no empieza»: el taller sintetizaba el capítulo ENTERO (≈ 200 frases, 60–80 s con 4 a la
  vez) y luego lo ensamblaba (≈ 25 s) antes de marcar LISTO; nada sonaba hasta entonces. Además, con solo 2 hilos, el
  capítulo pedido podía quedar detrás de precargas u otros libros, y su prioridad no subía si ya estaba encolado como
  precarga.
- taller: síntesis por partes (`cap-NNN.parte-KKK.m4a` + `cap-NNN.partes.json`, 3/12/60 frases), ensamblado mientras
  se sintetiza, hilo `voz-urgente` (prioridad ≤ 10), concurrencia 8 para el pedido, las 3 primeras frases sin cola y
  con duplicado a los 2 s, las precargas ceden el paso hasta la primera parte, sondeo de voz cada 0,5 s, limpieza de
  partes viejas.
- biblioteca-service: `urlPartes` en `/audio/estado`, partes servidas por GET, `GET /v1/archivos/{id}/frases/cap-NNN.json`,
  prioridad del capítulo pedido (sube a 10; lo pedido antes del mismo libro baja a 20), precarga cuando el pedido ya suena.
- web: el motor suena por partes en el mismo `<audio>` (cambio de `src` al acabar cada parte; pasa al archivo entero
  cuando está LISTO), sondeo de 0,7 s al principio; «Ver texto» (hoja/panel con la frase resaltada que sigue al audio,
  «Volver a la frase actual», tocar frase = saltar); capítulos plegados en una pastilla «Capítulo N de M ▾» con hoja.
- Medido en QA (capítulos de 201 frases, ≈ 24 min de voz): ANTES 83–95 s hasta la primera palabra. DESPUÉS 2,5–3,7 s
  (6 voces seguidas, con precargas de por medio), 3,1 s en el navegador; en momentos en que el servicio de Microsoft
  responde lento, 5–6 s. Corte entre partes: 150–180 ms. Capítulo entero: 45–60 s (antes 83–95).
- Verde: biblioteca `mvn verify` (270, JaCoCo ok), taller (mis pruebas + PostgreSQL real; fallan solo `test_hojas`/
  `test_documentos` del trabajo de formatos en curso, por dependencias que aún no están en la imagen de pruebas),
  web lint + tipos + jest (559; `BibliotecaDeLujo` se pasó de tiempo una vez con todo en paralelo, sola pasa).
- Pendiente: confirmar en un iPhone real con la pantalla bloqueada el paso de una parte a otra (mismo mecanismo que
  el cambio de capítulo, que ya funciona) y en Android Chrome.

## 2026-11-12 — Documentos: más formatos, visor de hojas de cálculo y carpetas (contratos v1.6, sin desplegar en producción)

| Decisión | Elección | Motivo |
|---|---|---|
| Markdown, HTML, RTF, ODT, PPTX, JSON/YAML/LOG | Al EPUB normalizado del taller (mismo lector) | Voz, notas, subrayado, traducción y progreso gratis; Markdown con pandoc `gfm` y la lista blanca de siempre |
| Código en Markdown | `pre.bah-codigo` tal cual, sin segmentar ni leer en voz | Colapsar espacios rompía la sangría; leer código en voz no sirve |
| Hojas de cálculo | Taller → `hoja.json` + visor propio (DOM virtualizado) | Rendimiento y seguridad: nada de parsear binarios en el iPhone ni SheetJS (versiones con fallos en npm); valores calculados guardados, sin macros |
| Formato de celdas | Texto ya formateado en el taller (es-CO) | El visor solo pinta; fechas, monedas y % iguales en todos los clientes |
| Detección | ZIP por partes, OLE por flujos, RTF por firma | Un .xlsx que es un Word se rechaza; lo de antes ilegible sigue entrando como siempre |
| Borrar carpeta con contenido | Elegir: subirlo a la carpeta de arriba o retirarlo | «A la raíz» para las de primer nivel; para subcarpetas, subir un nivel no desperdiga lo ordenado |
| Navegación del archivador | `/documentos?carpeta=…` con `push` | Atrás del navegador sube un nivel; recargar deja donde estabas |
| iPhone y `accept` | Sin `accept` en iOS, filtro después | Safari deja en gris .md/.yaml/.log de iCloud si no los reconoce |

- biblioteca-service: `Formato` + 12, `DetectorDeFormato` (ZIP/OLE por dentro), `GET /v1/archivos/{id}/hoja.json`,
  originales de texto como `text/plain`; carpetas (Flyway V5 `bah_lib_carpeta` + `ejemplar.carpeta_id`),
  `/v1/carpetas/{all,contenido,save,mover,mover-documentos,delete/{id}}`, `/libros/subir` con `carpetaId`,
  `BIBLIOTECA_MAX_CARPETAS` (500); mensajes nuevos en `Message.Msj`; spec y Postman al día.
- taller: `formatos.py`, `desde_html.py`, `desde_codigo.py`, `desde_pptx.py`, `hojas/*` (xlsx con openpyxl, xls con
  xlrd, ods con lxml, csv; formateador de códigos de Excel); deps openpyxl 3.1.5, xlrd 2.0.1, defusedxml 0.7.1.
- web: archivador con carpetas kraft, migas de latón, iconos por tipo, «⋯» con el resto, selección para mover varios,
  buscar dentro, subir aquí; ruta `Hoja` (`/hoja/:id`) con visor de hojas (pestañas, fila/columna fijas, combinadas,
  búsqueda en todas las hojas, zoom, ancho de columna arrastrando); FichaLibro «Abrir hoja».
- Verde: backend `mvn verify` (JaCoCo ok), taller ruff + mypy + pytest (310, 91,5 %), web lint + tipos + jest (575;
  `BibliotecaDeLujo` se pasa de tiempo con la suite entera en paralelo, sola pasa 23/23).
- QA de punta a punta (imágenes `:qa`): .md con tareas/tablas/cita/código (+ script, iframe y `javascript:` que no
  pasan), .xlsx con 3 hojas visibles + 1 oculta, fechas, COP, EUR, %, negativos entre paréntesis, combinadas e
  inmovilización, .csv Latin-1 con `;`, .ods, .pptx con notas y diapositiva oculta, .json; carpetas y subcarpetas,
  subir a carpeta, mover dos a la vez, buscar dentro, borrar vacía, con «subir» y con «borrar». Capturas en casa:
  `C:\srv\biblioteca-ah-qa\qa\dev-docs\capturas\`.
- Pendiente: XLS real (no se puede generar en el contenedor; probado con dobles), probar en iPhone real la selección
  de .md/.xlsx desde iCloud, y desplegar a producción (aplica V5).

## 2026-11-12 — Versión 0.3.0 en producción

- Commit `f8d9330`. Respaldo previo solo de bases (`D:\respaldos\biblioteca\2026-11-12_0325`, 0,08 MB). `.env` anterior en
  `C:\srv\biblioteca-ah\.env.antes-0.3.0`. Imágenes construidas en la sesión de Windows y `up -d --no-build`.
- Flyway aplicó la V5 (carpetas de documentos). Los 8 contenedores sanos.
- Relleno de géneros: 19 archivos encolados y releídos; facetas tras el relleno: Fantasía 14, Romance 3, Suspense 2,
  Ciencia ficción 1; etiquetas Novela 17, Juvenil 10.
- Verificado: login de anderson, samy y admin; facetas; `/v1/carpetas/all`; web 200 local y por Tailscale (7050); CORS 7051.
- Pendiente en iPhone real: voz por partes con pantalla bloqueada, zonas seguras del lector, elegir .md/.xlsx desde iCloud.

## 2026-11-12 — Arreglos tras probar la 0.3.0 en el iPhone

- **Inicio tapado por la hora/muesca** (app instalada en el iPhone): todas las salas bajan `env(safe-area-inset-top)`
  desde el `contentStyle` de la pila; el lector conserva su propio manejo (barra a sangre).
- **«Ver texto» tapaba los controles de sonido**: el panel lleva abajo una barra compacta (frase anterior, −15 s,
  reproducir/pausar, +15 s, frase siguiente) con la zona segura inferior.
- **Pausas raras en la voz**: cada frase trae de edge-tts ~0,1 s de silencio delante y ~0,9 s detrás; sumado a la pausa
  del taller quedaban 1,2 s entre frases y 1,7 s entre párrafos (medido en producción). `recortar_silencio` quita ese
  silencio al ensamblar (por energía, sin cortar palabras) y deja solo la pausa del taller (0,25 / 0,50 / 0,80 s).
  Con voz real: hueco entre frases 1,22 s → 0,27 s; el mismo fragmento 33,5 s → 26,0 s.

## 2026-11-12 — Versión 0.3.1 en producción

- Commit `36f6b73`. Respaldo de bases `D:\respaldos\biblioteca\2026-11-12_0859`; `.env` anterior en `.env.antes-0.3.1`.
- Los 18 capítulos de voz ya generados se marcaron PENDIENTE (prioridad 200) y se reensamblaron desde la caché de frases
  en ~3 min. Capítulo 5 de prueba: 2015 s → 1650 s; hueco entre frases p50 0,28 s, p90 0,53 s (antes ~1,2 s).

## 2026-11-12 — Capítulo sin frases y tarjeta del PC

- **«El capítulo 3 no tiene texto para leer»** (Percy Jackson, «Sección 4»): un capítulo con la lista de frases vacía
  (portadilla o imagen) era un ERROR definitivo y paraba la escucha. Ahora da 1 s de silencio, como los que solo
  tienen separadores (DA-11), y el reproductor sigue al siguiente. Prueba de regresión nueva.
- **Tarjeta blanca «Sigue donde lo dejaste»** junto al atril en el PC: quitada a pedido de Anderson; en el PC, como en
  el móvil, se toca el libro y se sigue desde ahí.

## 2026-11-12 — Escucha de corrido, capítulos de verdad, «Ver texto» centrado y voz plegada
- Caso de Anderson («La diosa de tres cabezas»): al acabar los créditos (índice 2) pasó a «Sección 4» (índice 3, 0 frases: página de imagen) → ERROR del taller 0.3.1 → la escucha se paraba y «Reintentar» volvía a fallar (mismo taller). El taller de 6d7807c ya da 1 s de silencio.
- `motorAudio.ts`: escuchando de corrido se pasa de largo una página sin palabras (minutos 0) y un capítulo en ERROR (máx. 3 seguidos); «Capítulo siguiente/anterior» también saltan las páginas vacías. Elegido a mano, el ERROR sí se dice.
- `logica/capitulos.ts`: si un capítulo dice ser el primero («1 • …», «Capítulo 1», «Capítulo uno»), lo de antes es preliminar; sin ese ancla, las «Sección N» sin título del principio tampoco cuentan; una página vacía nunca se numera. Ese libro pasa de «Capítulo 4 de 46» a «Inicio · N capítulos».
- `PanelTexto.tsx`: en tablet y PC (≥ 820 px) ventana centrada (hasta 820×980, 90 %), márgenes de libro y letra 20/34.
- `ReproductorScreen.tsx`: «La voz» plegada en acordeón (se ve la elegida; «Cambiar» abre la lista).
- Pruebas: jest 580/581 (la de siempre, BibliotecaDeLujo, pasa sola 23/23); capturas QA en iPhone 390, Android 412, iPad 820 vertical y 1180 horizontal, PC 1440 (C:\srv\biblioteca-ah-qa\qa\dev-iphone3\capturas).

## 2026-11-12 — Desplegada la 0.3.2
- Respaldo de bases 2026-11-12_2106, `.env.antes-0.3.2`, build en sesión y `up -d --no-build`: los 8 contenedores en 0.3.2 y healthy; web 200.

## 2026-11-12 — Escucha continua con el iPhone bloqueado: precarga y «cinta»
- Investigación: WebKit 173332/261554 (iOS suspende la página cuando un <audio> llega al fin; un audio arrancado en segundo plano puede sonar mudo), Audiobookshelf #2655 (abierto, mismo fallo con un archivo por pista), Legato PR #427 (resuelto con un solo ManagedMediaSource continuo; 12 pistas seguidas bloqueado en iOS 18.7). Spotify/YouTube Music: código cerrado, no verificado.
- Paso 1 (todos los navegadores) `motorAudio.ts`: a 45 s (× velocidad) del final se pide el capítulo siguiente; al acabar se cambia de src y se da ▶ dentro del mismo 'ended', sin esperar al servidor. `navigator.audioSession.type = 'playback'` (Safari 16.4+).
- Paso 2 (iPhone/iPad) `utils/cinta.ts`: los .m4a se trocean en el navegador a MP4 fragmentado con mp4box 2.4.1 (sin segunda copia en disco) y se encadenan en un ManagedMediaSource: el <audio> nunca cambia de src ni termina; pasar de capítulo es contabilidad. ~90 s por delante, se suelta lo oído (> 40 s atrás), la lista de edición del AAC recorta el cebado, la duración del MediaSource cubre la cinta. Si la cinta falla, se apaga en la sesión y sigue el <audio> normal. Partes (capítulo generándose) siguen por el <audio> normal. `localStorage['bah.cinta']` = '1' la fuerza (Chrome, MediaSource) y '0' la apaga.
- QA (Chrome con la cinta forzada, «la travesia del faro», Elvira): cruce cap 1→2 a 1x y 2→3 a 3x (archivo 2x) sin 'ended', mismo blob, búfer continuo sin huecos; −15 s exacto; «Ver texto» resalta la frase del capítulo nuevo; pausa/▶; cero errores de consola. Jest 585/586 (la de siempre).
- Falta: probar en el iPhone real (pantalla de inicio y Safari), 30 min bloqueado cruzando ≥ 5 capítulos.

## 2026-11-12 — Desplegada la 0.3.3 (precarga y cinta continua)
- Respaldo de bases 2026-11-12_2216, `.env.antes-0.3.3`, build en sesión, `up -d --no-build`: 8 contenedores 0.3.3 healthy, web 200, el bundle lleva la cinta y el gateway da CORS a :7050 para el audio.
- Pendiente: prueba de Anderson en el iPhone (bloqueado ~30 min cruzando capítulos; PWA y Safari).

## 2026-11-13 — Auditoría completa de la 0.3.3 (7 agentes, solo QA)
- 7 auditores aislados (voz, reproductor/cinta, backend/seguridad, conversión/capítulos, UX, ops, producto) contra QA
  (backend 0.3.3 + web 0.3.3 exportada); producción, Oh Churus y libros reales sin tocar. 0 bloqueantes y 16 altas:
  CI rojo en los 12 últimos runs de main (OP-01), vuelta atrás con migraciones que rompía la base (OP-02), respaldo
  sin copia fuera del disco USB y sin avisos (OP-03/04), Spring Boot 3.2 sin soporte (OP-05); frases truncadas
  cacheadas y capítulos en ERROR por un carácter griego o «ª» (V-01/02), «1.250» y «$30» mal leídos (V-03); cinta que
  arranca en el capítulo siguiente y temporizador que deja la UI atrás (RP-16/01); back matter numerado y leído,
  «Capítulo primero» sin ancla, XHTML con varios capítulos como uno (CF-01/02/03); reproductor móvil con ▶ fuera de
  pantalla (UX5-01); sin sesiones de lectura (P-01); hogar compartido inexistente (P-02).
- Bien verificado: seguridad (IDOR, JWT, CORS, revocación), restauración real de respaldo, 2x exacta, tiempos.json y
  resaltado al 100 %, cruce de cinta sin huecos, sin scroll horizontal, reduced-motion.
- Advertencia cruzada: nada de AnalyserNode sobre el <audio> (iOS lo silencia en segundo plano); la onda usa una
  envolvente precalculada en el taller.
- Plan de la 0.4.0: 109 casos (A–H, Z) en `documentación/pruebas/casos-0.4.0.md` y contratos C1–C8 (v1.7).

## 2026-11-14 — 0.4.0: olas de implementación (rama `integracion/0.4.0`)
- **taller**: capa de lectura al sintetizar (`voz/lectura.py`, vale también para libros ya convertidos): números,
  monedas, horas, ordinales, romanos, abreviaturas, URL breves, emojis fuera, alfabetos no latinos y frases en otro
  idioma con voz multilingüe; frases que edge no lee → silencio (capítulo LISTO); mp3 truncados fuera de la caché.
  Pausas 0,4/0,35/0,7/1,0 s, −18 LUFS / −1,5 dBTP, 1x y 2x en una pasada, `tiempos.json` con `versionAudio: 2` y
  `envolvente`. `estructura.json` v2 (tipo, región, número, enVoz) y trabajo `RECLASIFICAR_ESTRUCTURA` sin cambiar
  índices. La caché no se invalida: solo se piden de nuevo las frases cuyo texto cambia.
- **backend**: freno de login por origen (250 ms → 4 s) en vez de global (BK-01); preferencias de voz por capítulo,
  sesiones de lectura con upsert por `sesionId` y día en America/Bogota, preparar el libro (prioridad 40), estado de la
  casa, reclasificar (ADMIN); Flyway V6 solo aditiva; timeout del gateway 2 min (30 min en subidas).
- **web-voz**: fallos de la cinta clasificados (solo 2 de plataforma la apagan), épocas contra cargas tardías, descarga
  troceada que suena con el primer trozo, ▶ al final de capítulo/libro nunca mudo, latido con keepalive, barra fija
  con zona segura y reproductor apaisado.
- **web-ui**: ficha con índice agrupado, 🎧 por capítulo, «Solo la historia», «Preparar el libro entero», lámpara de
  la casa, «Tus lecturas» (racha y minutos); contraste de día, foco, hojas como diálogo, 320 px y horizontal;
  experiencia viva (palabra que se desliza, portada que vuela, esqueletos, confeti, modo cine, Atkinson/OpenDyslexic),
  todo con reducir movimiento.
- **ops**: CI en verde por primera vez (extra `[dev]` inexistente); respaldo con espejo en `C:\respaldos-espejo`
  (sha256 en los dos sitios, `-FALLIDO`), vigía cada 10 min con notificación de Windows, vuelta atrás expand/contract
  + restauración en base nueva (probadas), compose con `cpus`, `no-new-privileges`, `cap_drop: ALL` y Eureka sin puerto.
  Protección de `main` preparada (se aplica tras integrar).
- **dependencias**: Spring Boot 3.5.16 + Spring Cloud 2025.0.3 (Flyway 11 con `flyway-database-postgresql`), Node
  22.23.5 por digest en CI, imagen y `.nvmrc`, npm audit de ejecución 1 crítica + 19 altas → 0 + 2 altas justificadas
  (zod 3), pip 26.2.2. Expo SDK 57/58 y zod 4, aparte.

## 2026-11-14 — 0.4.0: validación en tres rondas y arreglos
- Validadores independientes por área (api, voz, web) contra QA reconstruido con cada integración.
  - **Ronda 1** (`53b5543`): api 25/28 ✅; voz 32/40 ✅ (3 ❌ B8, B10, C12); web 35/47 ✅ (2 ❌ D1, D10). 24 fallos
    nuevos (V-NUEVO-* por área, A-1, A-2), entre ellos dos altos: cuentos cortos fuera del audiolibro (VOZ-1) y el
    reproductor haciendo ~100 peticiones por segundo, también en 0.3.3 (WEB-1).
  - Arreglos 1: `fix/taller` (clasificador 2, idiomas, pico verdadero, silencios de diálogo), `fix/backend` (cabeceras
    y ResultDTO en 404/400/405, tope de latidos, C12, A-1, resubida que reclasifica), `fix/web` (tormenta de peticiones,
    atasco de la cinta, dos pestañas, modo cine, accesibilidad), `fix/ops` (respaldo con D: desconectado, vigía sin
    errores de PowerShell, Pester 9/9) y `fix/sesion` (401 sueltos: vigencia cacheada por huella del token, `iat`
    tolerante, WARN por cada 401 sin el token).
  - **Ronda 2** (`6eaf3d6`): api 33/33 ✅; voz 37/40 ✅ (R2-1 regresión del ZWSP, Media; R2-2 sonoridad, Baja);
    web 41/48 ✅ (E8 título cortado; V-NUEVO-WEB-10 reintento de red sin espera creciente).
  - Arreglos 2 (`fix/taller-r3`): ZWSP decidido por tramo, teléfonos por grupos, sonoridad del m4a final (la causa era
    el AAC en coma flotante), E8/Z5, espera creciente de la cinta y **diccionario de pronunciación por libro** (B17:
    Flyway V7, GET/PUT `/v1/ejemplares/{id}/pronunciacion`, regeneración que no quita el audio viejo, «Cómo se
    pronuncia» en la ficha; contratos v1.8).
  - **Ronda 3** (`6786c2b`): voz 40/40 ✅; web 54 ✅ + 3 ⚠️ solo unitarias (D6, D7, D9) + 1 📱 (D16); 0 ❌. Nuevo R3-1
    (Baja: el diccionario aceptaba marcas que la voz leía en voz alta), arreglado en `cebbc10` (rechaza `< > { } \`,
    `mvn verify` biblioteca 337/337).
- Puertas finales: jest 750/750, taller 533 (92,43 %), traductor 137 (99,38 %), backend verify con JaCoCo; CI 5/5.
- Estado definitivo de los 109 casos y los 28 IDs nuevos: `documentación/pruebas/casos-0.4.0.md` (104 ✅, 3 ⚠️,
  1 📱, H2 pendiente hasta integrar). `despliegue.md` con el orden de la 0.4.0 (V6 + V7, reclasificar, proteger
  `main`) y la construcción por SSH (`ops/construir-ssh.ps1`) cuando la tarea de sesión no corre.
- Pendiente: D16 en el iPhone físico, AirPlay (RP-13), escucha continua en Ajustes (RP-15), Expo SDK 57/58, zod 4,
  entonación de exclamaciones, hogar compartido e IA (decisión de Anderson).
