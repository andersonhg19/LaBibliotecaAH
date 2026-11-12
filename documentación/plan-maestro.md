# La Biblioteca AH — Plan maestro

> Lector de libros y audiolibros personal (Anderson + Samy), con experiencia de biblioteca privada de lujo.
> Tercera gran herramienta de la familia Oh Churus. Repo nuevo, misma base técnica.
> Redactado: 2026-11-10. Estado: **PROPUESTA — pendiente de aprobación** (ver §17 Decisiones abiertas).

---

## 0. Visión en una frase

Abrir la app es entrar a una biblioteca de roble y cedro: los libros están en estantes, los sacas arrastrando,
se abren con un gesto de libro físico, los lees con los ojos o con una voz natural (hasta 5x, con la pantalla
bloqueada), y siempre retoman exactamente donde los dejaste — en el iPhone de Anderson, en el Android de Samy
o en el navegador — porque la memoria vive en el servidor de casa, no en la caché del teléfono.

---

## 1. Lo que aprendimos de la app de referencia ("Lector de textos" / Voice Aloud Reader, Marcin Olawski)

Investigación completa: App Store ES/US/GB/DE, política de privacidad, historial de versiones, ficha de la ONCE y
**595 reseñas** analizadas. Respaldo en bruto: `scratchpad/dl/all_reviews.txt` de la sesión del 2026-11-10.

### 1.1 Lo que tiene y vamos a igualar
| Área | Referencia | Nosotros |
|---|---|---|
| Formatos | PDF, EPUB, DOC/DOCX (pago), RTF, Pages, web, foto (OCR) | PDF, EPUB, DOC, DOCX, TXT (fase 1); RTF, web, OCR (después) |
| Vista | EPUB refluido con tipografía de libro; PDF como página original | Igual: lector refluido + vista "original" para PDF |
| Resaltado de voz | Bloque de 2-3 frases en verde (no palabra a palabra) | **Frase + palabra** (palabra hasta 2.5x; solo frase por encima) |
| Navegación | Índice multinivel, "leer desde aquí", "posición anterior" | Igual + salto a página/%, + capítulo anterior/siguiente |
| Velocidad | ¼x a 4x, deslizador | **0.5x a 5x**, deslizador + atajos |
| Pantalla bloqueada / coche | Now Playing, CarPlay como reproductor | Igual (Now Playing iOS, MediaSession Android, CarPlay/Android Auto como reproductor) |
| Retomar posición | Sí (sincroniza posición entre dispositivos desde v3.0.1) | **Sí, en el servidor**, por usuario y por libro |
| Voces | Apple del sistema + "premium" en la nube frase a frase | Voces neuronales generadas en el servidor de casa (§6) |

### 1.2 Lo que las reseñas odian y nosotros resolvemos de entrada
1. **Biblioteca pobre**: sin búsqueda, sin orden, sin carpetas, sin renombrar, portada = solo el título → *nuestra prioridad #1*.
2. **Sin marcadores, subrayados ni notas** (la petición más repetida junto al temporizador).
3. **Sin temporizador de apagado.**
4. **Retroceso impreciso** (cae al inicio de página) → saltos por frase, por párrafo y de 15 s.
5. **Se detiene al final de la página con pantalla bloqueada** → audio pregenerado por capítulo, no síntesis en vivo.
6. **Voces gratis robóticas / premium con tope de caracteres / voces que desaparecen** → voces nuestras, sin topes, versionadas.
7. **Errores de pronunciación**: ligaduras "ff/fi" de PDF, "St." → "Street", fechas como números, palabras cortadas
   por guion al final de línea, cursivas deletreadas → *normalizador de texto* antes del TTS (§5.4).
8. **Orden de lectura roto** en PDF (columnas, notas al margen) → modo "lectura inteligente" que salta cabeceras,
   pies, números de página y notas.
9. Sin extensión para compartir → "Compartir con La Biblioteca" desde otras apps (fase posterior).

### 1.3 La voz "Carlos España"
Verificado en catálogos oficiales: **no existe un "Carlos" de España** en Amazon Polly, Azure, Google, Nuance ni ReadSpeaker.
- Amazon Polly **Carlos** = español de **EE. UU.**, voz generativa (sin marcas de tiempo).
- Nuance/Cerence **Carlos** = español de **Colombia**.
- Azure `es-HN-CarlosNeural` = Honduras.
Lo más probable es que el "Carlos" que conoces sea el de Polly (voz premium de la app). Para comprobarlo hay una prueba
de 1 minuto en el iPhone (ver §17). Plan: ofrecer **Álvaro** (Azure/Edge, es-ES), **Tristán multilingüe** (Azure, es-ES HD),
Sergio/Raúl (Polly es-ES) y, si se quiere el timbre exacto de Carlos, **Polly Carlos** como voz opcional de pago por uso.

---

## 2. Requisitos de Anderson (trazabilidad)

