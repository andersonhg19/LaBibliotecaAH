# La Biblioteca AH 0.5.0 — contratos compartidos (C9–C13)

Origen (Anderson, 2026-11-25), con sus palabras:
- «literalmente se corta el sonido y no sigue sonando»
- «quitar un libro de la lista de en proceso de lectura»
- «cuando empiece a leer un libro y lo marque como que me lo voy a leer… tener el acceso completo a todas las pistas
  de sonido de ese libro, y cuando lo termino o lo quito de esa lista se borren esas pistas» — decisión: se borra la
  copia del DISPOSITIVO; el audio del servidor se queda.
- «no puede ser que no empiece a leer hasta que no estén todas las pistas» → preparar/descargar en segundo plano, nunca bloquea.
- «buscar una forma de tener un offline» → app web instalable con service worker (sin app nativa).
- «muchos libros que… solo quiero tener la lista de todo lo que he leído… no necesito preparación de audio» → libros «solo registro».
- «pausas extrañas», «en el cambio de capítulo no lo toma», «le doy despausar» y no sigue.
- «toco la carátula desde el panel de control del iPhone… me lleva a Oh Churus en vez de a la biblioteca» → lo trata ops (nombre propio en Tailscale) + `id` en el manifest.

Producción quedó en **0.4.0** el 2026-11-25 (V6+V7 aplicadas). Base de la 0.5.0: `main` = `ff5e36e`.

## C9 — Diario del reproductor (telemetría propia; nunca sale de casa)
`POST /v1/diario` (autenticado, cualquier rol). Cuerpo:
```json
{ "eventos": [ { "cuando": "2026-11-25T21:03:11.120Z", "tipo": "atasco", "ejemplarId": "uuid|null",
  "capitulo": 3, "posicion": 812.4, "detalle": "texto corto",
  "contexto": { "standalone": true, "cinta": true, "visible": false, "red": true, "ua": "…", "version": "0.5.0" } } ] }
```
- 1..50 eventos por lote; `tipo` ≤ 40 chars `[a-z0-9-]`; `detalle` ≤ 500; `ua` ≤ 200; `contexto` objeto plano ≤ 2 KB. Fuera de límites → 400 ResultDTO (código de validación existente). Más de 50 → 400.
- Respuesta 200 `ResultDTO{ object: { guardados: n } }`. Usuario = el del token (nunca del cuerpo). `ejemplarId` ajeno o inexistente se guarda como null (no es error: es telemetría).
- Flyway **V8** (aditiva): tabla `bah_lib_diario` (id uuid, usuario_id bigint, ejemplar_id uuid null, cuando timestamptz, tipo varchar(40), capitulo int null, posicion double null, detalle varchar(500) null, contexto jsonb null, creado_en timestamptz default now()) + índice (usuario_id, cuando). Retención: tarea diaria borra > 30 días.
- Cada evento también deja una línea `INFO diario usuario=… tipo=… cap=… pos=… detalle=…` (para `docker logs`).
- Límite: como mucho 600 eventos por usuario y hora (los de más se descartan en silencio, respuesta igual 200 con `guardados` real).
- Tipos que manda la web (lista abierta): `inicio`, `pausa-usuario`, `pausa-sistema`, `reanuda`, `atasco`, `atasco-recuperado`, `error-audio`, `error-red`, `cinta-fallo`, `cinta-apagada`, `cambio-capitulo`, `fin-capitulo`, `fin-libro`, `oculta`, `visible`, `interrupcion`, `sin-conexion-uso`, `descarga-error`.

