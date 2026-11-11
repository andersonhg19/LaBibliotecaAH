# Contratos entre componentes — La Biblioteca AH

> Fuente de verdad técnica compartida por `backend/`, `taller/` y `frontend/`.
> Cualquier cambio aquí se anota en `seguimiento/bitacora.md`. **Versión 1.3.2 — 2026-11-11.**

## Cambios

### v1.3.2 — 2026-11-11 (arreglos de la QA de regresión; la web debe adoptar BI-15)
- **biblioteca** `POST /v1/libros/subir` acepta un campo multipart nuevo **`deseoId`** (UUID, opcional) — flujo
  «Ya lo tengo» (QA BI-15). Con él: **un solo archivo** (si llegan más, 120 `deseoUnSoloArchivo`); el deseo debe ser
  del usuario (si no, 102 `libroNoEncontrado`) y seguir siendo `DESEO` (si no, 120 `noEsUnDeseo`); se valida **antes**
  de copiar nada. Si el archivo se acepta, el ejemplar que llega (nuevo, el que ya tenía —`yaLoTenias: true`— o uno
  retirado que reaparece) **hereda del deseo** la nota (si ya tenía una, se unen con una línea en blanco), las
  etiquetas (sin repetir, sin distinguir mayúsculas), los estantes y el favorito (en la misma posición) y el ISBN si
  su obra no lo tenía; **el deseo se borra** en la misma transacción. La respuesta es la de siempre (`[EjemplarDTO]`
  con ese ejemplar, de **id distinto** al del deseo). La web **ya no debe borrar el deseo** después (si lo intenta,
  recibe 102). Si el archivo se rechaza, el deseo queda intacto.
- **biblioteca** `POST /v1/libros/save`: un `DESEO` **no** puede cambiar de `tipo` (ni a `LIBRO` ni a `DOCUMENTO`):
  120 `deseoSoloConArchivo` «Un deseo pasa a tu biblioteca cuando subes su archivo: usa «Ya lo tengo» y elige el
  archivo.» (QA BI-15; antes quedaba un «libro» sin archivo). `DESEO → DESEO` y `LIBRO ↔ DOCUMENTO` siguen igual.
- **biblioteca** `libros/all {orden: "AUTOR"}` ordena por **apellido** del primer autor (QA BI-24): sin tildes, en
  minúsculas, la última palabra («Gabriel García Márquez» → marquez), formato «Apellido, Nombre» («Tolkien, J. R. R.»
  → tolkien), sin las partículas «de», «del», «de la», «van», «von»… («Miguel de Cervantes» → cervantes) y con los
  artículos que forman parte del apellido («Ursula K. Le Guin» → le guin). Función SQL `bah_clave_autor` (V4).
- **biblioteca** `POST /v1/traducir/capitulo` (QA NU-02): si el idioma del libro es desconocido **o coincide con el
  destino**, ya no se confía en él: se detecta el idioma del propio capítulo (`POST /detect` del traductor, 2000
  caracteres, confianza ≥ 60) y **solo** si es el de destino responde 120 `mismoIdioma` (sin gastar cupo); si no,
  traduce con `origen=auto`. Un idioma del libro distinto del destino (`en…` → `es`) se usa tal cual. Lo ya traducido
  sale del fichero sin detectar nada. Si `/detect` falla, se traduce igual.
- **taller** (QA NU-02): `metadatos.idioma` sale de los metadatos del archivo (EPUB `dc:language`, DOCX
  `core.language`) **solo si existen**; si no, se detecta del texto (palabras vacías de es/en/pt/fr/it/de sobre
  inicio, centro y final del libro) y, si no hay certeza, queda **`null`** (antes se inventaba `"es"` y un libro en
  inglés no se podía traducir). `EjemplarDTO.idioma` puede ser `null` (ya lo era en el contrato).
- **traductor** (QA NU-01): un texto sin puntuación, o una «frase» de más de 512 tokens, ya no da 503: los segmentos
  largos se trocean por `; : ,`, luego por espacios y, en último caso, a 400 caracteres; y el motor nunca pasa al
  modelo más de 480 tokens por segmento (trocea por comas o palabras y une con un espacio). Sin cambios de API.
- **SE-16** (biblioteca y auth): una ruta que Tomcat rechaza (p. ej. `%2f`) responde **HTTP 400 con ResultDTO JSON**
  (`errorCode` 120 en biblioteca, 400 en auth; «La dirección pedida no es válida.»), sin HTML ni versión del
  servidor. Un `Range` inválido o fuera del archivo en los binarios da **416 con cuerpo vacío** y
  `Content-Range: bytes */<tamaño>` (antes llegaba el archivo entero).
- **RG-02** (biblioteca): un archivo por encima de `BIBLIOTECA_MAX_ARCHIVO` en una petición por debajo de
  `BIBLIOTECA_MAX_SUBIDA` responde el `413` del contrato **sin cortar la conexión**: Tomcat descarta el resto del
  cuerpo en streaming (`server.tomcat.max-swallow-size` = tope por petición; sin disco ni memoria) y el gateway ya
  no se queda con el cuerpo a medias. Por encima del tope por petición también llega el 413 (luego se cierra).
- **auth** (QA UX-14): textos con tildes: auditoría del login «Entró con los roles…» y errores de validación
  («petición», «parámetro», «válido», «número», «mayúsculas»…). Migración **V6** (auth): nombres visibles
  «Administración», «Módulos», «Auditoría» y descripciones del rol ADMIN y de `app.locale`; **no cambian** códigos,
  rutas ni claves, y solo se tocan las filas que conservan el texto de la semilla.