| # | Requisito | Dónde se resuelve |
|---|---|---|
| R1 | Mi biblioteca es el módulo prioritario | Olas 1 y 5 |
| R2 | Filtros múltiples: leídos, por leer, leyendo, autor, género, año, formato, tipo, favorito, deseo | §8.2 |
| R3 | Comentarios sobre un libro | `bah_lib_comentario` §4 |
| R4 | Retomar donde lo dejé tras mucho tiempo, sin caché | Progreso en servidor §7.4 |
| R5 | IA que busque portada, autor, sinopsis, título, año… | Bibliotecario IA §9 |
| R6 | Favoritos con orden por arrastre | `bah_lib_estante_item.orden` §8.4 |
| R7 | Efecto libro físico: sacar el libro de la estantería y que se despliegue | §10.3 |
| R8 | Listas de deseos | Estado `DESEO` + libros sin archivo §8.1 |
| R9 | Notas/marcas en el texto guardadas en BD que reaparecen al releer | Anotaciones ancladas §7.3 |
| R10 | Efectos rudimentarios y realistas (sonido de página, madera, luz) | §10.4 |
| R11 | Documentos personales (no de autor) como documentos | Tipo `DOCUMENTO` §8.1 |
| R12 | Almacenamiento de libros en un disco del PC casa | §11 |
| R13 | Repo nuevo con la base de Oh Churus (usuarios, roles…) | §3 y Ola 0 |
| R14 | Leer PDF, Word, .doc, TXT, EPUB | §5 |
| R15 | Velocidades hasta 5x | §6.3 |
| R16 | Múltiples voces | §6 |
| R17 | Android (Samy) + iPhone (Anderson) | §12 |
| R18 | Recientes por orden de llegada, filtrable en leídos y por leer | `fecha_llegada` + orden §8.2 |
| R19 | Colores de biblioteca de lujo: madera, roble, cedro | §10.1 |
| R20 | Leer visualmente, marcar texto, saltar páginas, capítulos | §7 |
| R21 | Se ve lo que va leyendo y funciona con pantalla bloqueada | §6.4 |
| R22 | Futuro: videoteca de cursos (YouTube, textos, documentos) | §15 |

---

## 3. Decisiones de arquitectura (recomendadas)

| Decisión | Recomendación | Por qué | Alternativa descartada |
|---|---|---|---|
| Repo | Nuevo monorepo `LaBibliotecaAH` en `Z:\Personales\LaBibliotecaAH` (= casa `C:\Users\ander\Documents\Anderson\Personales\LaBibliotecaAH`) | Lo pidió Anderson; ciclo de vida separado de Oh Churus | Módulo dentro del repo Oh Churus |
| Identidad | **Ver decisión abierta D1** | — | — |
| Backend negocio | Spring Boot 3.2.5 / Java 17, mismo patrón de Oh Churus (ResultDTO, POST, Flyway, JaCoCo, Karate) | Base probada con >90% cobertura | — |
| Procesamiento pesado | **Microservicio Python (FastAPI)** "taller": conversión de documentos + TTS + alineación | Las mejores herramientas (PyMuPDF, ebooklib, pandoc, Piper, Kokoro, edge-tts, WhisperX) son Python | Apache Tika en Java (pierde estructura) |
| Formato interno | Todo se normaliza a **EPUB3 con un `id` estable por frase** (`c03-s0123`) | Un solo lector, un solo sistema de anclas, el mismo id une texto ↔ audio ↔ notas | Renderizar cada formato por separado |
| Lector visual | **foliate-js** (commit fijado) dentro de `react-native-webview`; en web, directo | EPUB, CFI, resaltados SVG, paginación; lo usa Readest en producción | Readium nativo (difícil de unir a nuestro TTS) |
| Vista original PDF | `react-native-pdf` (nativo) / pdf.js (web), sincronizada por página | Fidelidad para PDFs con maquetación | — |
| Audio | **Pregenerado en el servidor por capítulo** (AAC mono 48 kbps) + JSON de tiempos | Pantalla bloqueada estable, 5x, sin cortes al final de página | TTS en el teléfono (no pausa en Android, no llega a 5x) |
| Reproductor | **`<audio>` HTML5 + Media Session API** (decisión de Anderson 2026-11-10: nada instalado, servicio web en Docker como Oh Churus) | Safari iOS y Chrome Android siguen sonando con la pantalla bloqueada y muestran controles; `playbackRate` sin el tope de 2x de expo-audio | App nativa con react-native-track-player (queda como plan B si la prueba P1 falla) |
| App | Expo SDK 55 **export web** servido por Docker, igual que Oh Churus; se abre en Safari (iPhone), Chrome (Android) y el PC | Sin tiendas, sin firmas, sin renovar; una sola URL por Tailscale | App nativa instalada (descartada por Anderson) |
| BD | PostgreSQL 14 (contenedor propio del stack) | Igual que Oh Churus; búsqueda de texto con `tsvector` en español | — |
| Archivos | Disco del servidor montado como volumen (§11) | Requisito R12 | Guardar binarios en la BD |
| IA | Open Library → Google Books → Claude (`claude-haiku-5-5` por defecto, `claude-opus-5-5` para casos difíciles) con salida estructurada y búsqueda web | Datos con fuente; IA solo para huecos | Solo IA (inventa datos) |

---

## 4. Arquitectura

```
 iPhone (Anderson)      Android (Samy)        Navegador (PC)
   app nativa             app nativa            web export
        \                    |                    /
         \---- Tailscale (casa.tail60fcb5.ts.net) ----/
                             |
                     gateway-service  (:7011 público tailnet)
                    /        |          \
     auth (D1)    biblioteca-service     taller-service (Python, GPU)
                  Spring Boot             FastAPI
                  - libros, estados       - conversión → EPUB normalizado
                  - estanterías, orden    - portada, metadatos embebidos
                  - progreso, notas       - TTS por frase → capítulo AAC
                  - comentarios           - tiempos frase/palabra
                  - bibliotecario IA      - OCR (ocrmypdf) [después]
                  - cola de trabajos ───► consume trabajos (tabla bah_lib_trabajo, polling)
                         |                     |
                    PostgreSQL           Volumen de archivos (disco E: del servidor)
                    biblioteca_db        originales / normalizados / audio / portadas
```

