# QA de regresión (API, seguridad y datos): La Biblioteca AH

> Fecha: 2026-11-11 (18:35–19:32 UTC) · Rol: `regresion-api` · Instancia: QA en casa (`biblioteca-ah-qa`: gateway 127.0.0.1:9920,
> auth 9921, biblioteca 9925, taller 9926) con el contrato **v1.3.1** (contenedores arrancados entre las 18:25 y las 18:30 UTC).
> `.env` de QA: `REGISTRO_PUBLICO=true`, `LOGIN_PROXIES_CONFIABLES=1`, `EXP_TIME=86400000`. Producción y Oh Churus quedaron fuera.
> Cuentas propias: `qa-reg-a@` (alias `qa-reg-a`, id 34), `qa-reg-b@` (id 35) y varias desechables `qa-reg-{d,r,s,k,n,m}*@biblioteca.ah`,
> todas con la clave `<clave-qa>`. `admin@` solo se usó para desactivar y cambiar roles de cuentas propias.
> Scripts y salidas (en casa): `C:\srv\biblioteca-ah-qa\qa\regresion-api\`.
> - `c.mjs`: utilidades comunes.
> - `t1`: cuentas y registro. `t2`: revocación y renovación de sesión.
> - `t3`: frenos de login. Corre **dentro de contenedores** de la red del compose para tener un origen propio y no bloquear a otros QA.
> - `t4`: infraestructura y contrato de errores. `t5`: biblioteca. `t6`/`t6b`: conversión. `t7`: voz.
> - `t8`/`t8b`: taller real (bomba, DA-14, DA-01, DA-28). `t9`/`t10`: traducción. `t11`–`t13`, `salud.mjs`: topes de subida.
> - `cors.mjs`: CORS. `huerfanos.mjs`: restos sin dueño. `bomba.py` + `bombas.ps1`: zip-bomb aislada. `gen_en.py`: EPUB en inglés.
> - `prep.py`: copia el corpus de los QA anteriores **re-marcado**. Cambia el sha256 para que no se reutilicen conversiones hechas con el código viejo.
> - Las salidas están en los `*-out*.txt`, `t8-*.txt` y `conv1*.txt`.
>
> Las FALLAS se reprodujeron al menos dos veces, salvo donde se indica.

## Resumen

Casi todo lo que se dio por arreglado **funciona de verdad**:
- Sesiones: la revocación es inmediata en auth y tarda 30 s en biblioteca. `/auth/renovar` funciona.
- Login: entra por correo o alias, con el mismo mensaje en todos los fallos y con los frenos por cuenta, por origen y global.
- Datos: retirar y restaurar conserva todo, el `null` explícito vacía campos, la idempotencia aguanta peticiones concurrentes, las facetas van por pestaña y los límites de campos responden 120.
- Taller: la zip-bomb se rechaza al instante y el taller no muere. Los trabajos se recuperan tras reiniciar el taller y no quedan restos al retirar.
- Conversión y voz: se corrigieron los fallos de TXT, EPUB, PDF y DOCX y el bucle de errores de voz.

Hay **dos regresiones graves en el gateway**, las dos en `backend/gateway-service/src/main/resources/application.yml` (cambio sin commit):
- **RG-01 (bloqueante):** **CORS roto**. El preflight `OPTIONS` desde `http://localhost:4100` responde **403** sin
  `Access-Control-Allow-Origin`. La web (otro origen: `EXPO_PUBLIC_API_URL`) no puede ni iniciar sesión. Causa: el
  bloque `loadbalancer:` se insertó en la línea 40 y deja `globalcors` (línea 44) colgando de `spring.cloud.loadbalancer`
  en vez de `spring.cloud.gateway`. En producción, con la web en :3100 y la API en :7051, pasaría lo mismo.
- **RG-02 (alta):** **las subidas grandes tumban el buffer del gateway**. Un archivo de 301 MB da **HTTP 500** con
  `OutOfMemoryError: Cannot reserve … direct buffer memory` en lugar del 413 del contrato (antes: 120 limpio). La memoria
  directa **no se libera**: después, subidas de 20–39 MB también dan 500 y una de 10 MB se colgó más de 300 s, mientras
  que 5,7 MB todavía pasa. Causa probable: el nuevo `default-filters: Retry` con `methods: …POST…` (líneas 28–39). El filtro
  Retry de Spring Cloud Gateway guarda el cuerpo para poder reintentarlo, así que la subida ya no va en streaming.
  **La instancia de QA queda degradada para subidas medianas o grandes hasta que se reinicie el gateway** (no lo
  reinicié: lo prohíben las reglas).

Además quedan cuatro hallazgos de la ronda anterior sin arreglar o arreglados a medias (SE-07 por RG-02, SE-16, BI-15 y BI-24) y dos
fallos nuevos en la traducción (NU-01 y NU-02).