- Documentación: el «sin latido» que da por muerto un trabajo es **10 min** en biblioteca-service
  (`TrabajoRepository.MINUTOS_SIN_LATIDO`) y **5 min** en el taller (`TALLER_MINUTOS_ATASCADO`); la bitácora decía 30.

### v1.3.1 — 2026-11-11 (motor del traductor; nada cambia para la web ni para biblioteca-service)
- **`traductor` es ahora un servicio propio** (`traductor/`, imagen `bah/traductor`): Opus-MT de Helsinki-NLP
  (`opus-mt-en-es` y `opus-mt-es-en`, revisión fija) convertido a **CTranslate2 int8** en CPU, con FastAPI. Sustituye a
  LibreTranslate con la **misma API** en lo que usa `TraductorClient` (mismo puerto 5000, mismo `TRADUCTOR_URL`):
  - `POST /translate` `{q: string | string[], source: 'auto'|'en'|'es', target: 'en'|'es', format?: 'text'}` →
    `{translatedText: string | string[], detectedLanguage?}`; `detectedLanguage` solo con `source: 'auto'`
    (`{confidence: 0-100, language}` o una lista, una por texto). Orden y cantidad iguales a `q`; textos vacíos se
    devuelven vacíos; mismo idioma de origen y destino devuelve el texto tal cual.
  - `POST /detect` `{q}` → `[{confidence, language}]`; `GET /languages` → `[{code, name, targets}]`;
    `GET /health` → 200 `{status: 'ok', languages}` solo con los modelos cargados **y probados**; 503 mientras no.
  - Errores `{"error": "..."}` sin trazas: **400** petición mal formada (falta `q`/`source`/`target`, idioma no
    cargado, `format` distinto de `text`, cuerpo que no es JSON), **413** demasiado (más de `TRADUCTOR_MAX_TEXTOS`=100
    textos, de `TRADUCTOR_MAX_CARACTERES`=20 000 caracteres o de 1 MB de cuerpo), 404/405 JSON, 500 sin detalle, 503
    sin modelos. (Ya no se aceptan formularios ni `format: html`: biblioteca-service no los usa.)
- Calidad: segmenta por frases sin cortar en abreviaturas (Mr., Dr., St., Sra.…), iniciales ni citas abiertas;
  conserva espacios, sangrías, saltos de línea, rayas de diálogo, cursivas (`*así*`, `_así_`) y el estilo de
  comillas (“”, «», ‘’); coma fuera de las comillas en español; protege nombres propios («Saltmarsh Point»,
  «Thomas», «Tobias») con una segunda pasada que nunca empeora la frase. `beam_size` 4.
- Modelos **dentro de la imagen** (se convierten al construirla, sha256 verificado): arranca sin internet en ~1 s.
  Desaparece el volumen `bah-traductor-modelos`. Variables nuevas: `TRADUCTOR_LOTES_PARALELOS`, `TRADUCTOR_BEAM`;
  `TRADUCTOR_HILOS` pasa a ser hilos de CTranslate2 (por defecto 4).

### v1.3 — 2026-11-11 (traducción autoalojada inglés → español; la web debe adoptarla)
- **Componente nuevo `traductor`** (§1): LibreTranslate `v1.9.6` autoalojado con solo los modelos en↔es, sin
  interfaz web, sin claves y **sin puerto publicado** (solo lo ve biblioteca-service por la red interna). Los libros
  no salen de casa. Modelos en el volumen `bah-traductor-modelos`.
- **biblioteca** `POST /v1/traducir` `{texto, origen?, destino?}` → `{traduccion, origenDetectado}` (§9). `texto` de
  1 a 5000 caracteres; `origen` `auto` (por defecto) o `en`/`es`; `destino` `es` (por defecto) o `en`. Caché
  compartida en `bah_lib_traduccion` (V3) por sha256 de `origen|destino|texto`, sin usuario; se purga a los 180 días
  sin uso.
- **biblioteca** `POST /v1/traducir/capitulo` `{ejemplarId, capitulo, destino?, reintentar?}` →
  `{estado: LISTO|PENDIENTE|ERROR, frases: [{id, texto}], error, progreso}` (§9). Traduce el texto **visual** de
  `frases/cap-NNN.json` respetando los ids de frase (§3) y lo guarda en `normalizados/{archivoId}/traducciones/{destino}/cap-NNN.json`
  (§2), compartido por archivo. Capítulos de hasta 1500 caracteres vuelven `LISTO` en la misma llamada; los más
  largos vuelven `PENDIENTE` (la web vuelve a preguntar cada 2–3 s; `progreso` 0–99) y luego `LISTO`. Un `ERROR` trae
  `error` y se informa durante 60 s sin relanzarse; `reintentar: true` lo relanza ya. Si el taller reconvierte el
  libro y las frases cambian, la traducción vieja se descarta sola (sha256 de las frases en el fichero).
  El origen sale del idioma del libro (`en…` → `en`; desconocido → `auto`; un libro `es` hacia `es` → 120 `mismoIdioma`; v1.3.2: desconocido o igual al destino → se detecta el capítulo y el 120 solo sale si el texto ya está en el destino).