- **Cola de trabajos en PostgreSQL** (`SELECT … FOR UPDATE SKIP LOCKED`): sin RabbitMQ/Kafka; suficiente para 2 usuarios.
- **Archivos** se sirven por el gateway con soporte de `Range` (el reproductor descarga/salta dentro del audio).
- **Seguridad**: mismo JWT HMAC256 que Oh Churus; ningún endpoint recibe `userId` en el cuerpo (regla heredada,
  con su prueba de arquitectura `LaIdentidadNoVuelveAlCuerpo`). Archivos servidos con URL firmada de corta duración
  (el reproductor nativo no siempre manda cabeceras).

### 4.1 Puertos propuestos (no chocan con Oh Churus)
| Servicio | Interno | Expuesto |
|---|---|---|
| discovery-service | 8860 | 127.0.0.1 |
| gateway-service | 8920 | tailnet `:7011` |
| auth-service (si D1 = B) | 8921 | 127.0.0.1 |
| biblioteca-service | 8925 | 127.0.0.1 |
| taller-service (Python) | 8926 | 127.0.0.1 |
| postgres | 5433 | 127.0.0.1 |
| frontend web | 3100 | tailnet `:7010` |

### 4.2 Estructura del repo
```
LaBibliotecaAH/
├─ backend/
│  ├─ pom.xml                     (padre, como Oh Churus)
│  ├─ discovery-service/  gateway-service/  [auth-service/]
│  └─ biblioteca-service/
├─ taller/                        (Python 3.12, FastAPI, uv)
│  ├─ conversion/  voz/  alineacion/  ocr/
│  └─ tests/
├─ frontend/                      (Expo SDK 55, TypeScript)
│  ├─ src/components/{atoms,molecules,organisms,estanteria,lector}
│  ├─ src/screens/{biblioteca,libro,lector,reproductor,notas,ajustes,admin,auth}
│  ├─ src/lector-web/             (bundle foliate-js + puente postMessage)
│  └─ assets/{texturas,sonidos,fuentes}
├─ documentación/  (plan-maestro, invariantes, decisiones, api/)
├─ seguimiento/bitacora.md
├─ docker-compose.yml  .github/workflows/  sonar-project.properties
```

---

## 5. Ingesta y conversión de documentos

