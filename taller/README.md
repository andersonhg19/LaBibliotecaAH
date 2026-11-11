# Taller de La Biblioteca AH

Servicio Python 3.12 (FastAPI + trabajadores en segundo plano, **mismo proceso**) que:

1. **Convierte** EPUB, PDF con texto, DOCX, DOC y TXT a un EPUB3 normalizado con un id estable por frase
   (`<span class="bah-f" id="cNNN-sNNNNN">`), más `estructura.json`, `portada.jpg` y `frases/cap-NNN.json`.
2. **Genera la voz** de un capítulo (edge-tts, frase a frase, con caché): `cap-NNN.m4a` (AAC-LC mono 48 kbps),
   `cap-NNN-2x.m4a` (atempo=2.0) y `cap-NNN.tiempos.json` (tiempos por frase y por palabra).

El contrato vinculante está en `../documentación/contratos.md` (§2 volumen, §3 ids, §4-6 JSON, §7 cola, §8 voces).

## Estructura

```
app/
  __main__.py          arranque: valida la configuración y lanza uvicorn (python -m app)
  cli.py               conversión / voz a mano, sin base de datos (python -m app.cli …)
  api/servidor.py      FastAPI: GET /salud, GET /voces; ciclo de vida (hilos de trabajo, muestras de voz)
  config/              ajustes.py (pydantic-settings), rutas.py (/datos), registro.py (logs clave=valor)
  dominio/             modelo.py (Libro, Capitulo, NodoToc, errores), mensajes.py (textos al usuario), voces.py
  cola/                repositorio.py (SQL de bah_lib_trabajo/archivo/audio), trabajador.py (bucle + manejadores)
  conversion/          desde_epub|pdf|docx|txt.py → html_util (limpieza) → normalizador → segmentador
                       → frases (spans por frase) → epub_salida (EPUB3) ; convertir.py orquesta
                       limites.py (topes anti zip-bomb), aislado.py (subproceso acotado), partir.py (troceo de
                       capítulos largos), metadatos.py (títulos genéricos, "Apellido, Nombre")
  voz/                 motor.py (MotorDeVoz, EdgeTts, PiperLocal pendiente), capitulo.py (síntesis + ensamblado),
                       alineacion.py (palabras → offsets del texto visual), audio.py (ffmpeg), muestras.py
tests/                 corpus generado por programa (corpus.py) + pruebas pytest
```

## Configuración (variables de entorno, validadas al arrancar)

| Variable | Defecto | Notas |
|---|---|---|
| `TALLER_DB_URL` | **obligatoria** | `postgresql://USUARIO:CLAVE@postgres:5432/biblioteca_db`. Sin ella el proceso sale con código 2 y un mensaje claro |
| `TALLER_DATOS` | `./datos-dev` (`/datos` en la imagen) | raíz del volumen compartido con biblioteca-service |
| `TALLER_PUERTO` | `8926` | |
| `TALLER_INTERVALO_SEG` | `2` | sondeo de la cola |
| `TALLER_MAX_INTENTOS` | `3` | |
| `TALLER_MINUTOS_ATASCADO` | `5` | EN_CURSO sin latido durante más de esto vuelven a PENDIENTE (barrido periódico) |
| `TALLER_INTERVALO_BARRIDO_SEG` | `60` | cada cuánto se barren los EN_CURSO colgados |
| `TALLER_HILOS_VOZ` | `2` | trabajos de voz simultáneos (un capítulo largo no bloquea a los demás) |
| `TALLER_CONCURRENCIA_VOZ` | `4` | peticiones simultáneas a edge-tts **por hilo de voz** |
| `TALLER_AISLAR_CONVERSION` | `true` | cada conversión en un subproceso con memoria y tiempo acotados |
| `TALLER_MEMORIA_CONVERSION_MB` | `1536` | tope de memoria virtual del subproceso de conversión |
| `TALLER_TIEMPO_CONVERSION_SEG` | `1200` | tiempo máximo de una conversión |
| `TALLER_TRABAJADORES` / `TALLER_MUESTRAS` | `true` | apagar hilos / generación de muestras (pruebas) |
| `TALLER_LOG` | `INFO` | |

Zona horaria del contenedor: `America/Bogota`. Logs: `fecha nivel=… hilo=… trabajo=<id> archivo=<id> origen=… msg=…`.

## Cola de trabajos