- **Errores nuevos** (`codigos-de-error.md`): **503** `traductorNoDisponible` (el traductor no responde; el resto de la
  API sigue igual), **429** `demasiadoTextoTraducido` (más de `TRADUCTOR_CARACTERES_POR_MINUTO`, 20 000, por usuario;
  lo que sale de la caché no cuenta), `demasiadosCapitulosTraducidos` (más de `TRADUCTOR_CAPITULOS_POR_HORA`, 30,
  capítulos **nuevos** por usuario) y `traductorOcupado` (cola de capítulos llena: 1 en curso + 20 esperando);
  **120** `idiomaNoSoportado`, `mismoIdioma`, `libroAunSinConvertir`; **102** `capituloSinTexto`, `libroNoEncontrado`
  (ejemplar ajeno). Sin cambios en la cola `bah_lib_trabajo` ni en el taller.
- Variables nuevas: `TRADUCTOR_URL`, `TRADUCTOR_IDIOMAS`, `TRADUCTOR_HILOS`, `TRADUCTOR_CARACTERES_POR_MINUTO`,
  `TRADUCTOR_CAPITULOS_POR_HORA` (`.env.ejemplo`).

### v1.2 — 2026-11-11 (arreglos de QA de seguridad, biblioteca y datos; la web debe adoptarlos)
- **JWT** (§1): nuevo claim `ver` (versión de sesión de la cuenta). `exp` y `userId` son obligatorios.
  Caducidad por defecto **24 h** (`EXP_TIME`). Desactivar/reactivar una cuenta, cambiarle los roles o cambiar
  su clave sube la versión y **revoca al momento** los tokens anteriores en auth-service y, como mucho
  `SESION_CACHE_SEGUNDOS` (30 s) después, en biblioteca-service: responden **HTTP 401** con
  `{"correct":false,"errorCode":401,"message":"Tu sesión ya no es válida…"}` (QA SE-02).
- **auth** nuevos: `POST /v1/auth/renovar` (token nuevo, misma respuesta que `/login`; la web lo llama al abrir y
  cada pocas horas) y `POST /v1/auth/sesion` (`object: true` si el token sigue vigente; uso interno).
- **auth** `POST /v1/users/save`: si cambia la propia clave, la respuesta trae `object.token` (el nuevo): la web
  debe reemplazar el suyo (el viejo ya no vale).
- **auth** `POST /v1/auth/register`: cerrado por defecto (`REGISTRO_PUBLICO=false`) → `errorCode 403`
  "El registro está cerrado…". Con `true`, como antes (QA SE-03).
- **auth** correos guardados y buscados recortados y en minúsculas; un correo ya usado (aunque la cuenta esté
  desactivada o cambien las mayúsculas) da 102 (QA SE-04, SE-10). Claves: **mínimo 10** caracteres, sin espacios
  al borde, no triviales (`claveDebil`, 400) (QA SE-09).
- **auth** sin token: HTTP 401 con ResultDTO; sin rol: HTTP 403 con ResultDTO (antes 403 vacío) (QA SE-11).
- **auth** login: frenos por cuenta+dispositivo (5/5 min), por dispositivo (20/10 min) y global (60/min) → 429 (QA SE-08).
- **biblioteca** `POST /v1/libros/delete/{id}` ahora **retira**: libros y documentos desaparecen de todas las
  vistas pero conservan progreso, notas, resaltados, diario, calificación, estantes y datos editados; si el mismo
  usuario vuelve a subir el mismo fichero, reaparece el mismo ejemplar con todo. Los deseos se borran (QA BI-01).
- **biblioteca** `POST /v1/libros/save`: campo **ausente = no se toca**; campo enviado como **`null` = se vacía**
  (`calificacion`, `anio`, `editorial`, `sinopsis`; `autores`, `generos`, `etiquetas` quedan vacías). `titulo`,
  `estado`, `tipo` y `favorito` con null no se tocan (QA BI-07, BI-08). `anio` entre -3000 y 2100 y entero (BI-18).
  Pasar de LEIDO a POR_LEER/LEYENDO limpia `fechaFin` (BI-27).
- **biblioteca** pestañas `TODO`, `POR_LEER`, `LEYENDO` y `LEIDOS` = **solo `tipo LIBRO`** (sin documentos ni
  deseos) (QA BI-12). `POST /v1/libros/facetas` acepta cuerpo opcional `{pestana}` y cuenta solo lo de esa
  pestaña (por defecto `TODO`); géneros y etiquetas sin distinguir mayúsculas en facetas y filtros (BI-13, BI-23).
- **biblioteca** `EjemplarDTO`: nuevos `nota` (la del deseo) y `yaLoTenias` (solo en la respuesta de `/subir`:
  `true` si ese archivo ya estaba en tu biblioteca; el mensaje dice "Ya tenías en tu biblioteca: …") (BI-15, BI-16).
- **biblioteca** `POST /v1/libros/subir`: topes configurables → `errorCode 413` (más de 20 archivos por petición,
  archivo > 300 MB o petición > 1 GB) y `507` (sin espacio libre en `/datos`); un archivo vacío da
  "el archivo está vacío" (QA SE-07, BI-21). Subidas simultáneas del mismo fichero ya no fallan (DA-13).