### 5.1 Formas de entrar un libro
1. **Subir desde la app** (selector de archivos iOS/Android/web, varios a la vez).
2. **Buzón en el servidor**: carpeta `E:\LaBibliotecaAH\buzon\` — se sueltan EPUB/PDF/etc. y el taller los importa solos
   (ideal para la colección EPUB que ya tienes). Se puede indicar el dueño con subcarpeta: `buzon\anderson\`, `buzon\samy\`.
3. **Libro deseado sin archivo**: se crea solo con título/autor/ISBN (lista de deseos); cuando llegue el archivo se vincula.
4. Después: compartir desde otras apps, URL de página web, foto con OCR.

### 5.2 Deduplicación
SHA-256 del original; si ya existe, se ofrece "ya lo tienes" en vez de duplicar (un libro puede estar en la biblioteca
de ambos usuarios sin duplicar el archivo).

### 5.3 Conversión por formato (taller-service)
| Entrada | Herramienta | Notas |
|---|---|---|
| EPUB | ebooklib + lxml | Se conserva XHTML, CSS mínimo, TOC (nav/ncx), portada, metadatos OPF |
| PDF con texto | PyMuPDF | `get_toc()` → capítulos; bloques de texto ordenados por columnas; quita cabeceras/pies repetidos y números de página; portada = render de pág. 1 |
| PDF escaneado | ocrmypdf + Tesseract `spa` | Fase posterior (Ola 7) |
| DOCX | pandoc → HTML | Títulos (Heading 1/2) → capítulos |
| DOC (antiguo) | LibreOffice headless → DOCX → pandoc | |
| TXT | heurística de capítulos ("Capítulo X", "CAPÍTULO", numeración romana, líneas en mayúsculas) | Detección de codificación (UTF-8/Latin-1) |
| MD / HTML (v1.6) | pandoc `gfm` / lxml → lista blanca → HTML | Tareas, tablas, citas, código sin leer en voz |
| RTF / ODT (v1.6) | LibreOffice headless → DOCX → pandoc | |
| PPTX (v1.6) | lxml sobre el ZIP | Un capítulo por diapositiva, notas del orador sin voz |
| JSON / YAML / LOG (v1.6) | línea a línea, monoespaciado | |
| XLSX / XLS / ODS / CSV (v1.6) | openpyxl / xlrd / lxml / csv → `hoja.json` | NO van a EPUB: visor de hojas (contratos §11) |
| Respaldo | Calibre `ebook-convert` | Para lo raro (MOBI, AZW3, FB2, RTF) |

### 5.4 Normalizador de texto (antes de segmentar)
- Ligaduras (ﬁ ﬂ ﬀ) → letras; guiones de corte de línea ("con-\ntinuar") → palabra unida; espacios duros; comillas.
- Abreviaturas españolas (Sr., Dra., pág., etc., núm.) para no partir frases ni leerlas mal.
- Números romanos en títulos de capítulo, fechas y cifras → forma hablada (solo en la capa de voz, el texto visual no cambia).
- Notas al pie: se separan y no se leen en voz (configurable).

### 5.5 Segmentación
- Frases con segmentador español (pySBD o spaCy `es_core_news_sm`), cada una envuelta en `<span id="cNN-sNNNN">`.
- Salida: `normalizado.epub` + `estructura.json` (capítulos, nº de frases, nº de palabras, minutos estimados).
- La **versión de normalización** se guarda (`version_texto`); si un día se reprocesa el libro, las notas se re-anclan (§7.3).

---

## 6. Voces (TTS) y audio

### 6.1 Motores (todos detrás de una interfaz `MotorDeVoz` en el taller)
| Motor | Voces en español | Calidad | Coste | Tiempos | Rol |
|---|---|---|---|---|---|
| **edge-tts** (Microsoft, endpoint de "Leer en voz alta") | Álvaro, Elvira (es-ES), Gonzalo/Salomé (es-CO), Jorge/Dalia (es-MX), Tomás/Elena (es-AR)… | Muy alta | Gratis (zona gris: endpoint no oficial, puede romperse) | Palabra | **Por defecto inicial** |
| **Azure Speech F0** | Las mismas + multilingües (Tristán, Ximena, Arabella, Isidora) | Muy alta | 500.000 caracteres/mes gratis (~1 libro/mes) | Palabra + frase | Oficial, para voces HD |
| **Piper** (local, CPU) | es_ES davefx, carlfm, sharvard; es_MX ald | Media-buena | Gratis, sin internet | Fonema | Respaldo sin conexión |
| **Kokoro-82M** (local) | ef_dora, em_alex, em_santa | Buena | Gratis, Apache 2.0 | — (se alinea) | Alternativa local |
| **Chatterbox Multilingual** / **Qwen3-TTS** (local, GPU RTX 5050) | es-ES, es-MX; clonación de voz propia | Muy alta | Gratis (MIT / Apache) | — (alineación forzada) | Experimento: "la voz de Anderson" leyendo |
| **Amazon Polly** (opcional) | Sergio, Raúl, Lucía (es-ES), **Carlos (es-US)** | Alta | ~30 USD/millón caracteres generativo | Solo neural | Si quieres el Carlos exacto |

Lista completa de voces se genera en vivo (`edge-tts --list-voices`) y se muestra en la app con **muestra de audio
de 10 s** por voz, agrupadas por país (como la pantalla "Select voice" de la referencia, pero con bandera y botón ▶).

### 6.2 Pipeline de generación
1. Al terminar la conversión, el taller encola el **capítulo actual y los 2 siguientes** con la voz preferida del usuario
   (generación perezosa: no se sintetiza el libro entero salvo que se pida "Descargar libro completo").
2. Se sintetiza **frase por frase** (como la referencia premium) → tiempos de frase exactos sin alinear.
3. Tiempos de palabra: WordBoundary (edge/Azure) o alineación forzada (motores locales).
4. Concatenación → `capitulo-03.m4a` (AAC mono 48 kbps ≈ 22 MB/hora) + `capitulo-03.tiempos.json`:
   `{"frases":[{"id":"c03-s0123","t0":12.40,"t1":15.85,"palabras":[[0,5,12.40,12.71],…]}]}`.
5. Caché en disco por `hash(texto_frase + voz + versión_motor)` → cambiar de voz solo regenera lo necesario;
   compartida entre usuarios.

### 6.3 Velocidad de 0.5x a 5x
- iOS AVPlayer y Android ExoPlayer cambian velocidad con corrección de tono, pero por encima de ~2.5x la calidad cae.
- Solución: el servidor genera también una **variante 2x** (`atempo=2.0` o `rate=+100%` del motor). El cliente usa
  la variante 1x para 0.5-2.5x y la variante 2x (a 1-2.5x) para 2.5-5x. Los tiempos se escalan por el factor.
- Por encima de 2.5x se resalta solo la frase (12 palabras/s no se pueden seguir con la vista).
- Pasos en la app: 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5 + deslizador fino de 0.05.

### 6.4 Pantalla bloqueada y segundo plano (en el navegador)
- **Un solo elemento `<audio>` reutilizado** para todo el libro (iOS solo deja seguir sonando en segundo plano al elemento
  que el usuario activó con un toque). Al terminar un capítulo se cambia su `src` al siguiente en el evento `ended`.
  Plan B si iOS corta en ese cambio: el servidor entrega un **"tramo continuo"** (capítulo actual + 2 siguientes en un
  solo archivo) para que no haya cambios de pista con la pantalla bloqueada.
- **Prueba P1 (primera tarea de la Ola 0, en el iPhone de Anderson y el Android de Samy)**: página mínima en casa por
  Tailscale que reproduce 2 capítulos seguidos a 1x, 2.5x y 5x con la pantalla bloqueada, con botones en la pantalla
  de bloqueo. Si falla en el iPhone, se discute el plan B nativo antes de seguir.
- Recomendación de uso en iPhone: abrir en **una pestaña de Safari**, no "Añadir a pantalla de inicio" (las PWA
  instaladas tienen bugs abiertos de audio en iOS 26).
- Now Playing con portada del libro, título del capítulo, autor; botones ⏮ capítulo / ⏪ 15 s o frase / ⏯ / ⏩ / ⏭.
- AirPods/auriculares: doble toque = siguiente frase; triple = anterior (configurable).
- **Temporizador de apagado**: 5/10/15/30/45/60 min, "al final del capítulo", con fundido de 10 s; agitar el teléfono
  lo prolonga (Android/iOS acelerómetro).
- El progreso se guarda en el teléfono cada 5 s y en el servidor cada 15 s y al pausar (también con pantalla bloqueada,
  vía evento `PlaybackProgressUpdated` del servicio de fondo).
- Interrupciones (llamada, Waze) → pausa y reanuda; al reanudar después de > 5 min, retrocede 1 frase para dar contexto.

---

## 7. Lector visual

### 7.1 Experiencia
- Modos: **paginado** (con gesto de pasar página) y **desplazamiento continuo**.
- Tipografías de libro (Literata, EB Garamond, Lora; + OpenDyslexic), tamaño, interlineado, márgenes, justificado.
- Temas de papel: **Marfil** (día), **Pergamino/sepia**, **Noche de biblioteca** (fondo roble muy oscuro, texto crema).
- Barra de progreso: % del libro, página X de Y, "quedan 2 h 14 min a 1.5x" en el capítulo y en el libro.
- **Saltar**: índice multinivel, deslizador de páginas con vista previa del capítulo, ir a página/%, buscar texto.
- **Leer desde aquí**: tocar una frase y elegir "▶ escuchar desde aquí".
- **Seguir la voz**: la frase actual se resalta en ámbar suave y la palabra en dorado; la página avanza sola.
  Si el usuario se desplaza a otro lado, aparece "↩ volver a la voz".
- **Volver a mi posición anterior** tras un salto (como la referencia).
- PDF: botón para cambiar a **vista original** (página tal cual), sincronizada por página.

### 7.2 Marcar texto
Seleccionar texto → menú: **Resaltar** (5 colores: ámbar, verde salvia, azul tinta, rosa viejo, lavanda),
**Nota**, **Copiar**, **Buscar en el libro**, **Escuchar desde aquí**, **Preguntar al bibliotecario** (IA, después).
Marcador de página con cinta de tela (efecto visual) en la esquina.

### 7.3 Anclas robustas (las notas reaparecen al releer, R9)
Cada anotación guarda tres anclas:
1. CFI de EPUB (preciso para el lector);
2. `{version_texto, frase_inicio, offset_inicio, frase_fin, offset_fin}` (nuestro);
3. **Cita textual** + 32 caracteres antes y después (selector W3C).
Si el libro se reprocesa, se re-anclan con (2) y, si falla, con (3) por búsqueda difusa; las que no se pueden
re-anclar quedan en "notas huérfanas" visibles, nunca se pierden.

### 7.4 Retomar exactamente donde lo dejé (R4)
`bah_lib_progreso (usuario, libro)`: capítulo, frase, CFI, posición de audio, velocidad, voz, % y fecha.
Al abrir un libro **siempre se consulta el servidor** primero (la caché local es solo para leer sin conexión);
gana la marca de tiempo más reciente. Si otro dispositivo avanzó más: "Seguiste en el PC hasta el cap. 7 — ¿ir allí?".

---

## 8. Mi Biblioteca (prioridad #1)

### 8.1 Modelo de datos (biblioteca-service, prefijo `bah_lib_`)
| Tabla | Campos principales |
|---|---|
| `obra` | id, titulo, subtitulo, autores (→ `autor`), isbn10/13, idioma, editorial, anio_publicacion, paginas, sinopsis, generos[], serie, numero_en_serie, portada_ruta, fuente_metadatos (EPUB/OPEN_LIBRARY/GOOGLE/IA/MANUAL), confianza, `tsv` (búsqueda) |
| `autor` | id, nombre, nombre_orden ("Márquez, Gabriel García"), biografia, nacimiento, muerte, nacionalidad, foto_ruta |
| `archivo` | id, obra_id, sha256, formato_original, ruta_original, ruta_normalizada, version_texto, estado_conversion, n_capitulos, n_palabras, minutos_estimados |
| `ejemplar` (libro en la biblioteca de un usuario) | id, usuario_id, obra_id, tipo (LIBRO / DOCUMENTO / DESEO), **estado** (POR_LEER / LEYENDO / LEIDO / ABANDONADO / RELEYENDO), favorito, calificacion (½ a 5 ★), **fecha_llegada**, fecha_inicio, fecha_fin, veces_leido, titulo_personal, etiquetas[], visible_hogar |
| `estante` | id, usuario_id, nombre, tipo (FAVORITOS / COLECCION / SISTEMA), color_madera, orden |
| `estante_item` | estante_id, ejemplar_id, **orden** (fraccional, para reordenar sin reescribir todo) |
| `progreso` | §7.4 |
| `anotacion` | id, ejemplar_id, tipo (RESALTADO / NOTA / MARCADOR), color, anclas (§7.3), texto_citado, nota, creado, editado |
| `comentario` | id, ejemplar_id, texto, creado (diario de lectura: "lo empecé en el bus…") |
| `sesion_lectura` | usuario, ejemplar, inicio, fin, modo (VISTA/VOZ), frases_leidas → estadísticas |
| `trabajo` | id, tipo (CONVERTIR / VOZ_CAPITULO / ENRIQUECER / PORTADA), payload, estado, intentos, error, fechas |
| `voz_preferida` | usuario, voz, velocidad, motor |

- **Documentos personales** (R11): `tipo = DOCUMENTO`, sin autor obligatorio, sin búsqueda de metadatos,
  estante propio "Mis documentos" (un archivador, no un estante de libros).
  (contratos v1.6) Con **carpetas y subcarpetas** propias de cada usuario (`carpeta`: id, usuario_id, padre_id, nombre;
  `ejemplar.carpeta_id`), subir directo a una carpeta, mover varios, buscar dentro y borrar eligiendo qué pasa con lo de
  dentro. Formatos: además de los de libros, MD, HTML, RTF, ODT, PPTX y JSON/YAML/LOG (al lector) y XLSX, XLS, ODS y CSV
  (al **visor de hojas**, con `hoja.json`).
- **Lista de deseos** (R8): `tipo = DESEO` (sin archivo). Muestra dónde conseguirlo (enlace a búsqueda de la
  editorial/biblioteca) y "ya lo tengo" lo convierte en libro.
- **Hogar**: un libro puede marcarse `visible_hogar` para que Samy lo vea en "Biblioteca compartida"
  (cada uno con su propio progreso, notas y estado). Se reutiliza el concepto Household de Oh Churus.

### 8.2 Filtros y orden (R2, R18)
- **Pestañas rápidas**: Leyendo · Por leer · Leídos · Favoritos · Deseos · Documentos · Todo.
- **Filtros combinables** (chips): autor, género, año (rango), idioma, formato, duración, calificación, etiqueta,
  serie, "con notas", "con audio listo", compartido.
- **Orden**: **Recientes (fecha de llegada)** ↓↑, último abierto, título, autor, año, progreso, calificación,
  orden manual (estante).
- **Búsqueda** de texto completo en español (título, autor, sinopsis, etiquetas, notas) con `tsvector`.
- Filtros guardados como "estantes inteligentes" (ej. "Novelas por leer llegadas este año").

### 8.3 Ficha del libro
Portada grande con relieve, título, autor (toca → ficha del autor con biografía y sus otros libros), año, editorial,
páginas, duración estimada por voz, sinopsis, géneros, estado (selector), estrellas, favorito ♥, progreso,
pestañas: **Notas y resaltados** · **Comentarios** · **Historial de lectura** · **Datos** (editar a mano,
"pedir al bibliotecario que complete").

### 8.4 Favoritos ordenados por arrastre (R6)
`react-native-sortables` sobre el estante de favoritos: mantener pulsado → el libro se levanta (sombra + leve escala +
háptico) → arrastrar entre los demás → soltar con sonido de madera. El orden se guarda con índices fraccionales.

---

## 9. El bibliotecario IA (R5)

Trabajo `ENRIQUECER` al importar (y botón manual):
1. Datos embebidos (OPF del EPUB, metadatos del PDF/DOCX, ISBN encontrado en las primeras páginas).
2. **Open Library** (ISBN / título+autor) → portada (`covers.openlibrary.org`), año, editorial, autor.
3. **Google Books** → sinopsis, categorías, páginas.
4. **Claude** solo para los huecos, con **salida estructurada** (esquema JSON) y **búsqueda web** con citas;
   modelo `claude-haiku-5-5` (barato) y escalado a `claude-opus-5-5` si la confianza es baja. Le damos las
   primeras ~3 páginas del libro para identificarlo aunque el archivo se llame "libro (3) final.pdf".
5. Portada: si no hay, se busca; si tampoco hay, se **genera una portada tipográfica** con el título sobre cuero/tela
   (estilo libro antiguo) — nunca un rectángulo vacío.
6. Cada dato guarda su fuente y confianza; la ficha muestra "dato sugerido por IA — ✓ aceptar / ✎ corregir".
Coste estimado con Haiku: < 0,01 USD por libro. Clave en `.env` (`ANTHROPIC_API_KEY`), nunca en el repo.

---

## 10. Diseño: biblioteca personal de lujo (R7, R10, R19)

### 10.1 Paleta (se medirá contraste WCAG como en Oh Churus)
| Token | Color | Uso |
|---|---|---|
| `roble-oscuro` | `#2B1A10` | fondo modo noche, estantes |
| `nogal` | `#4A2E1C` | superficies, tarjetas |
| `roble` | `#8B5A2B` | estantes, bordes |
| `cedro` | `#B5653A` | acento principal (cedro rojizo) |
| `miel` | `#D9A35B` | resaltado de frase, botones |
| `laton` | `#C9A227` | detalles metálicos, palabra actual, iconos activos |
| `pergamino` | `#F3E9D2` | papel, texto sobre oscuro |
| `marfil` | `#FBF7EE` | papel modo día |
| `cuero-verde` | `#2F4A3A` | lámpara de biblioteca, éxito |
| `burdeos` | `#6B1F2A` | favoritos, peligro |