### Conteo

| Informe | PASA | FALLA | N/A |
|---|---|---|---|
| Seguridad (SE-01…19) | 17 | 2 (SE-07, SE-16) | 0 |
| Conversión y datos (DA-01…28) | 25 | 0 | 3 (DA-22, DA-23, DA-26: pendientes documentados) |
| Biblioteca (BI-01…28) | 15 | 2 (BI-15, BI-24) | 11 (causa solo en la web) |
| Regresiones nuevas | — | 2 (RG-01, RG-02) | — |
| Funciones nuevas (v1.2/v1.3) con fallo | — | 2 (NU-01, NU-02) | — |

## 1. Tabla de verificación

### Seguridad

| ID | Resultado | Evidencia |
|---|---|---|
| SE-01 | PASA | **Aislado** (`--network none -m 2g`, código nuevo): una bomba de 300 MB (1,4 MB comprimida) y otra de 60 MB dan `ErrorDefinitivo` "comprimido de una forma anómala" en 0,0 s, con 68 MB de RSS, tanto llamando a `convertir` directo como con `ejecutar_aislado`. Un EPUB **al límite legal** (3 × 15,7 MB de texto, 47 MB, 6,9 MB comprimido) se convierte en 57 s con 380 MB en el subproceso (1260 capítulos tras partirlos). **Instancia real**: las dos bombas quedan en ERROR en 1–2 s con `intentos=1`; el pesado legal queda LISTO en 84 s; el taller sigue `running restarts=0 oom=false` y `/salud` ok (`t8-bomba.txt`, `t8-legal.txt`, `bombas-out.txt`). |
| SE-02 | PASA | Al desactivar la cuenta, `menu/mine` y `renovar` dan 401 "Tu sesión ya no es válida…" **al momento**. En biblioteca la escritura se acepta durante la ventana de caché y da 401 a los **30,1 s**; lectura, escritura y `?t=` de binarios también. Reactivar no revive el token viejo (`ver` 0 → 2). Con cambio de roles: auth al momento, biblioteca a los 30,5 s, y el token con ADMIN deja de valer al quitárselo. Con cambio de clave: llega `object.token` nuevo (`ver=1`), el viejo da 401 en auth al momento y en biblioteca a los 30 s, y la clave vieja da 101. La baja propia también revoca (`t2-out-1.txt`). |
| SE-03 | PASA (código + prueba unitaria) | En QA el registro está abierto por `.env`. Lo verifiqué en el código: `AuthenticationController.java:93-95` responde 403 `registroCerrado` y el valor por defecto es `biblioteca.registro-publico=${REGISTRO_PUBLICO:false}` (`application.properties:45`). Ejecuté `ElRegistroPublicoEstaCerradoTest`: 5 pruebas, 0 fallos, incluida `registroCerrado`. **El integrador debe comprobar que el `.env` de producción no trae `REGISTRO_PUBLICO=true`.** |
| SE-04 | PASA | Registrar `QA-REG-A@BIBLIOTECA.AH` o `"  Qa-Reg-A@Biblioteca.Ah "` da 102. Un alias que ya existe, en mayúsculas, da 112. El login funciona en mayúsculas, con espacios y por alias (`" QA-Reg-A "`). |
| SE-05 | PASA (con notas) | La web (`:4100`) envía CSP `default-src 'self'; script-src 'self' 'unsafe-eval'; … frame-ancestors 'none'` y `X-Frame-Options: DENY`. Quedan como estaban el token en `localStorage` y el `sandbox="allow-same-origin allow-scripts"` (`paginator.js:244`), y `'unsafe-eval'` está permitido. |
| SE-06 | PASA | Las voces `edge.qa-reg-falsa-1`, `piper.x`, `zzz.x`, `edge.`+70 letras, `edge.es-ES-NoExisteNeural` y `edge.inventada` dan 120 "no está en el catálogo". 0 trabajos encolados. |
| SE-07 | **FALLA** (parcial) | Funcionan los topes de campos (las 21 combinaciones dan 120 con el campo y el máximo), 21 archivos dan **413** sin crear nada y nombre de estante 101 da 120. Pero un archivo de más de 300 MB da **HTTP 500** en el gateway en vez de 413 (ver RG-02). No probé 507 (exige llenar `E:`): existe `sinEspacio` en `LibroServiceImpl` y `ArreglosDeLaOlaDeQaTest`. |
| SE-08 | PASA | Desde el contenedor A: 5 fallos alternando correo y alias de la misma cuenta y el 6.º con la clave buena da 429, por alias y por correo. **Otra cuenta desde el mismo origen entra** y **la misma cuenta desde otro origen (host) entra**. Desde el origen B: al llegar a 20 fallos, cualquier login da 429. Una `X-Forwarded-For` inventada, `X-Real-IP` o `Forwarded` no lo saltan. **Global**: con 40 fallos de 2 orígenes más los anteriores (>60/min), un login correcto desde el host da 429 durante unos 35 s y luego se recupera (18:41:04–18:41:39 UTC). Inexistente por alias, inexistente por correo y clave mala dan el mismo 101 con el mismo texto, unos 65 ms en todos los casos. |
| SE-09 | PASA | `"       1a"`, `aaaaaaa1` y `abcdefgh1` dan 400 (longitud). `aaaaaaaaa1`, `Password12` y clave con espacio al borde dan 400 `claveDebil`. `<clave>90` da 400 (falta una letra). |
| SE-10 | PASA | Correo de una cuenta desactivada, exacto o en mayúsculas, da 102 (antes 500). El alias de una cuenta desactivada da 112. |
| SE-11 | PASA | Sin token: HTTP 401 con `ResultDTO` "Necesitas iniciar sesión.". Con USER en `/admin/**`: HTTP 403 con `ResultDTO`. |
| SE-12 | PASA | `fraseInicio` de 21 o de 5000, `fraseId` de 5000, `dispositivo` de 101 y `color` de 31 dan **120** con el campo (antes 103 con stacktrace). |
| SE-13 | PASA | `actualizadoEn` 9999-12-31 se guarda con la hora del servidor y el progreso no queda congelado: 1,5 s después se guardan 55 % y 56 %. `NaN`, `Infinity`, 150, -1, velocidad 6 o 0,1 y posición -3 dan 120. `NaN` sin comillas da 120 "no es un JSON válido". |
| SE-14 | PASA | B sube los mismos bytes que A: `Content-Disposition` de B es `otro_nombre_B_1.txt` (su título) y el de A, `Titulo_privado_de_A_1.txt`. Se mantiene a propósito el canal de deduplicación: llega LISTO al instante (contrato §9). |
| SE-15 | PASA | `swagger-ui`, `v3/api-docs`, `actuator`, `actuator/env` y `/error` de los dos servicios dan 404 JSON por el gateway. `actuator/health` da 200. `actuator` del gateway solo lista `health`. |
| SE-16 | **FALLA** (a y c) | b) `/error` da 404 JSON y d) `application/xml` o JSON roto dan 120, los dos bien. Pero a) `%2f` en la ruta sigue dando **400 HTML de Tomcat** (4 rutas, en auth y en biblioteca) y c) un `Range` inválido sigue dando **416 con el archivo entero en el cuerpo** (`bytes=10-5`, `abc`, `-0`, `999999-`, `50-1`: `len` = tamaño del archivo). |
| SE-17 | PASA | 0 apariciones de "generated security password" en el log de biblioteca-service. |
| SE-18 | PASA | Un token firmado con el secreto real **sin `exp`** da 401 en auth y en biblioteca. Sin `userId`, 401 en biblioteca. El control (con `exp`) da 200. Nota: sin el claim `ver` se acepta (vale como `ver=0`); no se puede explotar sin el secreto. |
| SE-19 | PASA | Una sola `x-request-id` en auth y en biblioteca. También llegan `nosniff`, `DENY`, `no-referrer` y `no-store`. |