- **biblioteca** `POST /v1/audio/estado`: `vozId` debe estar en `/v1/voces/all` (120 `vozNoDisponible`) (SE-06).
  Nuevo campo de entrada `reintentar?: boolean` y de salida `error` (motivo, solo con `estado = ERROR`): un
  capítulo en ERROR **se informa y no se reencola** salvo `reintentar: true` (QA DA-02). Un `GENERANDO`/`EN_CURSO`
  sin latido en 10 min se considera muerto y se vuelve a encolar (DA-01).
- **biblioteca** `POST /v1/progreso/save`: un `actualizadoEn` más de 2 min en el futuro se sustituye por la hora del
  servidor (también al comparar con lo guardado); `porcentaje` 0–100, `velocidad` 0.25–5 (la app llega a 5x) y `posicionAudioSeg` ≥ 0
  finitos o 120 (antes el porcentaje se acotaba en silencio) (QA SE-13, BI-05).
- **biblioteca** idempotencia: agregar/quitar de un estante y marcar favorito dos veces no fallan; el mismo
  comentario o la misma anotación enviados dos veces en 10 s devuelven el ya creado; una carrera en una restricción
  única da `101 conflictoConcurrente`, nunca 103 (QA BI-09, BI-10).
- **biblioteca** límites de texto (§9, "Límites") y de colecciones por usuario (100) → 120 (QA SE-07, SE-12, BI-25).
- **biblioteca** el original se descarga como `{titulo del ejemplar}.{ext}` (QA SE-14). Cuerpo no JSON → 120 (SE-16).
- **taller** (§7, ya implementado por el taller):
  (a) latido cada 60 s en `actualizado` de todo trabajo `EN_CURSO` (todos los tipos); al arrancar, el taller reabre
  **todos** los `EN_CURSO` (hay un solo taller por base de datos) y cada minuto barre los que lleven
  `TALLER_MINUTOS_ATASCADO` (5) min sin latir; al reabrir deja `bah_lib_archivo.estado_conversion` /
  `bah_lib_audio.estado` en `PENDIENTE`. biblioteca-service, como red de seguridad, trata un `EN_CURSO` o
  `GENERANDO` sin latido en 10 min como muerto y vuelve a encolar el capítulo al pedirlo (QA DA-01).
  (b) el UPSERT de `bah_lib_audio` solo inserta si el archivo sigue existiendo, y un trabajo cuyo archivo ya no
  existe se cancela y limpia sus ficheros (DA-14, DA-28).
  (c) un capítulo sin texto hablable queda `LISTO` con 1 s de silencio (DA-11).
  (d) dos hilos de voz (`TALLER_HILOS_VOZ=2`); un capítulo de más de 6000 palabras se parte en
  "(parte k de n)": `estructura.json` puede traer más capítulos que el índice del libro (DA-18, DA-19).
  (e) variables nuevas del taller: `TALLER_HILOS_VOZ` (2) y `TALLER_MINUTOS_ATASCADO` (5). Sin estados ni campos nuevos.
- **biblioteca** subida: TXT en UTF-16 (con o sin marca BOM) se acepta como TXT; el taller lo convierte (QA DA-15).
- **taller** (§7): al retirar el último ejemplar de un archivo, biblioteca-service borra sus trabajos (PENDIENTE y
  EN_CURSO), su fila de `bah_lib_archivo` y sus filas de `bah_lib_audio`. **El taller, antes de escribir resultados
  (normalizados, audio, UPSERT), debe comprobar que el archivo sigue existiendo** y, si no, descartar. Lo que quede
  igualmente (filas de audio o carpetas `{archivoId}` sin archivo, con más de 6 h) lo borra una tarea horaria de
  biblioteca-service (QA DA-14, DA-28).
- **gateway**: `/*/*/v3/api-docs`, `swagger-ui`, `actuator` (salvo `health`) y `/error` responden 404 (SE-15);
  añade `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en
  JSON; `X-Request-Id` ya no sale duplicado (SE-05, SE-19). La **CSP** de la web es del frontend.

### v1.1 — 2026-11-10
- Ver la bitácora: estados CONVIRTIENDO / ERROR_CONVERSION en `/audio/estado`, hilos de cola por tipo, pausas por
  `finParrafo`/`esTitulo`.

## 1. Componentes, nombres y puertos

| Componente | Carpeta | Puerto interno | Contenedor | Notas |
|---|---|---|---|---|
| discovery-service | `backend/discovery-service` | 8860 | `bah-discovery` | Eureka |
| gateway-service | `backend/gateway-service` | 8920 | `bah-gateway` | Spring Cloud Gateway, rutas por discovery (`/AUTH-SERVICE/...`, `/BIBLIOTECA-SERVICE/...`) |
| auth-service | `backend/auth-service` | 8921 | `bah-auth` | Copia adaptada de Oh Churus. context-path `/biblioteca` |
| biblioteca-service | `backend/biblioteca-service` | 8925 | `bah-biblioteca` | Dominio. context-path `/biblioteca` |
| taller | `taller/` | 8926 | `bah-taller` | Python 3.12 + FastAPI. Sin registro en Eureka; solo `/salud` y `/voces` internos |
| postgres | — | 5432 (host 127.0.0.1:5433) | `bah-postgres` | BDs `auth_db`, `biblioteca_db` |
| frontend | `frontend/` | 3100 | `bah-frontend` | Expo SDK 55, **solo web** (`expo export --platform web`) |
| traductor (v1.3.1) | `traductor/` | 5000 | `traductor` | Python 3.12 + FastAPI + CTranslate2 (Opus-MT en↔es int8). API de LibreTranslate. Solo red interna (sin puerto en el host). `POST /translate` con `q` como lista. Lo usa solo biblioteca-service |

Producción (casa): Tailscale `https://casa.tail60fcb5.ts.net:7050` → 127.0.0.1:3100 (web) y `:7051` → 127.0.0.1:8920 (gateway).