## C10 — «Leyendo» manda (preparación en segundo plano)
1. **Auto-paso a LEYENDO** (`ProgresoServiceImpl`): hoy cualquier guardado de progreso pasa POR_LEER→LEYENDO. Desde la 0.5.0 solo si el progreso **avanza de verdad**: capítulo distinto del guardado o `porcentaje` > guardado + 0,001 (si no había progreso, solo si capítulo > 0 o porcentaje > 0). Abrir la ficha o el lector sin avanzar no lo mete en «Leyendo». LEIDO/ABANDONADO nunca cambian solos (como hoy).
2. **Preparar desde donde vas**: `PrepararLibroDTO` gana `desdeCapitulo` (Integer, opcional, ≥ 0). Se encola primero de ese capítulo al final y luego los anteriores; sin él, desde el capítulo del progreso del usuario (0 si no hay). Garantizar que el orden de encolado se respeta en la cola (misma prioridad → orden de creación; verificar en `TrabajoRepository`/taller y documentarlo).
3. **La web** llama `POST /v1/voz/preparar-libro {ejemplarId, vozId, desdeCapitulo}` cuando un libro **pasa a LEYENDO** (a mano o al empezar a escuchar) con la voz elegida del usuario, y `sincronizarSinConexion(leyendo)` tras cualquier cambio de estado. Escuchar nunca espera a esto (el capítulo pedido sigue yendo por la cola urgente).
4. **Quitar de «Leyendo»** desde la propia lista/balda (no solo desde la ficha): acción «Quitar de En proceso» → hoja con «Lo dejo para después» (POR_LEER), «Lo abandoné» (ABANDONADO), «Ya lo terminé» (LEIDO). Usa el `save` existente. Tras quitarlo, se borra la copia del dispositivo.

## C11 — Libros «solo registro» (sin archivo)
- Para apuntar libros ya leídos sin subir el archivo: título (obligatorio), autores, estado (por defecto LEIDO; también POR_LEER/ABANDONADO), fecha de fin opcional, valoración y nota opcionales.
- El backend decide el modelo tras leer cómo funciona hoy el **deseo** (`POST /v1/libros/deseo`, ejemplar sin archivo): reutilizarlo si es seguro (p. ej. ejemplar `tipo=LIBRO` sin archivo) y **blindar** todos los sitios que hacen `e.getArchivo().getId()` (voz, preparar, lector, portada, estado de audio, reclasificar, estadísticas): sin archivo → 409/400 ResultDTO claro («Este libro no tiene archivo: es solo registro»), nunca 500.
- `EjemplarDTO` gana `sinArchivo: boolean`. Endpoint nuevo `POST /v1/libros/registro`. Un libro sin archivo **no** se puede poner en LEYENDO con voz (puede estar en LEYENDO para el registro, pero la web no ofrece Escuchar/Leer ni prepara nada).
- Opcional si sale limpio: subir después el archivo a ese mismo ejemplar. Si no es trivial, fuera de alcance (anotarlo).

## C12 — Sin conexión (solo web) — ver `frontend/src/utils/sinConexion.ts` (la firma ES el contrato)
- Service worker `/sw.js` (scope `/`), registrado solo en la web de producción/QA (no en jest, no en `expo start` dev), con versión de caché ligada a la versión de la app; al activar una versión nueva borra las cachés de app viejas (nunca las de libros).
- Cachés: `bah-app-<version>` (index.html red-primero con respaldo de caché; js/css/fuentes/iconos caché-primero), `bah-api` (GET/POST de lectura que el reproductor necesita: libro, capítulos, progreso, preferencias — red-primero con respaldo), `bah-libro-<ejemplarId>` (audio, tiempos, frases/texto, portada del libro).
- Clave de caché **sin** el parámetro `t` (token). Respuestas a `<audio>` con `Range` → 206 desde la caché.
- `navigator.storage.persist()` al guardar el primer libro.
- Progreso, latidos y diario sin red → cola local que se vacía al volver la red (sin duplicar: el backend ya hace upsert por `sesionId`; el progreso solo manda el último).
- Sin red no se cierra la sesión (un fallo de red no es un 401).

## C13 — Reproductor blindado
- Vigilante: si se quiere sonar y `currentTime` no avanza en 8 s (sin pausa del usuario), se registra `atasco` y se recupera (recargar en la misma posición; si es la cinta, rehacerla; máx. 3 intentos y luego error visible con «Reintentar»). Eventos `stalled`/`suspend`/`waiting` largos también al diario.
- Pausa que no pidió el usuario (llamada, Siri, otra app, iOS) → `pausa-sistema`; al volver (`visible`/`focus`/acción de Media Session `play`) se reanuda solo si el sistema la pausó y no el usuario.
- Cambio de capítulo (botón, hoja, fin de capítulo, Media Session next/prev) siempre deja sonando el capítulo correcto; cubrirlo con pruebas.
- Media Session: metadatos y `setPositionState` al día; artwork con URL absoluta del propio origen de la web.
