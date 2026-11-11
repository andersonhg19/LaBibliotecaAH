# QA de conversión, voz e integridad de datos — La Biblioteca AH

> Rol: QA `datos` · Fecha: 2026-11-11 · Instancia: QA en casa (`biblioteca-ah-qa`, gateway 127.0.0.1:9920, datos `E:\LaBibliotecaAH-qa\datos`).
> Código probado: la imagen `bah/taller:qa` tiene el mismo código que `taller/app` del repo (md5 de los 35 `.py` idénticos).
> Cuentas propias: `qa-datos@biblioteca.ah` (userId 11) y `qa-datos2@biblioteca.ah` (userId 24). Solo se usaron y borraron ejemplares propios.
> Material de trabajo (en casa): `C:\srv\biblioteca-ah-qa\qa\datos\` — generadores (`gen_corpus.py`, `gen2.py`, `gen3.py`, `gen4.py`),
> corpus (`corpus*/`), subidas y resultados (`subidas*.json`, `voz*.json`, `carrera.json`, `audio/`), analizadores (`analizar.py`, `anal_audio.py`, `orden.py`, `ver.py`).
> Todo el corpus se generó por programa dentro de `bah/taller:qa` (PyMuPDF, pandoc, LibreOffice, zipfile); nada descargado de internet.

## 1. Resumen

Se subieron **57 archivos de prueba** (13 EPUB, 17 PDF, 5 Word, 22 TXT) por la API real, se pidió audio en las **9 voces** y en casos límite,
y se forzaron carreras, borrados en mitad de un trabajo y **un reinicio del taller** (09:15:30, con una conversión y una voz en curso).

Lo que funciona bien es mucho: ids de frase siempre únicos y consecutivos, `frases/cap-NNN.json` idéntico carácter a carácter al texto de
los `<span class="bah-f">` del XHTML, `estructura.json` coherente (sumas, `minutosEstimados = ceil(palabras/150)`), EPUB de salida válido,
tiempos de audio **exactos** (duración de `tiempos.json` = ffprobe al milisegundo, pausas 250/500/700 ms exactas, 2x = mitad ±17 ms),
dos columnas, guiones de corte, números de página y cabeceras fijas bien quitados, PDF con clave/escaneado/dañado con mensaje humano,
deduplicación por sha256 correcta y la edición MANUAL respetada.

Los problemas graves están en tres zonas:
1. **Robustez de la cola**: un reinicio del taller deja libro y capítulo atascados sin recuperación (DA-01); un capítulo con ERROR de voz
   se re-encola en cada consulta de estado y el usuario nunca ve el error (DA-02).
2. **Entradas reales que tumban la conversión entera** con un mensaje técnico tras 3 intentos inútiles: caracteres de control en TXT
   (DA-03), un NCX roto en un EPUB por lo demás bueno (DA-04), EPUB con DRM (DA-05).
3. **Calidad del texto en formatos frecuentes**: TXT con líneas cortadas a 70 columnas inventa "partes" y "capítulos" (DA-06); cabeceras
   de página con el nombre del capítulo se cuelan y se pegan al texto en PDF (DA-07); notas al pie leídas en voz en PDF, DOCX y EPUB
   no bien formado (DA-08, DA-09, DA-10).

**Conteo por severidad** (solo CONFIRMADOS, reproducidos 2 veces o más): bloqueante 0 · alta 6 · media 15 · baja 7 — total 28.
Además 2 PLAUSIBLES (no ejecutados a fondo por coste o por depender de otro factor), en §4.

## 2. Hallazgos CONFIRMADOS

Notación: `E:\…` = `E:\LaBibliotecaAH-qa\datos`. Ids de archivo/ejemplar completos en `subidas*.json`. "×2" = veces reproducido.

| ID | Sev. | Caso | Pasos | Esperado | Obtenido | Evidencia | Causa (archivo:línea) |
|---|---|---|---|---|---|---|---|
| DA-01 | **Alta** | Reinicio del taller con trabajos en curso | Subir `P11` (PDF 500 p.) y con la conversión EN_CURSO y la voz de `V01` cap. 2 EN_CURSO ejecutar `docker restart biblioteca-ah-qa-taller-1` (09:15:30) | Al arrancar, los trabajos interrumpidos vuelven a PENDIENTE y se terminan | Ambos quedan **EN_CURSO para siempre**: a las 09:16:32 y 09:21:17 el trabajo CONVERTIR sigue EN_CURSO (actualizado 09:15:19) y el archivo en PROCESANDO; el de voz EN_CURSO (actualizado 09:14:06) y `bah_lib_audio` en GENERANDO. `/audio/estado` devuelve `GENERANDO` y no re-encola. El log del arranque no devuelve ninguno ("atascados" no aparece). Solo se recuperarían en **otro** reinicio hecho ≥30 min después | ×3 observaciones (09:16, 09:21 y 09:32, +17 min); `reinicio.json`; `q6.sql`, `q8.sql` | `api/servidor.py:55-62` llama `reiniciar_atascados` solo al arrancar y `cola/repositorio.py:239-242` exige `actualizado < now()-30 min`; no hay barrido periódico. `TrabajoRepositoryImpl.java:32-38` cuenta GENERANDO como vivo y no re-encola |
| DA-02 | **Alta** | Error de voz: nunca se informa y se reintenta sin fin | Pedir audio de `E01` cap. 2 (solo "* * *"), de una voz inexistente y de `piper.*`, y seguir consultando `/audio/estado` como hace el reproductor | Tras el ERROR definitivo, `/audio/estado` devuelve `ERROR` con el mensaje y no re-encola sin una acción del usuario | `/audio/estado` **nunca** devuelve ERROR: ve la fila ERROR, encola un trabajo nuevo y responde `PENDIENTE`. `E01` cap. 2 acumuló 3 trabajos (9 intentos), la voz inexistente 2 trabajos (6 intentos, ~2 min de hilo de voz cada uno) y Piper (error "definitivo") también se re-encoló. Mientras, peticiones de otros usuarios (`ux-normal.epub`, `qa-lector-faro.epub`) esperan detrás | ×3 (vacío, voz inexistente, piper); `q4.sql`, `q5.sql` | `AudioServiceImpl.java:72-75` (`if (estado == null \|\| ERROR.equals(estado)) { encolar…; estado = PENDIENTE; }`) |
| DA-03 | **Alta** | TXT con caracteres de control | Subir `T11` (salto de página `\f` en mitad de línea), `T14` (tab vertical `\x0b`), `T15` (ESC `\x1b`) | Se limpian los caracteres de control (o se convierten en espacio/salto) y el libro queda LISTO | ERROR tras **3 intentos**: "No se pudo convertir el libro por un error interno del taller (se intentó 3 veces). Detalle técnico: ValueError: All strings must be XML compatible…". Re-subir `T11` repite lo mismo | T11 ×2, T14, T15; `q1.sql`, `q2.sql`, `q7.sql` | `conversion/normalizador.py:31-42` (`normalizar_visual` no quita C0 salvo los invisibles listados); el texto llega a lxml en `conversion/desde_txt.py:146-154`. El error no es `ErrorDefinitivo` → `cola/trabajador.py:151` reintenta |
| DA-04 | **Alta** | EPUB válido con un NCX roto | Subir `E07` (capítulo correcto, `toc.ncx` con bytes basura, sin nav) | El índice es opcional: se ignora el NCX y el libro queda LISTO con títulos del `<h1>` | ERROR tras 3 intentos: "…error interno… XMLSyntaxError: Document is empty". El libro entero se pierde por un archivo accesorio | ×2 (subida y re-subida); `q7.sql` | `conversion/desde_epub.py:334` (`etree.fromstring` del NCX sin `try`; el nav sí lo tiene en `:291-295`) |
| DA-05 | Media | EPUB con DRM (`META-INF/encryption.xml`) | Subir `E05` (capítulo cifrado) y `E05b` | Mensaje claro "El EPUB está protegido con DRM…" y ERROR directo (sin reintentos) | `E05`: "…error interno… (se intentó 3 veces)… ValueError: All strings must be XML compatible"; `E05b`: "El documento no contiene texto legible" | ×2 (E05 subida y re-subida) + E05b | `conversion/desde_epub.py:86-98` no mira `META-INF/encryption.xml`; falta un `Msj` para DRM en `dominio/mensajes.py` |
| DA-06 | **Alta** | TXT con líneas cortadas (estilo Gutenberg, 70 col.) | Subir `T08` y `T20`: párrafos partidos en líneas, algunas empiezan por "parte de…", "libro que…", "capítulo en…" | Solo "CAPÍTULO N" (línea aislada) es título | `T08`: **9 capítulos en vez de 3**, con títulos "parte de", "libro que le", "parte de la casa, decía la abuela con orgullo."; `T20`: un único párrafo se convierte en 4 títulos (`esTitulo=true`, pausa de 700 ms cada uno) y "CAPÍTULO 2" queda dentro de una "parte" falsa | ×2 (T08, T20); `analisis1.txt`; `ver.ps1 4dc365f3… 1` | `conversion/desde_txt.py:16-18` (`_CAPITULO`/`_PARTE` aceptan minúsculas y cualquier palabra como "número": `[A-Za-z…]+`) y `:62-65` (no exigen línea previa/siguiente en blanco) |
| DA-07 | **Alta** | PDF con cabecera corriente = nombre del capítulo | Subir `P10` (40 p., páginas pares "QA DATOS NOVELA", impares el nombre del capítulo, párrafos que cruzan página) | Se quitan las dos cabeceras | La del libro se quita; la del capítulo **no** (cada capítulo ocupa <35 % de las páginas) y además se **pega al texto**: `c000-s00100 'EL VIAJE AL NORTE verano recordaba historia río decía.'`; el párrafo que cruza la página queda cortado (`'Guardaba … corazón'` sin cierre). En los 10 capítulos | 10/10 capítulos; `orden.py` (22 anomalías); en el audio de `P10` cap. 9 se lee "EPÍLOGO DEL MAR" dos veces | `conversion/desde_pdf.py:189-216` (umbral global `n*0.35` y clave por texto completo) y `:306-315` (`_continua` une la línea siguiente en minúscula a la cabecera) |
| DA-08 | Media | Notas al pie en PDF | Subir `P01` (nota "¹" en el texto y "1 Nota al pie: …" al pie de la página) | Plan §5.4: las notas se separan y no se leen | La nota se lee en voz (4 capítulos) y parte el párrafo; si cae entre las dos mitades de una palabra cortada con guion la rompe: `'…tiempo escri- 1 Nota al pie: fuente citada…'` + `'bía mirada mujer…'` | 4/4 capítulos de P01; `ver.ps1 2e2ef453… 3` | `conversion/desde_pdf.py` no detecta notas (ni por tamaño de letra ni por posición) en `_parrafos`/`_unir_entre_paginas` (`:228-254`, `:322-330`) |
| DA-09 | Media | Notas al pie en DOCX/DOC | Subir `D01` (3 notas de pie de Word) y `D04` (.doc) | Las notas no se leen y quedan junto a su capítulo | Todas las notas del documento acaban al final del **último** capítulo, se **leen en voz** y llevan el glifo de vuelta: `'Texto de la nota al pie número 1, no debería leerse en voz.↩︎'` | D01 y D04 (×2); `ver.ps1 0b6935f0… 3` | `conversion/desde_docx.py:278-314` (la `<section class="footnotes">` de pandoc se trata como contenido normal) y `conversion/html_util.py:186-191` (solo reconoce `epub:type`, no `role="doc-endnotes"` ni `class="footnotes"`) |
| DA-10 | Media | Nota al pie EPUB en XHTML no bien formado | `E10`: dos documentos idénticos con `<aside epub:type="footnote">`, uno XML válido y otro con `&nbsp;` | En ambos la nota no se lee | En el bien formado la nota no se lee (correcto); en el que cae al parser HTML **sí se lee** (`c001-s00004 'Esta es la nota al pie que no se debe leer.'`). Igual en `E01` | ×2 (E10, E01) | `conversion/html_util.py:185-186`: con `lxml.html` el atributo llega como `"epub:type"` sin espacio de nombres y `k_local == "type"` nunca se cumple |
| DA-11 | Media | Capítulo sin texto hablable | Pedir audio de `E01` cap. 2 ("Interludio", solo `* * *`) | LISTO con audio vacío/silencio corto, o ERROR claro "no tiene texto para leer" sin reintentos | ERROR tras 3 intentos con "No se pudo preparar el archivo de audio del capítulo. Detalle técnico: ffmpeg: Output file #0 does not contain any stream" (y luego DA-02 lo re-encola) | ×2 (2 trabajos); `q4.sql` | `voz/capitulo.py:143-144` solo comprueba `if not frases`; con todas las `voz` vacías el PCM queda vacío y `voz/audio.py:350-381` falla como error reintentable |
| DA-12 | Media | Voz inexistente o con formato inválido | `/audio/estado` con `edge.es-ES-NoExisteNeural` y `edge.inventada` | Rechazo inmediato (la API ya valida el formato) o ERROR definitivo "La voz … no está disponible" | La API lo acepta (solo valida caracteres) y el taller lo trata como **caída del servicio**: 5 reintentos por frase con espera exponencial × 3 intentos de trabajo (~2 min de hilo de voz por capítulo); mensaje final "El servicio de voz no respondió…; se volverá a probar más tarde… Invalid voice 'inventada'" | ×2 (dos voces); log del taller 09:08:50-09:09:13 | `ValidationUtils.java:257-260` (no compara con el catálogo); `cola/trabajador.py:98-101` (no usa `dominio/voces.py:31 voz_conocida`); `voz/motor.py:488-501` (todo `Exception`, incluido `ValueError("Invalid voice")`, es transitorio) |
| DA-13 | Media | Mismo archivo subido a la vez por dos usuarios | `carrera.mjs`: `T18` y `T19` subidos en paralelo desde `qa-datos` y `qa-datos2` | Los dos reciben su ejemplar del mismo archivo | Uno de los dos recibe "Ocurrió un error inesperado procesando la petición" y queda una **carpeta huérfana** en `originales` sin fila en BD: `E:\originales\63553b33-…\qa-datos-T18-carrera.txt` y `E:\originales\1db7f0dc-…\qa-datos-T19-carrera.txt` | ×2 (T18, T19); `carrera.json`, `q3.sql` | `IngestaServiceImpl.java:118-120` (consultar-y-luego-insertar sin manejar la violación de `UNIQUE(sha256)`) y `:165-175` (el fichero se mueve antes del commit y no se limpia al hacer rollback) |
| DA-14 | Media | Retirar un libro mientras se convierte | `borrar_conv*.mjs`: subir `P12`/`P13` (500 p.), borrar el ejemplar 8 s después de PROCESANDO | No quedan restos: se cancela o se limpia al terminar | BD y original borrados, pero el taller termina y deja **`normalizados/{id}` huérfano** (~1 MB: `libro.epub`, `estructura.json`, `portada.jpg`, `frases/`) y registra "Convertido" como éxito | ×2 (`4a34c799-…`, `ef0f70a1-…`) | `LibroServiceImpl.java:273-289` borra filas y ficheros sin cancelar el trabajo EN_CURSO; `conversion/convertir.py:267-277` escribe el destino sin comprobar que el archivo sigue existiendo |
| DA-15 | Media | TXT en UTF-16 (Bloc de notas "Unicode") | Subir `T05` (UTF-16 con BOM) y `T06` (UTF-16LE sin BOM) | Se aceptan (el taller ya decodifica UTF-16 con BOM, `desde_txt.py:32-33`) | Rechazados en la subida: "no parece un TXT válido (el contenido no coincide con la extensión)", mensaje engañoso | ×2 (T05, T06) | `DetectorDeFormato.java:78-84` (cualquier byte 0 ⇒ no es texto; el comentario lo dice: "UTF-16 no") |
| DA-16 | Media | Autor en formato "Apellido, Nombre" (PDF) | Subir `P01` (autor "García Márquez, Gabriel") y `P14` ("Cervantes Saavedra, Miguel de") | Un autor | Dos autores: `["García Márquez","Gabriel"]`, `["Cervantes Saavedra","Miguel de"]`, copiados a la obra | ×2; `meta.mjs` | `conversion/desde_pdf.py:418-420` (parte por `,`) |
| DA-17 | Media | Capítulo EPUB partido en varios XHTML | `E02` (cap. 1 en `cap01a`+`cap01b`) y `E12` (un capítulo en 3 XHTML) | Un capítulo por entrada del índice | Cada XHTML es un capítulo: `E02` 4 capítulos ("Sección 2" fuera del índice), `E12` 4 en vez de 2 ("Sección 2", "Sección 3"); afecta a progreso, minutos por capítulo y "capítulo siguiente" de la voz | ×2 | `conversion/desde_epub.py:158-229` (un capítulo por documento del spine con texto) |
| DA-18 | Media | Libro sin capítulos detectables | `T09` (5 MB, sin títulos), `T07` (una línea de 1,4 MB) | Se trocea en secciones de tamaño razonable | **Un único capítulo** de 56 000 frases / 4856 min (81 h) y 15 000 frases / 1296 min. Ese capítulo no es reproducible en la práctica (ver PL-01) | ×2 (T07, T09) | `conversion/desde_txt.py:139-166` (sin límite de tamaño por capítulo); igual en `desde_docx.py:286-287` |
| DA-19 | Media | Bloqueo de la cola de voz por un capítulo largo | Pedir `V01` cap. 2 (421 frases) y cap. 0 (17 frases) a la vez; otros usuarios piden capítulos | Un capítulo corto pedido por un usuario no espera minutos a otro libro | Un solo hilo de voz y orden FIFO: el cap. 0 tardó **538 s** en estar listo (esperó al largo), y peticiones prioridad 10 de otros QA quedaron detrás ≥9 min | `voz2.json`; `q5.sql` (ux-normal, qa-lector-faro en cola) | `api/servidor.py:72-79` (un hilo de voz), `cola/repositorio.py:234-238` (sin reparto por usuario ni por tamaño) |
| DA-20 | Media | Mensajes de error con jerga | Casos DA-03, DA-04, DA-05, DA-11, DA-12, E08 | Mensaje humano del catálogo | El usuario ve "ValueError: All strings must be XML compatible…", "AttributeError: 'NoneType' object has no attribute 'find'", "ffmpeg: Output file #0…", "(se intentó 3 veces)" | `q1.sql`, `q7.sql` | `dominio/mensajes.py:434-451` (ERROR_INTERNO_* concatenan el detalle técnico) y `cola/trabajador.py:129-133` |
| DA-21 | Baja | EPUB con `container.xml` ilegible | Subir `E08` | "El EPUB está incompleto/dañado" (ErrorDefinitivo) | ERROR tras 3 intentos: "AttributeError: 'NoneType' object has no attribute 'find'" | ×2 | `conversion/desde_epub.py:90-91` (`fromstring` con `recover=True` devuelve `None`) |
| DA-22 | Baja | PDF sin marcadores con títulos visibles | `P04` (23 p., 9 capítulos con título de 22 pt) y `P15` (24 p.) | Capítulos por los títulos grandes que ya se detectan como `h2` | Tramos de 15 páginas: "Páginas 1–15", "Páginas 16–23" (capítulos cortados por la mitad). Ya anotado como pendiente en `taller/README.md` | ×2 | `conversion/desde_pdf.py:382-388` |
| DA-23 | Baja | PDF a tres columnas | `P03`, `P16` | Orden columna 1 → 2 → 3 | Orden por filas de bloques (c1b1, c2b1, c3b1…): frases que empiezan a mitad de palabra ("bra abría…", "rdaba palabra…"); 19 y 10 anomalías. Dos columnas: correcto | ×2 | `conversion/desde_pdf.py:161-186` (solo distingue izquierda/derecha del centro; el bloque de la columna central "vacía" las bandas) |
| DA-24 | Baja | Romanos mal leídos en voz | `V01`/`V02`: "Malcolm X habló", "La Generación X creció", "El Grupo V ganó" | "Malcolm equis", "Generación equis" | "Malcolm décimo", "Generación décimo", "Grupo quinto" (en el audio de las 9 voces) | ×2 (V01, V02) + `sonda_voz.py` | `conversion/normalizador.py:254-261` (regla de reyes: cualquier palabra capitalizada + romano) |
| DA-25 | Baja | Superíndices y "&" en voz | "50 m²", "10³ células", "AT&T" | "metros cuadrados", "diez elevado a tres", "AT and T" | Se borra el superíndice ("50 m", "10 células": cambia el sentido) y "AT&T" → "ATyT" | `V01` c000-s00013/14; `sonda_voz.py` | `conversion/normalizador.py:249` (borra todo `[¹²³⁰⁴-⁹]`, pensado para llamadas de nota) y `:213` |
| DA-26 | Baja | Resaltado de palabra en expansiones de voz | Audio de `V02` cap. 0 en 9 voces | Mientras se dice "doce de octubre de mil…" se resalta "12/10/1492" | Se resalta "12" y luego "10/1492" (o "12/10" y "1492 a"), "las 10:30" como una sola palabra; Alonso parte "1.250,50" en 3 | 9/9 voces; `anal_audio.py` | `voz/alineacion.py:222-247` (difflib carácter a carácter con números expandidos) |
| DA-27 | Baja | Título del primer capítulo con índice anidado | `E01` (nav: "Parte I" → "Capítulo 1. El comienzo", ambos a `c1.xhtml`) | El capítulo se llama "Capítulo 1. El comienzo" | Se llama "Parte I" (el padre gana) | `analisis1.txt` | `conversion/desde_epub.py:201-206` |

| DA-28 | Media | Retirar un libro mientras se genera su voz | `borrar_voz*.mjs`: pedir audio (`V03` cap. 2 Elvira, 421 frases; `T08` cap. 8 Salomé), borrar el ejemplar con el capítulo en GENERANDO | El trabajo se cancela o su resultado se descarta | El taller sigue (6,5 min de hilo de voz en el primer caso), escribe `audio/{id}/…/cap-NNN.m4a`, `-2x.m4a` y `.tiempos.json` (**22 MB huérfanos** en el primero) y hace UPSERT en `bah_lib_audio`: quedan filas LISTO de archivos que ya no existen (`9743dfba-…` cap. 2, `4bfef6d2-…` cap. 8) | ×2; `q8.sql` | `LibroServiceImpl.java:273-289` + `TrabajoRepositoryImpl.java:56-59` borran sin cancelar; `cola/repositorio.py:260-265` (UPSERT sin FK ni comprobación de que el archivo exista) y `voz/capitulo.py:176-190` |

## 3. Lo que SÍ funciona (verificado)

**Integridad (en los 40 libros LISTO):** ids `cNNN-sNNNNN` únicos y consecutivos desde 0; `frases.json` == spans del XHTML en número,
orden y texto exacto; `primeraFrase/ultimaFrase/totalFrases/totalPalabras` cuadran; `minutosEstimados = ceil(palabras/150)`;
EPUB de salida con `mimetype` primero y sin comprimir, XHTML válido como XML, nav + NCX, sin ids repetidos; sin `U+FFFD`, sin mojibake.

**EPUB:** EPUB3 con nav anidado (Parte → capítulos → sub-apartado con fragmento), EPUB2 con NCX, sin índice (título del `<h1>` o
"Sección N"), XHTML mal formado (cae a HTML y conserva el texto), entidades `&eacute; &nbsp; &mdash; &laquo; &euro;`, portada por
`properties="cover-image"` y por `<meta name="cover">`, imagen interna copiada, metadatos: 3 autores, solo año (1998), fecha
"2001-05-03" y "c. 1605?", ISBN-10 con X, idioma en-US, sinopsis con HTML escapado → texto plano. No-EPUB renombrado: rechazado en la
subida con mensaje claro; ZIP sin `container.xml`: "El EPUB está incompleto". Capítulo de 156 000 palabras convertido en ~3 s.

**PDF:** dos columnas en orden correcto; cabecera fija del libro y números de página quitados (P01, P05, P10); guiones de corte
deshechos (0 palabras partidas fuera de DA-08); TOC → capítulos; 504 páginas en 48 s; escaneado y escaneado con marca de agua →
"PDF escaneado: el OCR llegará en una ola posterior" sin reintentos; con contraseña → "protegido con contraseña; quítela…";
solo clave de propietario → se convierte; dañado → "El PDF está dañado". Portada = render de la pág. 1 (≤1200 px).

**Word:** Heading 1 → capítulos y Heading 2 → índice con ancla; solo H2 → capítulos por H2; sin títulos → un capítulo "Documento";
listas, tablas (una frase por celda) e imagen conservadas; `.doc` vía LibreOffice igual que el DOCX; DOCX dañado → mensaje claro;
metadatos del DOCX (título, autor, idioma) copiados.

**TXT:** UTF-8, UTF-8 con BOM, Latin-1 y Windows-1252 con tildes, ñ, comillas tipográficas y € correctos; "CAPÍTULO 1",
"Capítulo I…IV" e "I." como capítulos; `\f` al inicio de línea (estilo pdftotext) tolerado; vacío/solo espacios → "El archivo de texto
está vacío"; con byte nulo → rechazado en la subida.

**Voz:** las 9 voces del catálogo generan audio; `tiempos.json` cubre todas las frases en orden; t0/t1 monótonos y dentro de la
duración; **duración de `tiempos.json` = ffprobe del m4a 1x (diferencia 0,000 s)**; 2x = duración/2 con −1 a −17 ms; AAC-LC mono
24 kHz ~43 kbps; pausas exactas 0,25 / 0,50 / 0,70 s según `finParrafo`/`esTitulo`; palabras dentro de su frase y monótonas;
caché compartida (las 3 primeras frases iguales de V01 y V02 dan tiempos idénticos). Normalizador: Sr./Dra./cap./pág./núm./Av./Sta.,
EE. UU., n.º, 12/10/1492 → "12 de octubre de 1492", siglo XIX → "diecinueve", Felipe II → "segundo", Luis XIV → "catorce",
Capítulo IV → "cuatro", "rayos X" intacto. Validaciones de `/audio/estado`: capítulo fuera de rango ("elige uno entre 0 y 2"),
negativo, vozId con `../` → rechazados con mensaje claro. Latido de 60 s visible en `actualizado` durante trabajos largos.

**Cola e integridad:** conversión y voz no se bloquean entre sí (las conversiones siguieron mientras la voz trabajaba); prioridades
10/20 respetadas (siguientes capítulos detrás del pedido); reintentos ×3 y paso a ERROR; `SKIP LOCKED` sin dobles tomas en ~120 trabajos;
**duplicado por sha256**: el mismo archivo en otra cuenta reutiliza `archivoId`, queda LISTO al instante con los metadatos aplicados
(`fuente ARCHIVO`); re-subir un archivo en ERROR lo re-encola; **retirar** un ejemplar compartido deja el archivo al otro usuario;
retirar el último borra filas (`trabajo`, `audio`, `archivo`) y carpetas (`originales`, `normalizados`, `audio`) — salvo DA-14;
**sincronización de metadatos** a los ~10 s del LISTO (título, autores, año, ISBN, idioma, editorial, sinopsis, portada) y una
**edición MANUAL hecha antes de terminar la conversión no se pisa** (`E11`: "Titulo Manual QA" se mantiene, fuente MANUAL).

**Tiempos de proceso medidos:** EPUB pequeños < 1 s; EPUB 156 k palabras ~3 s; TXT 5 MB ~8 s; PDF 40 p. ~5 s; PDF 504 p. 48 s;
voz: capítulo de 8 frases ~5 s, de 17 frases ~15 s; 421 frases (43 min de audio) sintetizadas en 265,6 s + ~2 min de ensamblado.

**Capítulo largo:** `P10` cap. 9 (183 frases, 18 min 57 s): duración de `tiempos.json` = ffprobe 1x exacta, 2x con −1 ms, pausas exactas, todas las frases con palabras.

## 4. PLAUSIBLES (no confirmados del todo)

| ID | Sev. estimada | Qué | Por qué no está confirmado |
|---|---|---|---|
| PL-01 | Alta | Generar la voz de un capítulo de 56 000 frases (DA-18): `voz/capitulo.py:170` crea 56 000 tareas y un PCM temporal de ~14 GB (81 h × 24 000 × 2 B) en `/tmp` del contenedor, y ocupa el único hilo de voz durante horas | No se ejecutó para no saturar edge-tts ni el disco de la instancia compartida; el cálculo sale de los datos reales de `T09` |
| PL-02 | Media | Edición manual parcial: cambiar solo el título antes de que termine la conversión marca la obra entera como MANUAL y el ISBN/año/sinopsis del archivo ya no se copian nunca (`TareaMetadatos.java:155`, `LibroServiceImpl.java:231-235`) | Deducido del código; en `E11` se editaron título y autor y el EPUB no traía más campos |

## 5. Estado en que queda la instancia de QA (para el integrador)

- Atascados por DA-01 hasta el próximo reinicio del taller hecho ≥30 min después de las 09:15: trabajo CONVERTIR de `qa-datos-P11-pdf-500p-reinicio.pdf`
  (archivo `008779bd-…`, PROCESANDO) y VOZ_CAPITULO de `qa-datos-V01-voz-casos.txt` cap. 2 Álvaro (`8046987f-…`, GENERANDO). Son solo de mis cuentas.
- Restos huérfanos creados por DA-13/DA-14/DA-28 (se dejan como evidencia; se pueden borrar a mano):
  `E:\LaBibliotecaAH-qa\datos\originales\63553b33-…`, `…\originales\1db7f0dc-…`, `…\normalizados\4a34c799-…`, `…\normalizados\ef0f70a1-…`,
  `…\audio\9743dfba-…`, `…\audio\4bfef6d2-…` y las 2 filas de `bah_lib_audio` de esos dos últimos archivos.
- El taller se reinició **una vez** (09:15:30) para DA-01. No se tocó código, producción ni Oh Churus.