- Paquete Java raíz: `com.bibliotecaah.<servicio>` (ej. `com.bibliotecaah.auth`, `com.bibliotecaah.biblioteca`).
- Maven: `groupId com.bibliotecaah`, padre `backend/pom.xml` (`la-biblioteca-ah`), Spring Boot 3.2.5, Spring Cloud 2023.0.3, Java 17.
- Prefijos de tabla: `bah_auth_` (auth), `bah_lib_` (biblioteca).
- JWT: igual que Oh Churus (HMAC256, `com.auth0:java-jwt`, claims `sub`=email, `userId`, `name`, `roles`) y, desde v1.2, `ver` (versión de sesión) y `exp` obligatorio. `SECRET` **obligatorio** (sin valor por defecto en el código).

## 2. Volumen de archivos

Raíz montada en `/datos` en **biblioteca-service y taller** (en casa: `E:\LaBibliotecaAH`; en desarrollo: `./datos-dev`).

```
/datos/
  originales/{archivoId}/{nombreOriginalSaneado}        ← lo escribe biblioteca-service al subir
  normalizados/{archivoId}/libro.epub                    ← taller (EPUB3 con ids por frase)
  normalizados/{archivoId}/estructura.json               ← taller
  normalizados/{archivoId}/portada.jpg                   ← taller (si hay; máx. 1200 px de alto)
  normalizados/{archivoId}/frases/cap-{NNN}.json         ← taller (texto por frase para la voz)
  normalizados/{archivoId}/traducciones/{destino}/cap-{NNN}.json ← biblioteca-service (v1.3, ver §9 "Traducción")
  audio/{archivoId}/{vozId}/cap-{NNN}.m4a                ← taller (1x)
  audio/{archivoId}/{vozId}/cap-{NNN}-2x.m4a             ← taller (variante 2x)
  audio/{archivoId}/{vozId}/cap-{NNN}.tiempos.json       ← taller (tiempos de la variante 1x)
  buzon/{email-usuario}/...                               ← lo deja el humano; biblioteca-service lo importa
  cache-voz/{hash}.mp3                                    ← taller (frase sintetizada, reutilizable)
```
`archivoId` = UUID. `NNN` = índice de capítulo con 3 dígitos desde 000. `vozId` = id del motor+voz, ej. `edge.es-ES-AlvaroNeural`.

## 3. Ids de frase

- Formato `c{NNN}-s{NNNNN}` (capítulo 3 dígitos, frase 5 dígitos, ambos desde 0). Ej.: `c003-s00123`.
- En `libro.epub` cada frase está envuelta en `<span class="bah-f" id="c003-s00123">…</span>` dentro de su párrafo original.
- Las palabras **no** se envuelven (el resaltado de palabra se hace con offsets de caracteres dentro de la frase).

## 4. `estructura.json`
```json
{
  "versionFormato": 1,
  "versionTexto": 1,
  "titulo": "…", "autores": ["…"], "idioma": "es", "isbn": null, "editorial": null, "anio": null, "sinopsis": null,
  "tienePortada": true,
  "capitulos": [
    {"indice": 0, "titulo": "Capítulo 1", "href": "cap-000.xhtml", "nivel": 1,
     "frases": 214, "palabras": 3120, "primeraFrase": "c000-s00000", "ultimaFrase": "c000-s00213"}
  ],
  "toc": [{"titulo": "Parte I", "href": "cap-000.xhtml", "hijos": [ … ]}],
  "totalFrases": 5230, "totalPalabras": 81200, "minutosEstimados": 540
}
```
`minutosEstimados` = palabras / 150 a 1x.

## 5. `frases/cap-NNN.json`
```json
{"capitulo": 3, "frases": [{"id": "c003-s00000", "texto": "Texto tal como se ve.", "voz": "Texto preparado para leer en voz.",
  "finParrafo": false, "esTitulo": true}]}
```
`finParrafo` y `esTitulo` (añadidos en v1.1) controlan las pausas: 250 ms entre frases, 500 ms al final de párrafo, 700 ms tras un título.
Los tiempos de `tiempos.json` son absolutos dentro del capítulo, con 3 decimales.

## 6. `cap-NNN.tiempos.json` (de la variante 1x; para la 2x se dividen los tiempos entre 2)
```json
{"capitulo": 3, "vozId": "edge.es-ES-AlvaroNeural", "duracion": 1234.56,
 "frases": [{"id": "c003-s00000", "t0": 0.00, "t1": 3.42,
             "palabras": [[0, 5, 0.05, 0.41], [6, 11, 0.43, 0.80]]}]}
```
`palabras` = `[inicioChar, finChar, t0, t1]` relativos al **texto visual** de la frase. Puede venir vacío si el motor no da tiempos por palabra.

## 7. Cola de trabajos (tabla en `biblioteca_db`, la crea Flyway de biblioteca-service)