Hilos: `conversion` (tipo `CONVERTIR`) y `voz`, `voz-2`… (`TALLER_HILOS_VOZ`, tipo `VOZ_CAPITULO`); la voz nunca
bloquea conversiones y un capítulo largo no deja esperando a los demás.
SQL de toma = el del contrato **más** `AND tipo = ANY(%(tipos)s)` en la subconsulta (ver `cola/repositorio.py`).
Fallo: intentos < 3 → `PENDIENTE` (con el mensaje en `error`); 3.º fallo o error sin arreglo (`ErrorDefinitivo`:
PDF escaneado, formato no soportado, archivo dañado, DRM, voz inexistente, libro desmesurado…) → `ERROR`.
Los mensajes al usuario salen de `dominio/mensajes.py` y nunca llevan detalle técnico (va al log).

Recuperación (QA DA-01):
- Todo trabajo en curso refresca `actualizado` cada 60 s (latido, en un hilo aparte).
- Al arrancar se devuelven a `PENDIENTE` **todos** los `EN_CURSO` de los tipos del taller (hay un único taller por
  base de datos: lo que estaba en curso murió con el proceso anterior), junto con su archivo (`PROCESANDO` →
  `PENDIENTE`) o su audio (`GENERANDO` → `PENDIENTE`). El contador de intentos no se toca: un archivo que tumba el
  proceso tres veces acaba en `ERROR`.
- Un barrendero devuelve a `PENDIENTE` cada minuto los `EN_CURSO` sin latido desde hace `TALLER_MINUTOS_ATASCADO`.

Libro retirado mientras se procesa (QA DA-14/DA-28): el taller comprueba que el original, la fila de
`bah_lib_archivo` y la carpeta `normalizados/` siguen existiendo; si no, borra lo que escribió y termina el trabajo
sin reintentos. El UPSERT de `bah_lib_audio` solo inserta si el archivo existe (no deja filas huérfanas).

Seguridad de la conversión (QA SE-01): topes antes de leer (ZIP: entradas, tamaño total y por parte, ratio de
compresión; TXT 32 MB; DOC 64 MB; PDF 3000 páginas; ver `conversion/limites.py`) y subproceso con `RLIMIT_AS`,
`oom_score_adj=1000` y tiempo máximo: un archivo hostil acaba en `ERROR` con un mensaje claro sin tumbar el servicio.

## Pruebas y calidad (una sola puerta)

No hace falta Python, ffmpeg, pandoc ni LibreOffice en el PC: todo corre dentro de la imagen.

```bash
cd taller
docker build --target pruebas -t bah-taller:pruebas .
docker run --rm bah-taller:pruebas          # ruff check + ruff format --check + mypy + pytest (cobertura ≥ 85 %)
```

Opcionales:

```bash
# Pruebas contra PostgreSQL real (SQL de la cola, SKIP LOCKED concurrente, upserts)
docker network create bah-prueba
docker run -d --name bah-pg-prueba --network bah-prueba -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=biblioteca_db postgres:14
docker run --rm --network bah-prueba \
  -e TALLER_DB_URL_PRUEBA=postgresql://postgres:prueba@bah-pg-prueba:5432/biblioteca_db \
  bah-taller:pruebas python -m pytest -q -m postgres --no-cov
# Prueba con internet (edge-tts real)
docker run --rm bah-taller:pruebas python -m pytest -q -m red --no-cov
```

## Ejecutar

```bash
docker build -t bah/taller .
docker run --rm -p 127.0.0.1:8926:8926 -v "$PWD/../datos-dev:/datos" \
  -e TALLER_DB_URL=postgresql://biblioteca:CLAVE@host.docker.internal:5433/biblioteca_db bah/taller
curl http://127.0.0.1:8926/salud
```

En el stack completo lo levanta `../docker-compose.yml` (servicio `taller`).

Herramienta manual sin base de datos (dentro del contenedor):

```bash
python -m app.cli convertir /ruta/libro.epub 00000000-0000-0000-0000-000000000001
python -m app.cli voz 00000000-0000-0000-0000-000000000001 edge.es-ES-AlvaroNeural 0
```

## Pendiente (conocido)

- OCR de PDF escaneados (Ola 7): hoy quedan en `ERROR` con "PDF escaneado: el OCR llegará en una ola posterior".
- Motor Piper local: solo la interfaz (`PiperLocal`), sin modelos descargados.
- PDF: las imágenes internas no se copian (solo la portada = página 1); capítulos con granularidad de página.
- PDF sin marcadores: capítulos por tramos de 15 páginas, no por los títulos grandes (QA DA-22).
- PDF a tres columnas: el orden de lectura se mezcla (QA DA-23; dos columnas sí va bien).
- Resaltado de palabra en expansiones de voz ("12/10/1492", "1.250,50") aproximado (QA DA-26).
- RTF/MOBI/AZW3/FB2 (Calibre) no soportados todavía.