### Conversión, voz e integridad de datos

| ID | Resultado | Evidencia |
|---|---|---|
| DA-01 | PASA | La conversión de P11 (500 p.) estaba EN_CURSO y la voz del cap. 3 (Gonzalo) GENERANDO cuando hice `docker restart biblioteca-ah-qa-taller-1` **a las 14:14:27 hora de casa (19:14:27 UTC), el único reinicio**. Los dos trabajos se reabrieron (`intentos` 2). La conversión quedó LISTO a los 31 s y la voz LISTO (1911 s de audio) a los 140 s (`t8-da01*.txt`). |
| DA-02 | PASA | Con una fila `ERROR` simulada en BD (V02 cap. 2, Jorge), 4 consultas devuelven `ERROR` con `error` y **no encolan** (0 → 0 trabajos). `reintentar:true` pasa a PENDIENTE, 1 trabajo, y termina LISTO en 5 s. |
| DA-03 | PASA | T11 (`\f`), T14 (`\v`) y T15 (ESC) quedan LISTO, sin caracteres de control ni U+FFFD. En T15 quedan las letras `[1m` de la secuencia ANSI (cosmético). |
| DA-04 | PASA | E07 (NCX con basura) queda LISTO, con el capítulo "Uno". |
| DA-05 | PASA | E05 y E05b dan ERROR "El EPUB está protegido con DRM…" con `intentos=1`. |
| DA-06 | PASA | T08 da 3 capítulos (CAPÍTULO 1–3) y T20 da 2. Solo esos títulos tienen `esTitulo`. |
| DA-07 | PASA | P10: 0 frases con "QA DATOS NOVELA", 0 cabeceras de capítulo pegadas al texto y "EPÍLOGO DEL MAR" no se repite. |
| DA-08 | PASA | P01: "Nota al pie" no aparece en ninguna `voz` y ya no hay palabras partidas ("escri- …"). |
| DA-09 | PASA | D01 y D04: la nota sigue en `texto` dentro de **su** capítulo (c001, c002, c003), con `voz` vacía y sin el glifo ↩. |
| DA-10 | PASA | E10 (XML y HTML) y E01: "Esta es la nota al pie que no se debe leer." tiene `voz` vacía. |
| DA-11 | PASA | E01 cap. 2 ("* * *") queda LISTO con `duracionSeg` 1 y un m4a de 1 KB. |
| DA-12 | PASA | Igual que SE-06: el rechazo se hace en la API y no llega al taller. |
| DA-13 | PASA | 2 carreras A/B con el mismo archivo: los dos reciben `correct` y el **mismo** `archivoId`. `huerfanos.mjs` no encuentra carpetas nuevas sin fila. |
| DA-14 | PASA | P05 y P12 (500 p.) se retiraron 8 s después de pasar a EN_CURSO. A los 90 s no hay `normalizados/`, ni `originales/`, ni fila, ni trabajos (2 de 2). |
| DA-15 | PASA | T05 (UTF-16 BOM) y T06 (UTF-16LE sin BOM) se aceptan y quedan LISTO, con tildes correctas. |
| DA-16 | PASA | P14 da `["Miguel de Cervantes Saavedra"]` y P01 da `["Gabriel García Márquez"]`. |
| DA-17 | PASA | E12 da 2 capítulos ("El único capítulo", "Segundo"). E02 ya no tiene "Sección 2"; su capítulo enorme se parte en "(parte k de n)". |
| DA-18 | PASA | T09 da 123 partes y T07 da 43, con un máximo de unas 460 frases o 6000 palabras por parte. Esto también desactiva PL-01. |
| DA-19 | PASA | Con el largo V01 cap. 2 (Elvira, 422 frases) en curso, el corto V02 cap. 1 quedó LISTO en **6 s** (dos hilos de voz). |
| DA-20 | PASA | Los ERROR muestran mensajes humanos sin trazas: DRM, `container.xml`, Word dañado, PDF escaneado, con clave o dañado, bomba. |
| DA-21 | PASA | E08 da "El EPUB está dañado: su archivo META-INF/container.xml no se puede leer." con `intentos=1`. |
| DA-22 | N/A | Pendiente documentado (`taller/README.md:123`). |
| DA-23 | N/A | Pendiente documentado (`taller/README.md:124`). |
| DA-24 | PASA | `voz`: "Malcolm X habló", "La Generación X creció" (antes "décimo"). "Felipe II" sigue siendo "segundo", "Carlos V" "quinto", "rayos X" queda igual y "siglo XIX" da "diecinueve". |
| DA-25 | PASA | "50 m²" se lee "50 metros cuadrados". "AT&T" da "AT y T" (antes "ATyT"; aceptable). |
| DA-26 | N/A | Pendiente documentado (`taller/README.md:125`). |
| DA-27 | PASA | E01: el primer capítulo se llama "Capítulo 1. El comienzo". |
| DA-28 | PASA | Retiré el libro pesado con 2 capítulos de voz GENERANDO (Carlos cap. 7 y siguiente). 5 s después y durante 5 min no hay `audio/`, ni `normalizados/`, ni filas de audio, ni trabajos (`t8-da28.txt`). 0 filas `bah_lib_audio` sin archivo en toda la BD. |