```sql
CREATE TABLE bah_lib_trabajo (
  id            UUID PRIMARY KEY,
  tipo          VARCHAR(30)  NOT NULL,   -- CONVERTIR | VOZ_CAPITULO
  archivo_id    UUID         NOT NULL,
  payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  estado        VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE | EN_CURSO | HECHO | ERROR
  prioridad     INT          NOT NULL DEFAULT 100,         -- menor = antes
  intentos      INT          NOT NULL DEFAULT 0,
  error         TEXT,
  creado        TIMESTAMP    NOT NULL DEFAULT now(),
  actualizado   TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX ix_bah_lib_trabajo_cola ON bah_lib_trabajo (estado, prioridad, creado);
```
- payload CONVERTIR: `{}`. payload VOZ_CAPITULO: `{"vozId": "edge.es-ES-AlvaroNeural", "capitulo": 3}`.
- El **taller** toma trabajos con
  `UPDATE bah_lib_trabajo SET estado='EN_CURSO', intentos=intentos+1, actualizado=now() WHERE id = (SELECT id FROM bah_lib_trabajo WHERE estado='PENDIENTE' ORDER BY prioridad, creado FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
  (v1.1) La subconsulta filtra además `AND tipo = ANY(:tipos)`: hay un hilo de conversión y otro de voz, y ninguno toma trabajos del otro.
  Máx. 3 intentos; entre intentos el archivo/audio vuelve a `PENDIENTE` con el último mensaje en `error_conversion`/`error`;
  al fallar el 3.º queda `ERROR`. Errores sin arreglo posible (PDF escaneado, archivo dañado) van directo a `ERROR`.
  VOZ_CAPITULO solo se encola cuando el archivo está `LISTO` (si no, el taller lo marca ERROR). (v1.2) Latido cada 60 s; al arrancar el taller reabre todos los `EN_CURSO` y cada minuto los que lleven `TALLER_MINUTOS_ATASCADO` (5) min sin latir, dejando archivo/audio en `PENDIENTE`.
- **biblioteca-service** encola: CONVERTIR al subir un archivo nuevo; VOZ_CAPITULO cuando la web pide audio de un capítulo que no existe (y encola también los 2 siguientes con prioridad +10).

### Tablas que el taller ACTUALIZA (las crea biblioteca-service)
```sql
-- bah_lib_archivo (columnas que toca el taller)
estado_conversion VARCHAR(20)  -- PENDIENTE | PROCESANDO | LISTO | ERROR
error_conversion  TEXT
version_texto     INT
n_capitulos INT, n_palabras INT, minutos_estimados INT
metadatos         JSONB        -- {titulo, autores[], idioma, isbn, editorial, anio, sinopsis}
tiene_portada     BOOLEAN
actualizado       TIMESTAMP

CREATE TABLE bah_lib_audio (
  archivo_id UUID NOT NULL, voz_id VARCHAR(80) NOT NULL, capitulo INT NOT NULL,
  estado VARCHAR(20) NOT NULL,  -- PENDIENTE | GENERANDO | LISTO | ERROR
  duracion_seg NUMERIC(10,2), error TEXT, actualizado TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (archivo_id, voz_id, capitulo)
);
```
El taller hace UPSERT en `bah_lib_audio` (GENERANDO → LISTO/ERROR).
biblioteca-service, al ver un archivo `LISTO`, copia `metadatos` a la obra si la obra aún tiene datos provisionales (fuente `NOMBRE_ARCHIVO`).

Conexión del taller: `TALLER_DB_URL=postgresql://USER:PASS@postgres:5432/biblioteca_db`.

## 8. Voces
- Motor inicial: **edge-tts**. Voz por defecto: **`edge.es-ES-AlvaroNeural`** (decisión de Anderson).
- Catálogo inicial (el que Anderson escuchó y aprobó): Álvaro, Elvira, Ximena (es-ES), Carlos (es-HN), Gonzalo, Salomé (es-CO), Jorge (es-MX), Alonso (es-US), Tomás (es-AR).
- `GET http://taller:8926/voces` → `[{"id":"edge.es-ES-AlvaroNeural","nombre":"Álvaro","pais":"España","genero":"M","motor":"edge"}]`.
  biblioteca-service lo expone hacia la web como `POST /v1/voces/all` (con caché).
- Muestra de voz: `GET /datos/muestras/{vozId}.mp3` la genera el taller al arrancar si no existe; la sirve biblioteca-service.
- Audio: AAC-LC mono 48 kbps en `.m4a` (ffmpeg). Variante 2x con `atempo=2.0`.

## 9. API de biblioteca-service (a través del gateway: `/BIBLIOTECA-SERVICE/biblioteca/v1/...`)

Convención Oh Churus: **POST**, respuesta `ResultDTO {correct, message, errorCode, object}`, la identidad sale del token
(nunca `userId` en el cuerpo). Excepción documentada: los **archivos binarios se sirven por GET** (el `<audio>` y el lector
no pueden mandar cabeceras); aceptan `?t={jwt}` además de `Authorization`, y soportan `Range`.