Tipografía: títulos en **Cormorant Garamond** / **Playfair Display**, interfaz en **Inter**, lectura en **Literata**.

### 10.2 Pantalla principal: la estantería
- Fondo con **textura de madera de roble** (Skia, veta procedural + imagen tileable), estantes con sombra proyectada
  y una **luz cálida de lámpara** en la parte superior (gradiente radial que se mueve levemente con el giroscopio).
- Los libros se ven **de lomo** (altura y grosor según páginas reales; color del lomo extraído de la portada;
  título vertical en dorado) o **de portada** (cambio con un gesto de pellizco).
- Estantes: "Leyendo ahora" (arriba, libros inclinados de frente), "Recién llegados", "Favoritos", colecciones.
- Fichero a la derecha (como cajones de catálogo) para los filtros.

### 10.3 Sacar un libro (efecto libro físico)
1. Mantener pulsado un lomo → el libro **se desliza hacia fuera** del estante (traslación Z simulada + sombra creciente + sonido de roce de madera).
2. Arrastrar hacia arriba → el libro **gira 90°** mostrando la portada (perspectiva 3D con Reanimated `rotateY`).
3. Soltar en el centro → **se abre** la tapa (bisagra izquierda, `rotateY` de 0 a -160° con luz que cambia sobre la tapa)
   y entra la ficha / el lector con transición compartida.