### Biblioteca (solo lo que tenía causa en el backend; lo demás es N/A por estar solo en la web)

| ID | Resultado | Evidencia |
|---|---|---|
| BI-01 | PASA | Partí de 2 notas, 2 comentarios, progreso 42 %, 4,5★, Novela, favorito, LEYENDO y una colección, y retiré el libro. Después `get`, `anotaciones`, `progreso`, comentar y favorito dan 102. No aparece en TODO, FAVORITOS, la colección (nLibros 0) ni las facetas. El binario da 404. Al **volver a subir** reaparece el **mismo id** con todo. Un deseo borrado desaparece de verdad. |
| BI-02 | N/A (web) | El backend ya permite `pestana: TODO` = solo libros (ver BI-12). |
| BI-03 | N/A (web) | — |
| BI-04 | N/A (web) | — |
| BI-05 | PASA | Igual que SE-13: un 30 % guardado con +1 h no bloquea el 55 % guardado después con la hora correcta. |
| BI-06 | N/A (web) | — |
| BI-07 | PASA | `calificacion:null` deja la calificación en null. |
| BI-08 | PASA | `anio`, `editorial`, `sinopsis` y `etiquetas` con null se vacían. `titulo`, `estado` y `favorito` con null no se tocan. |
| BI-09 | PASA | 5 favoritos a la vez (×3), 4 `agregar` y 3 `quitar` simultáneos: todos con código 0. |
| BI-10 | PASA (backend) | 3 comentarios iguales a la vez dan un solo id y 1 en el servidor. Con anotaciones pasa lo mismo. |
| BI-11 | N/A (web) | El servidor sigue devolviendo orden ascendente y estable. |
| BI-12 | PASA | TODO, POR_LEER, LEYENDO y LEIDOS devuelven solo `LIBRO`. DOCUMENTOS devuelve solo el documento. |
| BI-13 | PASA | Faceta GGM en TODO 3 = filtro 3; en LEIDOS 1 = 1. El autor de un deseo no aparece en TODO y sí en DESEOS (`t11-out.txt`). |
| BI-14 | N/A (web) | — |
| BI-15 | **FALLA** (parcial) | `nota` e `isbn` ya vienen en el DTO, pero un DESEO se puede cambiar a `tipo: LIBRO` o `DOCUMENTO` **sin archivo**: queda correcto en Por leer o Documentos y luego `audio/estado` dice "Este libro no tiene archivo" (2 de 2, `t5-out-1.txt`, `t11-out.txt`). |
| BI-16 | PASA | Volver a subir da "Ya tenías en tu biblioteca: …", `yaLoTenias: true` y el mismo id. Como DOCUMENTO devuelve el libro existente con el mismo aviso. |
| BI-17 | PASA | Los 3 `.doc` se titulan "coronel", "olvidado" y "tunel" (antes "Word Document"). |
| BI-18 | PASA | 2101, -3001, 99999, 2147483647 y 1999.5 dan 120. -5, 0 y 2100 se aceptan (rango del contrato). |
| BI-19 | N/A (web) | — |
| BI-20 | N/A (web) | — |
| BI-21 | PASA | Un archivo vacío da "el archivo está vacío", también mezclado con un archivo bueno. |
| BI-22 | N/A (web) | — |
| BI-23 | PASA | "Novela" y "novela" salen como una sola faceta con n=2, y el filtro "NOVELA" da 2. |
| BI-24 | **FALLA** | Con orden AUTOR, "Ana Zubiria" sale antes que "Zoe Abad" (se ordena por el nombre de pila), 2 de 2. No aparece como arreglado ni como pendiente en el contrato. |
| BI-25 | PASA | Igual que SE-07 en los campos: 51 etiquetas, 20 000 etiquetas, un género de 20 000 caracteres, sinopsis de 10 001, 21 autores y nota de deseo de 5 MB dan 120. |
| BI-26 | N/A (web) | — |
| BI-27 | PASA | Al pasar de LEIDO a POR_LEER, `fechaFin` queda en null. |
| BI-28 | N/A (web) | — |