| Método y ruta | Cuerpo | Respuesta (`object`) |
|---|---|---|
| POST `/v1/libros/subir` (multipart: `archivos[]`, `tipo`=LIBRO\|DOCUMENTO, v1.3.2 `deseoId?`: «Ya lo tengo», un solo archivo; el ejemplar hereda nota, etiquetas y estantes del deseo, que se borra) | — | `[EjemplarDTO]` (duplicado por sha256 → reutiliza el archivo) |
| POST `/v1/libros/deseo` | `{titulo, autor?, isbn?, nota?}` | `EjemplarDTO` (tipo DESEO, sin archivo) |
| POST `/v1/libros/all` | `FiltroLibrosDTO` | `PageDTO<EjemplarDTO>` |
| POST `/v1/libros/get/{ejemplarId}` | — | `EjemplarDetalleDTO` (incluye estructura resumida y progreso) |
| POST `/v1/libros/save` | `{id, titulo?, autores?, anio?, editorial?, sinopsis?, generos?, etiquetas?, estado?, calificacion?, favorito?, tipo?}` (v1.2: ausente = no tocar; `null` = vaciar) | `EjemplarDTO` |
| POST `/v1/libros/delete/{ejemplarId}` | — | `true` (v1.2: RETIRA el libro o documento conservando lo escrito, que reaparece al volver a subir el mismo fichero; borra los deseos. El archivo, solo si nadie más lo usa) |
| POST `/v1/libros/facetas` | `{pestana?}` (v1.2; por defecto TODO = solo libros) | `{autores:[{nombre,n}], generos:[…], anios:[…], formatos:[…], etiquetas:[…]}` |
| POST `/v1/progreso/get/{ejemplarId}` | — | `ProgresoDTO` |
| POST `/v1/progreso/save` | `ProgresoDTO` | `ProgresoDTO` (gana el `actualizadoEn` más reciente; v1.2: uno más de 2 min en el futuro se toma como la hora del servidor) |
| POST `/v1/anotaciones/all/{ejemplarId}` | — | `[AnotacionDTO]` |
| POST `/v1/anotaciones/save` | `AnotacionDTO` | `AnotacionDTO` |
| POST `/v1/anotaciones/delete/{id}` | — | `true` |
| POST `/v1/comentarios/all/{ejemplarId}` · `/save` · `/delete/{id}` | — / `{ejemplarId, texto}` | `[ComentarioDTO]` / `ComentarioDTO` |
| POST `/v1/estantes/all` · `/save` · `/delete/{id}` | — / `{id?, nombre, colorMadera?}` | `[EstanteDTO]` |
| POST `/v1/estantes/{id}/libros` | — | `[EjemplarDTO]` en orden |
| POST `/v1/estantes/{id}/agregar` · `/quitar` | `{ejemplarId}` | `true` |
| POST `/v1/estantes/{id}/ordenar` | `{ejemplarId, antesDe?: ejemplarId, despuesDe?: ejemplarId}` | `true` (índice fraccional) |
| POST `/v1/voces/all` | — | `[VozDTO]` |
| POST `/v1/audio/estado` | `{ejemplarId, vozId, capitulo, reintentar?}` | `{estado, duracionSeg, url1x, url2x, urlTiempos, error}` y encola si falta (v1.2: `vozId` del catálogo; un ERROR trae `error` y solo se reencola con `reintentar: true`). `estado`: PENDIENTE \| GENERANDO \| LISTO \| ERROR, o (v1.1) CONVIRTIENDO \| ERROR_CONVERSION si el libro aun no esta LISTO (no encola) |
| GET `/v1/archivos/{archivoId}/libro.epub` · `/portada.jpg` · `/original` | `?t=` | binario |
| GET `/v1/archivos/{archivoId}/audio/{vozId}/cap-{NNN}.m4a` · `-2x.m4a` · `.tiempos.json` | `?t=` | binario con Range |
| GET `/v1/voces/{vozId}/muestra.mp3` | `?t=` | binario |
| POST `/v1/traducir` (v1.3) | `{texto, origen?: 'auto'\|'en'\|'es', destino?: 'es'\|'en'}` | `TraduccionDTO`. 503 si el traductor no responde, 429 por el freno |
| POST `/v1/traducir/capitulo` (v1.3) | `{ejemplarId, capitulo, destino?: 'es', reintentar?: boolean}` | `CapituloTraducidoDTO`: `LISTO` con las frases, `PENDIENTE` (volver a preguntar) o `ERROR` con `error` |

El favorito es un estante de sistema `FAVORITOS` (uno por usuario, se crea solo); `favorito` en `EjemplarDTO` = está en ese estante.

