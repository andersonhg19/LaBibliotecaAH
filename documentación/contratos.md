# Contratos entre componentes — La Biblioteca AH

> Fuente de verdad técnica compartida por `backend/`, `taller/` y `frontend/`.
> Cualquier cambio aquí se anota en `seguimiento/bitacora.md`. Versión 1 — 2026-11-10.

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

Producción (casa): Tailscale `https://casa.tail60fcb5.ts.net:7050` → 127.0.0.1:3100 (web) y `:7051` → 127.0.0.1:8920 (gateway).

- Paquete Java raíz: `com.bibliotecaah.<servicio>` (ej. `com.bibliotecaah.auth`, `com.bibliotecaah.biblioteca`).
- Maven: `groupId com.bibliotecaah`, padre `backend/pom.xml` (`la-biblioteca-ah`), Spring Boot 3.2.5, Spring Cloud 2023.0.3, Java 17.
- Prefijos de tabla: `bah_auth_` (auth), `bah_lib_` (biblioteca).
- JWT: igual que Oh Churus (HMAC256, `com.auth0:java-jwt`, claims `sub`=email, `userId`, `name`, `roles`). `SECRET` **obligatorio** (sin valor por defecto en el código).

## 2. Volumen de archivos

Raíz montada en `/datos` en **biblioteca-service y taller** (en casa: `E:\LaBibliotecaAH`; en desarrollo: `./datos-dev`).

```
/datos/
  originales/{archivoId}/{nombreOriginalSaneado}        ← lo escribe biblioteca-service al subir
  normalizados/{archivoId}/libro.epub                    ← taller (EPUB3 con ids por frase)
  normalizados/{archivoId}/estructura.json               ← taller
  normalizados/{archivoId}/portada.jpg                   ← taller (si hay; máx. 1200 px de alto)
  normalizados/{archivoId}/frases/cap-{NNN}.json         ← taller (texto por frase para la voz)
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
  VOZ_CAPITULO solo se encola cuando el archivo está `LISTO` (si no, el taller lo marca ERROR). Trabajos `EN_CURSO` con `actualizado` > 30 min se devuelven a `PENDIENTE` al arrancar el taller.
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
| POST `/v1/libros/subir` (multipart: `archivos[]`, `tipo`=LIBRO\|DOCUMENTO) | — | `[EjemplarDTO]` (duplicado por sha256 → reutiliza el archivo) |
| POST `/v1/libros/deseo` | `{titulo, autor?, isbn?, nota?}` | `EjemplarDTO` (tipo DESEO, sin archivo) |
| POST `/v1/libros/all` | `FiltroLibrosDTO` | `PageDTO<EjemplarDTO>` |
| POST `/v1/libros/get/{ejemplarId}` | — | `EjemplarDetalleDTO` (incluye estructura resumida y progreso) |
| POST `/v1/libros/save` | `{id, titulo?, autores?, anio?, editorial?, sinopsis?, generos?, etiquetas?, estado?, calificacion?, favorito?, tipo?}` | `EjemplarDTO` |
| POST `/v1/libros/delete/{ejemplarId}` | — | `true` (borra el ejemplar; el archivo solo si nadie más lo usa) |
| POST `/v1/libros/facetas` | — | `{autores:[{nombre,n}], generos:[…], anios:[…], formatos:[…], etiquetas:[…]}` |
| POST `/v1/progreso/get/{ejemplarId}` | — | `ProgresoDTO` |
| POST `/v1/progreso/save` | `ProgresoDTO` | `ProgresoDTO` (gana el `actualizadoEn` más reciente) |
| POST `/v1/anotaciones/all/{ejemplarId}` | — | `[AnotacionDTO]` |
| POST `/v1/anotaciones/save` | `AnotacionDTO` | `AnotacionDTO` |
| POST `/v1/anotaciones/delete/{id}` | — | `true` |
| POST `/v1/comentarios/all/{ejemplarId}` · `/save` · `/delete/{id}` | — / `{ejemplarId, texto}` | `[ComentarioDTO]` / `ComentarioDTO` |
| POST `/v1/estantes/all` · `/save` · `/delete/{id}` | — / `{id?, nombre, colorMadera?}` | `[EstanteDTO]` |
| POST `/v1/estantes/{id}/libros` | — | `[EjemplarDTO]` en orden |
| POST `/v1/estantes/{id}/agregar` · `/quitar` | `{ejemplarId}` | `true` |
| POST `/v1/estantes/{id}/ordenar` | `{ejemplarId, antesDe?: ejemplarId, despuesDe?: ejemplarId}` | `true` (índice fraccional) |
| POST `/v1/voces/all` | — | `[VozDTO]` |
| POST `/v1/audio/estado` | `{ejemplarId, vozId, capitulo}` | `{estado, duracionSeg, url1x, url2x, urlTiempos}` y encola si falta. `estado`: PENDIENTE \| GENERANDO \| LISTO \| ERROR, o (v1.1) CONVIRTIENDO \| ERROR_CONVERSION si el libro aun no esta LISTO (no encola) |
| GET `/v1/archivos/{archivoId}/libro.epub` · `/portada.jpg` · `/original` | `?t=` | binario |
| GET `/v1/archivos/{archivoId}/audio/{vozId}/cap-{NNN}.m4a` · `-2x.m4a` · `.tiempos.json` | `?t=` | binario con Range |
| GET `/v1/voces/{vozId}/muestra.mp3` | `?t=` | binario |

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
  nNotas: number, fuenteMetadatos: 'NOMBRE_ARCHIVO'|'ARCHIVO'|'MANUAL'|'OPEN_LIBRARY'|'IA'
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
```

## 10. Reglas transversales
1. Ningún endpoint acepta `userId` en el cuerpo; todo se filtra por el usuario del token.
2. Un usuario nunca ve ni sirve archivos de ejemplares que no son suyos (prueba de arquitectura).
3. Las anotaciones nunca se borran al reprocesar un libro.
4. Si `/datos` no está disponible: la API sigue respondiendo (biblioteca, progreso, notas) y los binarios devuelven 503 con mensaje claro; queda en log.
5. Mensajes al usuario en español; nada de secretos en el repo (`.env` ignorado).