## 2. FALLAS (detalle)

### RG-01 · Bloqueante · CORS roto en el gateway: la web no puede llamar a la API
- **Pasos**: `OPTIONS $GW/BIBLIOTECA-SERVICE/biblioteca/v1/libros/all` con `Origin: http://localhost:4100`,
  `Access-Control-Request-Method: POST` y `Access-Control-Request-Headers: authorization,content-type`. Repetido sobre
  `AUTH-SERVICE/…/auth/login` (`cors.mjs`, `cors-out.txt`).
- **Esperado**: 200 con `Access-Control-Allow-Origin: http://localhost:4100` (así lo comprobó el QA de seguridad en la ronda anterior).
- **Obtenido**: **403** sin cabeceras CORS para el origen legítimo y para `https://evil.example` por igual. El `POST` sin
  preflight responde, pero sin `Access-Control-Allow-Origin`. El navegador bloquea todo: la web usa `EXPO_PUBLIC_API_URL`
  (`frontend/src/services/api.ts:10`), que es otro origen.
- **Causa**: `backend/gateway-service/src/main/resources/application.yml:40`. El nuevo `loadbalancer:` (4 espacios) cierra
  `gateway:` y deja `globalcors:` (línea 44, 6 espacios) dentro de `spring.cloud.loadbalancer`. El gateway ya no tiene CORS
  configurado y rechaza todo preflight. La variable `CORS_ALLOWED_ORIGINS=http://localhost:4100` sí llega al contenedor.
- **Arreglo**: mover `loadbalancer:` después del bloque `gateway` completo, o indentar `globalcors` bajo `gateway:`. Añadir
  una prueba del gateway que haga un preflight con un origen permitido y otro prohibido.