### DTOs
```ts
EjemplarDTO {
  id, archivoId|null, tipo: 'LIBRO'|'DOCUMENTO'|'DESEO',
  estado: 'POR_LEER'|'LEYENDO'|'LEIDO'|'ABANDONADO',
  titulo, subtitulo|null, autores: string[], anio|null, editorial|null, idioma|null, isbn|null,
  sinopsis|null, generos: string[], etiquetas: string[], calificacion|null (0.5..5), favorito: boolean,
  formatoOriginal|null ('EPUB'|'PDF'|'DOCX'|'DOC'|'TXT'), estadoConversion|null, tienePortada: boolean,
  minutosEstimados|null, porcentaje: number (0..100), fechaLlegada (ISO), ultimaApertura|null, fechaFin|null,
  nNotas: number, fuenteMetadatos: 'NOMBRE_ARCHIVO'|'ARCHIVO'|'MANUAL'|'OPEN_LIBRARY'|'IA',
  nota|null (v1.2, la del deseo), yaLoTenias?: boolean (v1.2, solo en la respuesta de /subir)
}
EjemplarDetalleDTO extends EjemplarDTO { capitulos: [{indice, titulo, minutos}], progreso: ProgresoDTO|null }
FiltroLibrosDTO {
  pestana?: 'TODO'|'LEYENDO'|'POR_LEER'|'LEIDOS'|'FAVORITOS'|'DESEOS'|'DOCUMENTOS',
  texto?, autores?: string[], generos?: string[], formatos?: string[], etiquetas?: string[],
  anioDesde?, anioHasta?, calificacionMin?, conNotas?: boolean,
  orden?: 'RECIENTES'|'ANTIGUOS'|'ULTIMO_ABIERTO'|'TITULO'|'AUTOR'|'ANIO'|'PROGRESO'|'CALIFICACION',
  page?: 0, size?: 30
}
ProgresoDTO { ejemplarId, capitulo, fraseId|null, cfi|null, posicionAudioSeg|null, vozId|null, velocidad|null,
              porcentaje, modo: 'VISTA'|'VOZ', dispositivo|null, actualizadoEn (ISO, lo pone el cliente) }
AnotacionDTO { id?, ejemplarId, tipo: 'RESALTADO'|'NOTA'|'MARCADOR', color|null, cfi|null,
               fraseInicio|null, offsetInicio|null, fraseFin|null, offsetFin|null, versionTexto|null,
               textoCitado|null, prefijo|null, sufijo|null, nota|null, capitulo|null, creado?, editado? }
ComentarioDTO { id?, ejemplarId, texto, creado? }
EstanteDTO { id, nombre, tipo: 'FAVORITOS'|'COLECCION', colorMadera|null, nLibros }
VozDTO { id, nombre, pais, genero, motor, porDefecto }
PageDTO<T> { page, size, totalPage, totalElements, list: T[] }
TraduccionDTO { traduccion: string, origenDetectado: 'en'|'es'|null }            // v1.3
CapituloTraducidoDTO {                                                            // v1.3
  estado: 'LISTO'|'PENDIENTE'|'ERROR',
  frases: [{id: 'c003-s00000', texto: string}],  // solo con LISTO, todas en orden, mismos ids que el EPUB
  error: string|null,                            // solo con ERROR (mensaje para mostrar tal cual)
  progreso: number                               // 0..99 en PENDIENTE, 100 en LISTO
}
```

### Traducción (v1.3)
- Fichero `normalizados/{archivoId}/traducciones/{destino}/cap-NNN.json`:
  `{"versionFormato":1,"capitulo":3,"origen":"en","destino":"es","fuenteSha256":"…","motor":"libretranslate","frases":[{"id":"c003-s00000","texto":"…"}]}`.
  `fuenteSha256` = sha256 de `frases/cap-NNN.json`; si no coincide, se rehace. Lo borra el borrado del archivo.
- Frases vacías se devuelven vacías; frases repetidas se traducen una vez. Lotes de 40 frases / 4000 caracteres
  por llamada al traductor (timeout de lectura 60 s).
- El trabajo en segundo plano vive en biblioteca-service (1 hilo, cola de 20): si se reinicia, la siguiente
  consulta lo relanza (el estado sale de los ficheros).

### Límites de entrada (v1.2, QA SE-07 / SE-12 / BI-25) — por encima, 120 con el campo
| Campo | Máximo |
|---|---|
| `AnotacionDTO.nota` · `textoCitado` · `prefijo`/`sufijo` · `cfi` · `color` · `fraseInicio`/`fraseFin` | 10 000 · 5 000 · 1 000 · 2 000 · 30 · 20 |
| `ComentarioDTO.texto` | 10 000 |
| `DeseoDTO.titulo` · `autor` · `isbn` · `nota` | 500 · 300 · 20 · 2 000 |
| `LibroSaveDTO.titulo` · `editorial` · `sinopsis` | 500 · 300 · 10 000 |
| `LibroSaveDTO.autores` · `generos` · `etiquetas` | 20 de 300 · 20 de 100 · 50 de 50 |
| `LibroSaveDTO.anio` | entero de -3000 a 2100 |
| `ProgresoDTO.fraseId` · `vozId` · `dispositivo` · `cfi` | 20 · 80 · 100 · 2 000 |
| `ProgresoDTO.porcentaje` · `velocidad` · `posicionAudioSeg` | 0–100 · 0.25–5 · 0–10 000 000 (finitos) |
| `EstanteSaveDTO.nombre` · colecciones por usuario | 100 · `BIBLIOTECA_MAX_ESTANTES` (100) |
| `TraducirDTO.texto` · `origen`/`destino` (v1.3) | 1–5 000 · 10 (y de la lista `TRADUCTOR_IDIOMAS`) |
| `TraducirCapituloDTO.capitulo` (v1.3) | 0–999 |
| Subida: archivos por petición · por archivo · por petición · libre en `/datos` | `BIBLIOTECA_MAX_ARCHIVOS_POR_SUBIDA` (20) · `BIBLIOTECA_MAX_ARCHIVO` (300MB) · `BIBLIOTECA_MAX_SUBIDA` (1GB) · `BIBLIOTECA_ESPACIO_MINIMO_MB` (1024) → 413 / 507 |

## 10. Reglas transversales
1. Ningún endpoint acepta `userId` en el cuerpo; todo se filtra por el usuario del token.
2. Un usuario nunca ve ni sirve archivos de ejemplares que no son suyos (prueba de arquitectura).
3. Las anotaciones nunca se borran al reprocesar un libro.
4. Si `/datos` no está disponible: la API sigue respondiendo (biblioteca, progreso, notas) y los binarios devuelven 503 con mensaje claro; queda en log.
5. Mensajes al usuario en español; nada de secretos en el repo (`.env` ignorado).