4. Volver → el libro se cierra y regresa a su hueco.
Tecnología: Reanimated 4 + Gesture Handler + Skia (sombras, texturas). Nada de motores 3D pesados.

### 10.4 Efectos rudimentarios y realistas (con interruptor y volumen propios)
- Sonidos: pasar página, roce de libro en estante, apertura de tapa, golpe suave de madera al soltar, cinta del marcador.
- Hápticos cortos en cada interacción física.
- Pasar página con curvatura (sombreador Skia sobre captura de la página) — opcional; deslizar por defecto.
- Ambiente opcional mientras se lee: chimenea, lluvia en la ventana, reloj de pie (en bucle, mezcla con la voz al 15%).
- Polvo de luz flotando en el haz de la lámpara (partículas muy sutiles; se desactiva con "Reducir movimiento").

### 10.5 Accesibilidad
Contraste medido, VoiceOver/TalkBack con nombres en todo lo interactivo (pruebas heredadas `NadaInteractivoSinNombre`,
`ElContrasteSeMide`), respeta "Reducir movimiento" y tamaño de texto del sistema (lo que la ONCE criticó de la referencia).

---

## 11. Almacenamiento en el servidor de casa (R12)

Hallazgo: casa tiene C: NVMe 1 TB (441 GB libres) y **D: y E: son discos USB externos** (D: WD Elements "Respaldo",
626 GB libres; E: ADATA HD330, 536 GB libres).

