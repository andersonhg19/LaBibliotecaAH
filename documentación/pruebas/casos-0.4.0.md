# Casos de prueba de la 0.4.0 — estado definitivo

Cierre de la validación de la 0.4.0 (auditoría del 2026-11-13, olas y rondas de arreglos del 2026-11-14). Cada caso
lleva el estado según la **última ronda** de su área: api → ronda 2 (sobre `6eaf3d6`), voz → ronda 3 y web → ronda 3
(las dos sobre `6786c2b`). Después de la ronda 3 solo entró `cebbc10` (R3-1), probado con `mvn verify`
(biblioteca-service 337/337).

Leyenda: ✅ pasa · ⚠️ solo verificable con pruebas unitarias (en verde) · 📱 solo en iPhone físico · ⏳ pendiente.
«Ronda» = la ronda en que pasó por primera vez de forma definitiva (R1, R2, R3); entre paréntesis, lo que pasó antes.
Tipo: U = unitaria/automática, Q = en vivo en QA, M = manual.

Evidencias, todas en el PC de casa, bajo `C:\srv\biblioteca-ah-qa\qa\validacion\`:

| Área | Carpeta | Contenido |
|---|---|---|
| api | `api\` (R1) y `api\r2\` (R2) | `*-out.txt`, `c11-*.json`, `z4-mvn.log`, `z-*-run.log`, `respaldo\`, `h34-out.txt`, `h5-out.txt`, `h6\` |
| voz | `voz\` (R1), `voz\r2\`, `voz\r3\` | `medidas.jsonl`/`med.jsonl`, `oir-*.txt` (Whisper), `subidas.jsonl`, `b17-*.txt` |
| web | `web\salidas-r1\`, `salidas-r2\`, `salidas\` (R3); capturas en `capturas-r1\`, `capturas-r2\`, `capturas\`; `z1-r3\` | salida de cada escenario y capturas PNG |

Los informes completos de cada ronda (validacion-api/voz/web y sus r2/r3) quedaron en el scratchpad de la sesión de
cierre; lo esencial está aquí y en `seguimiento/bitacora.md`.

## Resumen

| Bloque | IDs | ✅ | ⚠️ | 📱 | ⏳ |
|---|---|---|---|---|---|
| A. Voz, robustez | 7 | 7 | | | |
| B. Voz, calidad | 17 | 17 | | | |
| C. Capítulos y estructura | 16 | 16 | | | |
| D. Reproductor y cinta | 16 | 12 | 3 | 1 | |
| E. UX y accesibilidad | 13 | 13 | | | |
| F. Experiencia viva | 13 | 13 | | | |
| G. Backend | 11 | 11 | | | |
| H. Operación | 11 | 10 | | | 1 |
| Z. Regresión global | 5 | 5 | | | |
| **Casos del plan** | **109** | **104** | **3** | **1** | **1** |
| IDs nuevos (V-NUEVO-*, A-*, R2-*, R3-*) | 28 | 28 | | | |

Ningún ❌ abierto. El ⏳ es H2 (proteger `main`), que por diseño se aplica después de integrar.

## A. Voz — robustez [V-01, V-02, V-10]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| A1 | mp3 truncado de edge-tts: se reintenta, nunca se cachea truncado | ✅ | R2 (R1 ⚠️, prueba no re-ejecutada) | pytest del taller (`truncad*`); 0 truncados en vivo en R1–R3 |
| A2 | Caché con un mp3 truncado: se descarta y se regenera | ✅ | R2 (R1 ⚠️) | pytest `cache_truncada` |
| A3 | Frase solo en griego / cirílico / japonés / árabe | ✅ | R1 | VV08 y `qa-aud-voz-2` LISTO en 5 voces; oídos en su idioma (`voz\r2\oir-*`) |
| A4 | «ª», «Ⅳ», «§» sueltos no tumban el capítulo | ✅ | R1 | ª sin texto hablable, Ⅳ → «cuatro», ① → «uno» (R1–R3) |
| A5 | Frase que edge rechaza: silencio breve + WARN, capítulo LISTO | ✅ | R2 (R1 ⚠️) | pytest `rechaza` |
| A6 | Emojis no se leen; resaltado intacto | ✅ | R1 | VV07 (Whisper sin emojis; resaltado completo) |
| A7 | Capítulo vacío = 1 s de silencio | ✅ | R1 | R3: capítulo «Vacío» de 1,06–1,08 s |

## B. Voz — calidad [V-03…V-09, V-11…]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| B1 | «1.250», «3,5», «1/2», «2.ª», «12.345.678» en 5 voces | ✅ | R1 | Whisper en Álvaro, Jorge, Alonso, Gonzalo y Tomás |
| B2 | «$30», «30 €», «30 USD» con voz MX | ✅ | R1 | `voz\r2\oir-*` |
| B3 | Horas («22:00», «7:30», «10.30 h», «a. m./p. m.») | ✅ | R1 | R2/R3 |
| B4 | Abreviaturas (art., pág., Sr., Dra., EE. UU., S.A., etc., vs., p. ej.) | ✅ | R1 | «vs.» y «Por ej.» añadidos en R2 (V-NUEVO-VOZ-5) |
| B5 | «2x1», «4x4» | ✅ | R1 | «2 por 1, 4 por 4» |
| B6 | Romanos (Capítulo IV, Luis XIV, siglo XXI, Juan Pablo II) | ✅ | R1 | Whisper |
| B7 | URL / correo / ruta breves | ✅ | R1 | Whisper |
| B8 | Silencios internos de diálogo ≤ 0,40 s | ✅ | R2 (R1 ❌ 0,59 s) | R3: máximo 0,395 s (silencedetect −45/−50 dB) |
| B9 | Pausas 0,35 / 0,70 / 1,0 / inicio 0,4 s | ✅ | R1 | R3: 24/24 exactas (frase 0,349–0,351, párrafo 0,699–0,701) |
| B10 | −18 ± 1 LUFS y pico ≤ −1,5 dBTP, 1x y 2x | ✅ | R3 (R1 ❌ pico, R2 ❌ sonoridad: R2-2) | `voz\r3\med.jsonl`: 22 capítulos > 3 s, 1x −18,6…−17,5, 2x −18,4…−17,7, pico máx. −1,7 |
| B11 | 2x = 0,50 ± 0,005 de la 1x, tono conservado | ✅ | R1 | R3: 0,4989–0,5006; R1: F0 +1…+4 % |
| B12 | `tiempos.json` monótono, resaltado completo, «1.250» resalta «1.250» | ✅ | R1 | R3: 24/24 monótonos; resaltado 6384/6386 (faltan 2 «ª», que no se hablan) |
| B13 | Frase en otro idioma con voz multilingüe | ✅ | R2 (R1 ⚠️ alemán y portugués) | en, fr, it, de, pt; libro en inglés entero (R3) |
| B14 | Poesía: pausa breve por verso | ✅ | R1 | R1/R2 |
| B15 | NBSP / ZWSP / guion de corte no pegan palabras ni se leen | ✅ | R3 (R1 ✅ con nota, R2 ❌ regresión R2-1) | `voz\r3\`: los 3 textos ZWSP iguales en lector, Whisper y resaltado |
| B16 | Frase larguísima se parte en coma/conjunción | ✅ | R1 | se parte antes de «y» |
| B17 | Diccionario de pronunciación por libro | ✅ | R3 (R1/R2 ⚠️ sin API ni web) | `b17-*.txt`: validaciones 120, IDOR 102, regenera solo el capítulo afectado sin cortar el audio; Whisper «Germayoni», resaltado «Hermione»; ficha web en 5 tamaños × 2 temas |

## C. Capítulos y estructura [CF-01…CF-12]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| C1 | EPUB3 con epub:type completo | ✅ | R1 | voz R1/R2 |
| C2 | «Capítulo primero», «CAPÍTULO 01», «Chapter One», «I.» = 1 | ✅ | R1 | voz R1/R2 |
| C3 | XHTML con 5 capítulos (Calibre) | ✅ | R1 | voz R1/R2 |
| C4 | Adelanto «Capítulo 1» de otra novela al final | ✅ | R1 | voz R1/R2 |
| C5 | «Primera parte» + capítulos | ✅ | R1 | voz R1/R2 |
| C6 | Trozos «(parte k de n)» heredan el número | ✅ | R1 | voz R1/R2 |
| C7 | EPUB2 con notas / linear="no" | ✅ | R1 | voz R1/R2 |
| C8 | Nav sin epub:type | ✅ | R1 | voz R1/R2 |
| C9 | PDF con «Portada/Índice/Capítulo 1» en la pág. 1 | ✅ | R1 | voz R1/R2 |
| C10 | Metadatos OPF (subtítulo, contributor, «Pérez, Ana», «Unknown», «spa») | ✅ | R1 | voz R1/R2 (los metadatos llegan ~1 min después de LISTO) |
| C11 | RECLASIFICAR_ESTRUCTURA sobre libros ya convertidos | ✅ | R1 (R2 con `clasificador: 2`) | `api\r2\c11-comparacion.txt`: 363/363 con clasificador 2, 0 problemas; notas 31/31 y audio 337/337 sin cambios; idempotente |
| C12 | Libro v1 sin reclasificar: la web numera por títulos | ✅ | R2 (R1 ❌ `numero: null` en v1) | `api\r2\resubida-out.txt`; web `rehacer-c12-x` |
| C13 | 🎧 por capítulo y «Solo la historia» | ✅ | R1 | `api\r2\precarga-out.txt` 4/4; voz R1; web R1/R2 |
| C14 | IDOR del toggle | ✅ | R1 | 102 con `object: null` (api, web; y B17 en R3) |
| C15 | Tablas no se leen celda a celda | ✅ | R1 | voz R2 |
| C16 | Portada lisa enorme: se reduce u omite, libro LISTO | ✅ | R1 | voz R2 |

## D. Reproductor y cinta [RP-01…RP-18]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| D1 | Elegir capítulo con cinta ×20 | ✅ | R2 (R1 ❌ atasco intermitente, V-NUEVO-WEB-4) | R2 40/40 + 12/12 servidor lento; R3 `vivo-elegir-1` 20/20 |
| D2 | Temporizador «fin de capítulo» + ▶ | ✅ | R1 | `vivo-timer-{1,0}` |
| D3 | Fin del libro + ▶ | ✅ | R1 | `vivo-finlibro-{1,0}` |
| D4 | Precarga 404/401: ≤ 3 intentos y aviso | ✅ | R1 | R2: `vivo-p404-1`, `vivo-p401-1`, `vivo-p404-0` |
| D5 | Fallo de red pasajero en la cinta | ✅ | R1 | corte, corte de 20 s y red lenta |
| D6 | Saltar solo un capítulo en ERROR | ⚠️ | — | no se puede provocar en Chrome; jest `motorAudio040` |
| D7 | Descarga tardía tras cambiar o detener | ⚠️ | — | jest `cintaAdversarial` |
| D8 | Precarga tardía de la voz anterior | ✅ | R1 | `vivo-cambiovoz-{1,0}` |
| D9 | `sourceclose` / `endstreaming` de iOS | ⚠️ | — | solo iOS; jest `motorAudio040 «cierra la cinta»` |
| D10 | `tiempos.json` falla y vuelve la red | ✅ | R2 (R1 ❌) | `vivo-tiempos-{1,0}` |
| D11 | Cruce 1x/2x/3x/5x y saltos cruzando | ✅ | R1 | R1/R2 |
| D12 | enVoz=false y minutos 0 seguidos | ✅ | R1 | `vivo-envoz-{1,0}` |
| D13 | Temporizador por minutos no cuenta en pausa | ✅ | R1 | `vivo-temporizador-1` |
| D14 | Latido cada 60 s sonando, no en pausa | ✅ | R1 | `vivo-latido-1` |
| D15 | Cambiar de libro sonando; recargar a mitad | ✅ | R1 | `vivo-libro-1` |
| D16 | Pantalla bloqueada 30 min cruzando capítulos (PWA y Safari) | 📱 | — | pendiente en iPhone físico (ver al final) |

## E. UX, diseño y accesibilidad [UX5-01…]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| E1 | Reproductor en SE, 320, 390 con zona segura, horizontal, 200 % | ✅ | R1 | 108/108 capturas en R1, R2 y R3 |
| E2 | «Seguir leyendo / Escuchar» sin scroll en teléfonos | ✅ | R1 | 108/108 en R2 y R3 |
| E3 | Contraste del tema día ≥ 4,5:1 | ✅ | R1 | medido en píxeles (R1, R2) |
| E4 | Tab en el lector: foco siempre visible | ✅ | R2 (R1 ⚠️ sin contorno en el libro) | `foco-x-x` (contorno de 2 px) |
| E5 | Hojas como diálogo con nombre y foco dentro | ✅ | R1 | 4 hojas |
| E6 | «+» no tapa contenido | ✅ | R2 (R1 ⚠️) | «+» en la cabecera en SE/320 |
| E7 | Estantería y reproductor en horizontal | ✅ | R1 | dos columnas |
| E8 | 320 px sin textos cortados | ✅ | R3 (R1 ⚠️, R2 ❌ título cortado) | `r3-titulo-x` 30/30; `capturas\R3-E8-*` |
| E9 | Cifras legibles («Capítulo 1») | ✅ | R1 | cifras modernas |
| E10 | Muescas de velocidad ≥ 44 px, «0,5x» | ✅ | R1 | 108/108 en R3 |
| E11 | Lector de día no abre en Noche | ✅ | R1 | Marfil de día |
| E12 | Índice agrupado Antes / Capítulos / Al final | ✅ | R1 | `vivas-c13-x` |
| E13 | Sin scroll horizontal; reduced-motion | ✅ | R1 | 0 en 108 (R3) + 216 (R2) capturas |

## F. Experiencia viva [Ola E]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| F1 | Palabra resaltada que se desliza | ✅ | R1 | R1/R2 |
| F2 | Portada que vuela a la ficha | ✅ | R1 | 380 ms; con reduce, fundido de 120 ms |
| F3 | Esqueletos de carga | ✅ | R1 | CLS ≤ 0,046 |
| F4 | Tarjeta de fin de capítulo | ✅ | R1 | R1/R2 |
| F5 | Confeti al terminar un libro | ✅ | R1 | R1/R2 |
| F6 | ▶ con anillo de preparación | ✅ | R1 (accesible en R2, V-NUEVO-WEB-9) | «Preparado al N %» en `aria-valuetext` |
| F7 | Onda con la envolvente precalculada | ✅ | R1 | envolvente real; con reduce, quieta |
| F8 | Modo cine | ✅ | R2 (R1 ⚠️ foco en «Salir», V-NUEVO-WEB-8) | `rehacer-cine-x`, `rehacer-escape-x` |
| F9 | «Preparar el libro entero» | ✅ | R1 | barra 0→6→8 de 8; idempotente (api `preparar`) |
| F10 | Sello «Guardado en casa» | ✅ | R1 | reproductor y lector |
| F11 | Lámpara de estado de la casa | ✅ | R1 | `estado-casa` con caché (api R2) |
| F12 | Estadísticas y racha | ✅ | R1 | sesiones reales (= G5) |
| F13 | Atkinson Hyperlegible / OpenDyslexic | ✅ | R1 | `rehacer-letras-x` (R2) |

## G. Backend [BK-01…, P-01]
| ID | Caso | Estado | Ronda | Evidencia (`api\r2\`) |
|---|---|---|---|---|
| G1 | Freno de login por origen, sin bloqueo global | ✅ | R1 | `freno-out.txt` 9/9, `retardo-out-1/2` |
| G2 | WARN con `REGISTRO_PUBLICO=true` | ✅ | R1 | log de arranque |
| G3 | 404/400 del gateway con ResultDTO y cabeceras | ✅ | R2 (R1 ❌ parcial: V-NUEVO-API-2/3) | `seguridad-out.txt` y `-2`, 93/93 |
| G4 | Búsqueda: texto > 200, calificacionMin NaN → 120 | ✅ | R1 | `seguridad-out*.txt` |
| G5 | Latido de sesión, resumen y rachas (Bogotá) | ✅ | R1 | `contratos-out.txt`, `rachas-out.txt` 5/5, `sid-out.txt`, `inflado-out.txt` |
| G6 | Preferencias enVoz + IDOR | ✅ | R1 | `contratos-out.txt` |
| G7 | Reclasificar: ADMIN, idempotente, 403 sin ADMIN | ✅ | R1 | `c11-llamadas.txt` |
| G8 | Preparar libro / estado-casa | ✅ | R1 | preparar 4 de 7 en voz, ajeno → 102 |
| G9 | Flyway aditivo; arranque limpio sobre 0.3.3 | ✅ | R1 | V1–V6 `success` (QA); V7 en R3 (voz/web sobre `6786c2b`) |
| G10 | Regresión de seguridad (IDOR, JWT, CORS) | ✅ | R1 | 93/93 por corrida |
| G11 | `mvn -B clean verify` con JaCoCo | ✅ | R1 | `z4-mvn.log` (6eaf3d6); tras `cebbc10`, biblioteca 337/337 |

## H. Operación [OP-01…]
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| H1 | CI de GitHub en verde | ✅ | R1 | run 43602646111 (6eaf3d6): 5/5 jobs |
| H2 | `main` protegida | ⏳ | — | comando preparado y comprobado (nombres de checks, app 15368); se aplica tras integrar (`despliegue.md`, paso 9) |
| H3 | Respaldo con espejo y rotación; un fallo no deja carpeta «buena» | ✅ | R2 (R1 ❌ parcial: V-NUEVO-API-1) | `h34-out.txt` |
| H4 | Vigía cada 10 min | ✅ | R1 | `h4-out.txt` (R1), `h34-out.txt` (R2) |
| H5 | Vuelta atrás con migraciones | ✅ | R1 | `h5-out.txt`: la 0.3.3 arranca sobre la base con V6 |
| H6 | BibliotecaDeLujo estable en paralelo ×3 | ✅ | R1 | `h6\resumen.txt`: 742/742 ×3 |
| H7 | npm audit sin críticas/altas en ejecución (o justificadas) | ✅ | ola | ola dependencias: 1 crítica + 19 altas → 0 + 2 altas justificadas (zod 3); evidencias `qa\olas\dependencias\` |
| H8 | Node 22 en CI e imágenes | ✅ | ola | Node 22.23.5 fijado por digest; CI verde (H1) y Z1 |
| H9 | Spring Boot 3.5.x + Spring Cloud compatible | ✅ | ola | Boot 3.5.16 / Cloud 2025.0.3; Z4 verde sobre esa versión |
| H10 | Límites de CPU; QA no compite con producción | ✅ | R2 (R1 ❌ parcial: A-2) | `docker inspect` NanoCpus 0,75/0,5/1/1/0,25 |
| H11 | `despliegue.md` al día | ✅ | R1 (notas corregidas en R2 y en el cierre) | `documentación/despliegue.md` |

## Z. Regresión global
| ID | Caso | Estado | Ronda | Evidencia |
|---|---|---|---|---|
| Z1 | Jest, tsc, eslint, prettier | ✅ | R1 | R1 715/715 → R2 742/742 → R3 750/750 (`web\z1-r3\`) |
| Z2 | Taller ruff + mypy + pytest | ✅ | R1 | R2 505 passed, 92,22 %; tras la ronda 3, 533 passed, 92,43 % |
| Z3 | Traductor pytest | ✅ | R1 | 137 passed, 99,38 % |
| Z4 | Backend `mvn verify` | ✅ | R1 | discovery 1, gateway 16, auth 382, biblioteca 330 (R2); biblioteca 337 tras `cebbc10` |
| Z5 | Recorrido completo en iPhone, Android, iPad y PC | ✅ | R3 (R1/R2 ⚠️ Diario en iPhone) | `recorrido-iphone-centrar`; consola 0 y HTTP ≥ 400 = 0 |

## IDs nuevos que aparecieron durante la validación

Los «V-NUEVO-n» se numeraron por área, así que aquí llevan el área delante.

| ID | Sev. | Qué | Estado | Ronda |
|---|---|---|---|---|
| V-NUEVO-API-1 | Media | Con D: desconectado el respaldo moría sin escribir FALLA ni hacer el espejo | ✅ | R2 |
| V-NUEVO-API-2 | Baja | 404 de rutas internas del gateway sin cabeceras de seguridad | ✅ | R2 |
| V-NUEVO-API-3 | Baja | 400 de rutas con `./ .. %2e ;` con el JSON de Spring | ✅ | R2 |
| V-NUEVO-API-4 | Baja | Estadísticas infladas con latidos sin `sesionId` | ✅ | R2 |
| V-NUEVO-API-5 | Baja | El vigía escribía errores de PowerShell con un disco desconectado | ✅ | R2 |
| A-1 | Media | Libros sin ningún capítulo en voz tras clasificar | ✅ | R2 |
| A-2 | — | `CPUS_*` bajos en el `.env` de QA (H10) | ✅ | R2 |
| V-NUEVO-VOZ-1 | Alta | Cuentos y poemas cortos con nombre marcados «preliminar» y fuera del audiolibro | ✅ | R2 |
| V-NUEVO-VOZ-2 | Media | Libro en inglés leído con voz española | ✅ | R2 |
| V-NUEVO-VOZ-3 | — | Libro con un único capítulo «Epígrafe» sin voz (= A-1) | ✅ | R2 |
| V-NUEVO-VOZ-4 | Baja | Alemán y portugués no detectados | ✅ | R2 |
| V-NUEVO-VOZ-5 | Baja | «vs.» y «Por ej.» mal leídos | ✅ | R2 |
| V-NUEVO-VOZ-6 | Baja | «π» borrada y «x²» → «x» | ✅ (x² solo en libros nuevos) | R2 |
| V-NUEVO-VOZ-7 | Baja | Teléfonos dígito a dígito | ✅ | R3 (con «+» en R2, sin «+» en R3) |
| V-NUEVO-VOZ-8 | Baja | ZWSP dentro de una palabra se volvía espacio visible | ✅ | R2 (su arreglo causó R2-1) |
| V-NUEVO-WEB-1 | Alta | El reproductor hacía ~100 peticiones por segundo (también en 0.3.3) | ✅ | R2 (reconfirmado en R3) |
| V-NUEVO-WEB-2 | — | Un 401 esporádico con token válido cerraba la sesión | ✅ | R2 (cliente y servidor: api R2 9/9 con dos dispositivos) |
| V-NUEVO-WEB-3 | — | Dos pestañas sonando a la vez | ✅ | R2 |
| V-NUEVO-WEB-4 | — | Atasco al elegir capítulo con descarga lenta (= D1) | ✅ | R2 |
| V-NUEVO-WEB-5 | — | Audio 404/401 saltado en silencio con cinta | ✅ | R2 |
| V-NUEVO-WEB-6 | — | «Dedicatoria» como capítulo actual antes de empezar | ✅ | R2 |
| V-NUEVO-WEB-7 | — | Resubir un archivo conocido daba estructura v1 | ✅ | R2 (api y web) |
| V-NUEVO-WEB-8 | — | Modo cine: el primer Espacio cerraba en vez de pausar (= F8) | ✅ | R2 |
| V-NUEVO-WEB-9 | — | Anillo sin «Preparado al N %» y libro sin contorno de foco | ✅ | R2 |
| V-NUEVO-WEB-10 | Baja | La cinta repedía cada ~2 s un capítulo que fallaba por red | ✅ | R3 (esperas 2·4·8·15·30 s) |
| R2-1 | Media | Regresión: el ZWSP como separador volvía a pegar palabras | ✅ | R3 |
| R2-2 | Baja | Sonoridad fuera de −18 ± 1 en capítulos recodificados y en la voz multilingüe | ✅ | R3 |
| R3-1 | Baja | El diccionario aceptaba marcas en «a» (`<break …/>` se leía en voz alta) | ✅ U | después de R3: `cebbc10` rechaza `< > { } \` con 120; `PronunciacionTest` en `mvn verify` 337/337; sin validación en vivo |

## Observaciones menores que quedan abiertas (sin severidad de fallo)
- Z5: en el iPhone las pestañas de la ficha quedan bajo la barra fija al cargar; se alcanzan desplazando (no es un bloqueo).
- B17 en la ficha: todos los errores salen bajo «Cómo decirla», también cuando el problema es la palabra.
- Un ZWSP suelto entre dos palabras reales se ve «sueltaaquí» (la voz dice «suelta aquí»): riesgo aceptado.
- Los capítulos de menos de 3 s no se corrigen de sonoridad (por diseño).
- Cada petición con token malo deja un WARN y no hay rotación de logs de Docker: un cliente en bucle puede llenar el log
  (propuesta: 1 WARN por huella y ruta por minuto, o `logging: max-size` en el compose).
- Un día con 59 s de escucha sale como «1 min» en `dias[]`, aunque no cuenta para la racha.

## Pendiente / fuera de alcance
- **D16, iPhone físico.** Nada de la cinta con pantalla bloqueada se puede dar por bueno sin él. Protocolo resumido
  (auditoría, informe 2-reproductor, ≈ 20 min, iOS 17.1+, PWA con datos móviles y un libro de capítulos cortos):
  1. ▶ y bloquear: 2 cruces de capítulo sin corte > 0,5 s y con el título cambiando en la pantalla de bloqueo.
  2. Con auriculares, a 1x y 3x: ¿clic, eco o sílaba repetida en la frontera?
  3. ⏭ / ⏮ / barra / ±15 desde el bloqueo, cerca del final de un capítulo.
  4. Temporizador «al final del capítulo» bloqueado; después ▶ y ver si el título pasa al capítulo nuevo.
  5. Pausa de 10 min bloqueado y ▶ desde el bloqueo (que iOS no haya cerrado la cinta).
  6. Modo avión 5 s a ~40 s del final: el cruce debe seguir.
  7. Capítulo de ≥ 20 min con datos: segundos hasta oír.
  8. Llamada, Siri u otra app de audio a mitad; volver con ▶ desde el bloqueo.
  9. AirPlay (no aparece, RP-13) y Bluetooth/CarPlay (sí suenan).
  10. iPad en Safari: repetir el paso 1.
  11. Cinco veces, tocar un capítulo concreto con datos móviles: ¿suena alguna vez el siguiente? (RP-16).
- **RP-13 AirPlay**: la cinta necesita `disableRemotePlayback`; ofrecer AirPlay pide un `<source>` alternativo. No hecho.
- **RP-15**: el motor ya sabe si la escucha continua está activa (`escuchaContinua`), pero Ajustes aún no lo muestra
  («activada / no disponible (iOS 17.1+)»).
- **Expo SDK 57/58** (plan escrito en la ola de dependencias) y **zod 4** (la alta de zod 3 queda justificada).
- **Entonación de exclamaciones**: «¡Que se va el tren!» suena a pregunta en algunas voces (V-13; edge-tts sin SSML propio).
- **Hogar compartido** (P-02, plan §8.1) e **IA**: pendientes de decisión de Anderson.
- **Audio generado antes de la 0.4.0**: conserva el volumen (−19,6…−22,8 LUFS) y las pausas de la 0.3.3 hasta que se
  regenere su capítulo (`tiempos.json` sin `versionAudio: 2`). Un libro puede quedar mezclado (~3 dB de salto); basta
  borrar el audio de ese libro y voz.
- **x² en libros ya convertidos**: la conversión vieja lo quitaba como llamada de nota; solo los libros convertidos con
  la 0.4.0 dicen «x al cuadrado». Los viejos lo recuperan solo si se vuelven a convertir.
- **Diccionario compartido por archivo**: si dos personas tienen el mismo libro, el cambio de una cambia el audio de la
  otra. Es así por diseño (el audio es por archivo y voz) y está en `contratos.md` v1.8.