### RG-02 · Alta · Subidas medianas o grandes dan 500 y agotan la memoria directa del gateway
- **Pasos**: `POST /libros/subir` con un TXT de 301 MB (19:15:08 UTC), luego 310 MB, 299 MB, 39 MB, 20 MB y 30 MB, y 10 MB
  (`t11-out.txt`, `t12-out.txt`, `t13*-out.txt`).
- **Esperado**: más de 300 MB da 413 `archivoDemasiadoGrande` (contrato v1.2); 299 MB y 39 MB se aceptan (el QA de biblioteca
  subió 39 MB sin problemas).
- **Obtenido**: **HTTP 500** con el JSON genérico del gateway (`"error":"Internal Server Error"`) en 301, 310, 299, 39, 30 y
  20 MB. 10 MB se quedó colgado más de 300 s (`HeadersTimeoutError`). 5 MB y 5,7 MB todavía pasan. En el log del gateway
  aparece 25 veces `OutOfMemoryError: Cannot reserve 4194304 bytes of direct buffer memory (allocated: 290228232, limit:
  291962880)`. La memoria **sigue asignada** (377/384 MiB) sin que el contenedor se reinicie, así que el daño es acumulativo.
- **Causa probable**: `application.yml:28-39`, el nuevo `default-filters: Retry` con `methods: GET,HEAD,POST,PUT,DELETE`.
  Para poder reintentar un POST, el filtro Retry de Spring Cloud Gateway guarda el cuerpo de la petición, y con `mem_limit:
  384m` una subida grande ya no cabe. El comentario de las líneas 7–11 ("El gateway NO bufferiza cuerpos") deja de ser cierto.
- **Arreglo**: limitar el Retry a `GET,HEAD`, o excluir las rutas multipart, o confiar en `ConnectException` antes de leer el
  cuerpo. Añadir una prueba de humo que suba 50 MB y más de 300 MB a través del gateway.
- **Estado en que queda QA**: el gateway de QA está degradado para subidas de más de unos 10 MB desde las 19:15 UTC. **Hace falta
  `docker restart biblioteca-ah-qa-gateway-service-1`**: no lo hice porque las reglas de este QA lo prohíben. Avisar a los
  demás QA.

### SE-07 · Media · Archivo de más de 300 MB: 500 en lugar de 413
Es parcial y se debe a RG-02. Los topes de campos y de número de archivos están bien. Ver RG-02 para los pasos y la causa.

### SE-16 · Baja · Respuestas fuera de contrato (a y c sin arreglar)
- a) `POST $AUTH/users%2fall`, `$AUTH/admin%2fusers/all`, `$BIB/estantes%2fall` y `$BIB/libros/get/..%2f..` dan **400
  `text/html` de Tomcat** (`<title>HTTP Status 400 – Bad Request</title>`) en 4 de 4 casos. Causa: Tomcat rechaza `%2F`
  y responde con su `ErrorReportValve` por defecto. Ni auth ni biblioteca tienen configurado un error JSON para eso
  (`biblioteca-service/src/main/resources/application.properties`: ninguna clave `server.error.*` ni personalización
  de Tomcat).
- c) `GET /archivos/{id}/original` con `Range: bytes=10-5`, `abc`, `bytes=-0`, `bytes=999999-` o `bytes=50-1` da **416 con
  el archivo completo en el cuerpo** (`len` = tamaño del archivo, `Content-Range: bytes */N`) en 6 de 6 casos. Causa:
  `controller/ArchivoController.java:84-92` (`servir` devuelve `ResponseEntity.ok().body(FileSystemResource)` y deja el
  Range a Spring).
- Arreglo: el propuesto en el informe de seguridad (cuerpo vacío en el 416; `ErrorReportValve` con `showReport=false` o un
  error JSON).

### BI-15 · Media · Un deseo pasa a LIBRO o DOCUMENTO sin archivo
- Pasos: `POST /libros/deseo {"titulo":"…"}` y después `POST /libros/save {"id":<deseo>,"tipo":"LIBRO"}` (o `"DOCUMENTO"`).
- Esperado: 120 `libroSinArchivo` (el mensaje ya existe).
- Obtenido: `correct:true`, `archivoId:null`. El "libro" aparece en Por leer o Documentos, inflando sus facetas y contadores.
  Ocurrió 3 veces (`t5-out-1.txt`, `t11-out.txt`). Lo demás de BI-15 (`nota` e `isbn` en el DTO) está bien.
- Causa: `service/impl/LibroServiceImpl.java:283-287` (`cambiarTipo` solo impide pasar **a** DESEO con archivo, no salir de DESEO sin archivo).