Propuesta (decisión D4):
- **Archivos de la biblioteca en `E:\LaBibliotecaAH\`**: `originales/`, `normalizados/`, `audio/`, `portadas/`, `buzon/`.
- **PostgreSQL en C:** (volumen Docker en el NVMe: rápido y siempre presente).
- **Respaldo nocturno** de BD + originales + notas a `D:\respaldos\biblioteca\` (el audio NO se respalda: se puede regenerar).
- Si E: no está conectado, la app **sigue funcionando** para progreso, notas y biblioteca; muestra "archivos no disponibles"
  y el taller deja los trabajos en espera (regla: un fallo de lo nuevo no detiene lo principal, con log).
- Tamaños: 1.000 EPUB ≈ 1-3 GB; audio ≈ 22 MB/hora por voz → un libro de 10 h ≈ 220 MB (+110 MB variante 2x).
  Con generación perezosa, 100 libros escuchados ≈ 33 GB. Política LRU: audio no escuchado en 90 días se borra.

---

## 12. Celulares: iPhone (Anderson) y Android (Samy)

**Decisión D2 (Anderson, 2026-11-10): nada instalado.** La biblioteca es un servicio web en Docker en casa, como Oh Churus,
y se usa desde el navegador de cada dispositivo por Tailscale (`https://casa.tail60fcb5.ts.net:7010`).
- **iPhone**: Safari (pestaña normal). Media Session API para la pantalla de bloqueo; prueba P1 obligatoria (§6.4).
- **Android**: Chrome. Media Session con notificación de reproducción; también se puede "Instalar app" (PWA), que en Android sí funciona bien.
- **PC**: cualquier navegador.
- Diseño responsive: el mismo código ofrece estantería táctil en el celular y una vista amplia (estantería + lector lado a lado) en el PC.
- Sin conexión (después, Ola 7): caché del navegador para el capítulo actual y los 2 siguientes; el progreso se sube
  al volver la conexión. Mientras tanto, se necesita Tailscale activo.
- Plan B documentado (si P1 falla): envolver la misma web en una app nativa con track-player.

---

## 13. Olas de desarrollo (cada ola termina usable, probada y registrada en la bitácora)

### Ola 0 — Cimientos (1 sesión)
- `git init`, estructura §4.2, `.gitignore`, README, bitácora, invariantes.
- Copiar y adaptar de Oh Churus: pom padre, discovery, gateway, (auth según D1), seguridad JWT, `ResultDTO`,
  `GlobalExceptionHandler`, `SecurityUtils`, pruebas de arquitectura, JaCoCo, Karate.
- Frontend: copiar `api.ts`, contextos (Auth, Theme, Toast), átomos, organismos, hooks, utils, test-utils;
  nuevo tema madera; `app.json` con `com.andersonh.biblioteca`; dev build Android.
- docker-compose del nuevo stack (puertos §4.1), `init-databases.sql`.
- **Hecho cuando**: login con la cuenta de Anderson en web y en Android; CI verde.

### Ola 1 — Ingesta y biblioteca básica
- biblioteca-service: obra, autor, archivo, ejemplar, estante, trabajo; endpoints `/v1/libros/{subir, all, get, estado, favorito, eliminar}`.
- taller: conversión EPUB/PDF/DOCX/DOC/TXT → EPUB normalizado + portada + metadatos embebidos; buzón en E:.
- App: lista/rejilla de portadas, pestañas Leyendo/Por leer/Leídos/Favoritos/Deseos/Documentos, orden por recientes,
  búsqueda, ficha del libro, subir archivos, documentos personales.
- Importar tu colección EPUB existente por el buzón.
- **Hecho cuando**: 50 libros reales importados con portada y capítulos correctos.

### Ola 2 — Lector visual y progreso en servidor
- foliate-js en WebView, temas de papel, tipografías, índice, saltos, buscar, progreso.
- Progreso en servidor (§7.4) + prueba "borrar app → reinstalar → abre donde estaba".
- Vista original de PDF.

### Ola 3 — La voz
- taller: motores edge-tts + Piper (+ Azure si hay clave), síntesis por frase, tiempos, AAC por capítulo, variante 2x, caché.
- App: track-player, mini-reproductor y reproductor completo, lock screen, 0.5-5x, saltos por frase/15 s/capítulo,
  temporizador, selector de voces con muestras, resaltado sincronizado en el lector.
- **Hecho cuando**: 1 h de libro escuchado con iPhone bloqueado y en Android, retoma en el otro dispositivo.