### BI-24 · Baja · El orden "Autor" usa el nombre de pila
- Pasos: dos libros con autores "Zoe Abad" y "Ana Zubiria" y `libros/all {orden:"AUTOR"}`.
- Esperado: por apellido (Abad, Zubiria). Obtenido: `["Ana Zubiria","Zoe Abad"]` (2 de 2).
- Causa: `repository/EjemplarCustomRepositoryImpl.java:105` (`lower(o.autores[1])`). No está ni en el changelog ni en los pendientes.

### NU-01 · Media · `/v1/traducir` da 503 "traductor no disponible" con texto válido sin puntuación
- Pasos: `POST /traducir {"texto": <2000, 4800 o 5000 caracteres sin . ; : ,>}`.
- Esperado: traducción, o 120 si se decide no admitirlo.
- Obtenido: **503** "El traductor no está disponible ahora mismo…" en 3 de 3 casos, mientras el traductor está sano (la petición
  de control con puntos da 200 justo después). En el log del traductor: `RuntimeError: No position encodings are defined
  for positions >= 512, but got position 1023`, que biblioteca convierte en `traductorNoDisponible`.
- Causa: `traductor/app/segmentador.py:82` (`_partir_larga` devuelve la frase entera si no hay `; : ,`) y
  `traductor/app/motor.py:90-97` (no limita la entrada a 512 tokens). Cortar por espacios cuando no hay signos y pasar
  `max_input_length=512`.
- Por capítulos no ocurre: un párrafo de 700 palabras sin puntos quedó LISTO, porque el taller ya parte las frases.

### NU-02 · Alta · Los libros TXT, PDF y DOCX en inglés no se pueden traducir por capítulos
- Pasos: subir un TXT en inglés, esperar LISTO y la sincronización de metadatos (unos 10 s) y pedir `POST /traducir/capitulo`.
- Esperado: traducción (el contrato v1.3 dice "idioma desconocido → `auto`").
- Obtenido: justo tras el LISTO, `idioma` vale null y el capítulo 0 se traduce bien. En cuanto se sincronizan los metadatos,
  `idioma` pasa a **"es"** y todo capítulo (incluso uno ya traducido y en caché) da **120 "El texto ya está en el idioma
  de destino ("es")"**. Ocurrió 3 veces: en `t9-out.txt` los capítulos 18–33, y en `t10-out.txt` dos TXT. Un EPUB con
  `dc:language en` sí funciona.
- Causa: `taller/app/conversion/convertir.py:121` (`md["idioma"] = md.get("idioma") or "es"`: lo desconocido se marca
  como español) junto con `backend/biblioteca-service/.../service/impl/TraduccionServiceImpl.java:120-121`, que confía en
  ese idioma. Arreglo: no inventar "es" en el taller (dejar null o detectarlo), o usar `auto` cuando la fuente del
  idioma no sea el archivo.

## 3. Regresiones nuevas

| ID | Sev. | Qué | Antes | Ahora |
|---|---|---|---|---|
| RG-01 | Bloqueante | CORS del gateway | Preflight desde `localhost:4100` daba 200 con ACAO (QA seguridad) | 403 para todos los orígenes: la web no puede iniciar sesión ni llamar a la API |
| RG-02 | Alta | Subidas a través del gateway | 310 MB daba 120 limpio y 39 MB entraba | 500 por `OutOfMemoryError` de memoria directa desde 20 MB (y ≥ 299 MB de entrada); la memoria no se libera |

Los recorridos básicos **no** mostraron otras regresiones:
- **Subida y conversión**: 5 formatos y 40 archivos por la API. EPUB, PDF, DOCX, DOC y TXT en Latin-1, UTF-8 y UTF-16 quedan LISTO. Escaneado, con clave y dañado dan su mensaje claro.
- **Voz**: 3 voces (Álvaro, Salomé, Tomás) más Elvira y Jorge quedan LISTO. m4a 1x y 2x con 200 y `Range` con 206. `tiempos.json` cubre todas las frases (8 de 8 y 422 de 422).
- **Lectura y biblioteca**: progreso, anotaciones, comentarios, estantes y favoritos funcionan.
- **Aislamiento B→A**: 13 endpoints dan 102 y los binarios 404, con cabecera y con `?t=`. Los datos de A quedan intactos.
- **Zip-bomb**: el taller no muere.

## 4. Lo nuevo verificado (v1.2, v1.3 y v1.3.1)

- **Login por correo o alias**: funciona en mayúsculas y con espacios en los dos. El campo viejo `email` acepta un alias. Sin usuario da 400 "Escribe tu correo o tu usuario.". Inexistente y clave mala dan el mismo 101 con los mismos tiempos. El freno por cuenta se comparte entre correo y alias. Están el freno por origen (20) y el global (60/min, unos 35 s), y una cabecera de origen inventada no lo salta.
- **Revocación**: en auth es inmediata en los 4 casos (desactivar, roles, clave, baja propia). En biblioteca tarda 30,0–30,5 s (el contrato dice "como mucho 30 s"; el medio segundo extra es la granularidad del sondeo de 1 s). Dentro de esa ventana se aceptan escrituras, como está diseñado.
- **`/auth/renovar`**: devuelve un token nuevo con el mismo `ver` y un `exp` mayor; el viejo sigue valiendo. Sin token o con basura da 401. Con la cuenta inactiva o el token revocado da 401. `/auth/sesion` da `true`. **Observaciones**: el token no lleva `iat`. Si auth está caído, biblioteca acepta solo con la firma (diseño, ver bitácora); no se probó porque no se puede parar auth en QA.
- **Registro cerrado**: verificado con el código y la prueba unitaria (SE-03). En QA está abierto a propósito.
- **Topes**: 413 por número de archivos funciona. El 413 por tamaño queda roto por RG-02. 507 no se probó en vivo.
- **`null` explícito**, **idempotencia concurrente**, **facetas por pestaña** y **retirar y restaurar**: PASA (ver BI-01, 07, 08, 09, 10, 12, 13).
- **Traducción**:
  - Calidad con 10 frases de novela: buena. Conserva "Thomas", "Tobias", "Saltmarsh Point", "Sra." y "Dr.", las comillas “”, la raya de diálogo y el punto y coma. Errores menores: "spiral stairs" → "escaleras espirales", "pulling his coat tighter" → "tirando de su abrigo más fuerte", "the fever would break" → "la fiebre se rompería" (literal) y "sólo" con tilde.
  - Unos 100 ms por frase. La caché responde en 6 ms al mismo usuario y en 15 ms a otro.
  - Validaciones: vacío o de más de 5000 caracteres da 120; `fr` o `de` da `idiomaNoSoportado`; `en`→`en` da `mismoIdioma`; sin token da 401.
  - **Freno de 20 000 caracteres/min**: el 5.º texto de 4900 caracteres da 429. Lo que está en caché sigue respondiendo y otro usuario no queda afectado.
  - **Capítulo largo**: PENDIENTE en 31 ms y LISTO en 2,6 s. Los ids coinciden con `frases/cap-000.json` (61 de 61), la 2.ª lectura tarda 32 ms y el fichero queda en `traducciones/es/`.
  - **Propiedad**: B pide un capítulo de A y recibe 102.
  - Fuera de rango da 120 "elige uno entre 0 y 33"; capitulo 1000 da 120; un libro sin convertir da 120 `libroAunSinConvertir`.
  - **Freno de 30 capítulos/hora**: da 429 en el n.º 31 (el `reintentar` cuenta), y lo ya traducido sigue disponible.
  - Fallan NU-01 y NU-02.
- **El traductor no es accesible desde fuera**: `127.0.0.1:5000` da `ECONNREFUSED` (sin puerto publicado, `docker ps`: `5000/tcp`). `$GW/TRADUCTOR/…` y `$GW/TRADUCTOR-SERVICE/…` dan 404. Solo lo ve la red interna.

## 5. Observaciones menores (no son FALLA)
- Documentación: la bitácora dice "sin latido 30 min = muerto (DA-01)" y el contrato v1.2 dice 10 min.
- El 401 de biblioteca dice "Sesion invalida o vencida" sin tildes; el de auth sí las lleva.
- Cualquiera con 3 orígenes puede activar el freno global de login y dejar a todos fuera unos 60 s. Es diseño aceptado, solo se deja constancia.
- Los restos huérfanos del QA de datos (`originales/63553b33…`, `1db7f0dc…`, `normalizados/4a34c799…`, `ef0f70a1…`, `audio/9743dfba…`, `4bfef6d2…`) seguían a las 19:25 UTC. Tenían unas 5 h y `TareaLimpieza` borra a partir de 6 h, así que conviene comprobarlo después de las 20:30 UTC. Las filas de audio sin archivo ya están limpias (0).

## 6. Estado en que queda la instancia de QA
- **Gateway degradado por RG-02**: necesita reinicio para volver a aceptar subidas de más de unos 10 MB.
- Taller reiniciado **una vez** a las 19:14:27 UTC (DA-01). Sin otros reinicios ni reconstrucciones. No se tocó código ni se hizo commit.
- Se ejecutó `mvn test` solo de `ElRegistroPublicoEstaCerradoTest` (deja `auth-service/target/`).
- En la BD de QA se insertó una fila `bah_lib_audio` en ERROR simulada para DA-02 (V02 de `qa-reg-a`); después se regeneró como LISTO.
- Cuentas propias con libros de prueba (`qa-reg-a`: unos 45; `qa-reg-b`: unos 15) y cuentas desechables desactivadas a propósito. Los libros pesados de 500 p. y el EPUB legal de 47 MB se retiraron.