### Ola 4 — Notas, resaltados, comentarios
- Anotaciones con 3 anclas, colores, lista de notas por libro y global, exportar notas a Markdown/PDF,
  comentarios/diario, marcadores.
- Prueba: reprocesar un libro y verificar que todas las notas se re-anclan.

### Ola 5 — La biblioteca de lujo
- Estantería Skia con texturas, lomos, luz; sacar/abrir libro; arrastrar favoritos; estantes y colecciones;
  filtros avanzados y estantes inteligentes; ficha de autor; estadísticas de lectura.

### Ola 6 — El bibliotecario IA
- Enriquecimiento OL → Google Books → Claude; portadas; autores; revisión "aceptar/corregir"; enriquecer en lote.

### Ola 7 — Inmersión y extras
- Sonidos, ambiente, pasar página con curvatura, hápticos; OCR de PDFs escaneados; leer páginas web;
  compartir desde otras apps; descargas sin conexión; voces locales GPU (Chatterbox/Qwen3) y "mi propia voz".

### Ola 8 — Producción en casa
- Imágenes Docker, despliegue en casa (mismo procedimiento que Oh Churus: build aquí, `docker save` → `scp` → `load`),
  URLs `:7010/:7011`, respaldo nocturno, humo de solo lectura, APK para Samy, app para iPhone.

> Orden de prioridad acordado: la biblioteca es lo primero (Olas 1 y 5), pero la Ola 5 depende de tener libros
> reales (Ola 1) y el lector (Ola 2) para que "abrir un libro" lleve a algún sitio.

---

## 14. Calidad y pruebas (heredado de Oh Churus)
- Backend: JUnit 5 + Mockito + `@WebMvcTest`, Testcontainers PostgreSQL, Karate por gateway, JaCoCo ≥ 90% ramas.
- Taller (Python): pytest con un **corpus de prueba** (EPUB con TOC anidado, PDF a dos columnas, PDF con
  cabeceras repetidas, DOCX con títulos, DOC antiguo, TXT Latin-1) y verificación de frases/capítulos/ligaduras.
- Frontend: Jest + Testing Library (patrón de mocks heredado), pruebas transversales de contraste y accesibilidad.
- Pruebas de arquitectura heredadas + nuevas: "ningún archivo se sirve sin dueño", "las notas nunca se borran al reprocesar".
- Sonar (proyecto nuevo `andersonhg19_la-biblioteca-ah`).

## 15. Futuro: la Videoteca / Mis cursos (R22)
Mismo modelo "obra → ejemplar → progreso → anotaciones", con nuevos tipos: `VIDEO` (YouTube por URL, reproductor
embebido, progreso por segundo, notas con marca de tiempo), `CURSO` (secuencia ordenada de videos, textos y documentos,
con avance por lección). Se diseña el modelo de datos de la Ola 1 pensando en esto (tipo de obra extensible),
sin construir nada todavía.

## 16. Riesgos
| Riesgo | Mitigación |
|---|---|
| edge-tts deja de funcionar (endpoint no oficial) | Interfaz de motores; Azure F0 y Piper como respaldo; caché de audio ya generado |
| iPhone sin cuenta de Apple Developer | D2; mientras tanto, web en el iPhone sin pantalla bloqueada |
| Disco USB E: desconectado | Degradación controlada (§11), respaldo en D: |
| PDFs con maquetación compleja leen en desorden | Modo lectura inteligente + vista original + opción "reconvertir con Calibre" |
| foliate-js "no estable" | Commit fijado y vendorizado en `lector-web/` |
| Consumo de GPU/CPU del servidor al generar audio | Cola con 1 trabajador de voz, prioridad al capítulo que se está escuchando, horario nocturno para "libro completo" |
| Oh Churus en producción | Ningún cambio en Oh Churus sin autorización explícita (ver D1) |
| Traducción automática (v1.3) con calidad irregular en literatura o traductor caído | Servicio propio `traductor` (v1.3.1: Opus-MT + CTranslate2 int8, medido mejor que LibreTranslate en novela: 1 error grave frente a 7 en 15 frases) con la API de LibreTranslate detrás de `TraductorClient`: cambiar de motor es cambiar una imagen. Modelos dentro de la imagen (sin descargas al arrancar). Caído = 503 solo en traducción; capítulos cacheados por archivo; freno por usuario |

## 17. Decisiones
Resueltas por Anderson el 2026-11-10:
- **D1 Identidad → copia propia** del módulo administrativo (auth, roles, módulos, auditoría) en el repo nuevo; Oh Churus no se toca.
  Cuentas sembradas: anderson y samy.
- **D2 Distribución → web en Docker**, sin instalar nada (§12).
- **D4 Disco → E:\LaBibliotecaAH** para archivos; respaldos en D:\respaldos\biblioteca; BD en C: (NVMe).

- **D3 Voz → Álvaro (`es-ES-AlvaroNeural`) por defecto**, vía edge-tts. Anderson escuchó la Sala de voces
  (https://claude.ai/artifact/5VKMmyYxa1uRWzcqjskLni): le gustan todas y su favorita es Álvaro. Las otras 8 voces
  de la sala (Elvira, Ximena, Carlos, Gonzalo, Salomé, Jorge, Alonso, Tomás) quedan disponibles para elegir por libro.

Abiertas:
- **D5 Colección existente**: la búsqueda en C:, D: y E: de casa no encontró EPUB (solo 2 de trabajo). ¿Dónde están?
- Prueba opcional para identificar a "Carlos": en el iPhone, Ajustes → Accesibilidad → Contenido leído → Voces → Español
  — si aparece "Carlos", indica el país que muestra.
