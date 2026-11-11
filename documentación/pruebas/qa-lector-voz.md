# QA del LECTOR y la VOZ — La Biblioteca AH

**Fecha:** 2026-11-11 · **Rol:** QA lector/voz · **Instancia:** QA en casa (web `http://localhost:4100`, gateway `:9920`)
**Navegador:** Chrome sin cabeza conducido por CDP (puerto 9342), emulando iPhone (Safari UA, 390×844) y Android (Chrome UA).
**Evidencias:** capturas y scripts en casa, `C:\srv\biblioteca-ah-qa\qa\lector\` (`capturas\*.png`, `t01.mjs` … `t16.mjs`, `cdp.mjs`).
**Cuentas creadas:** `qa-lector@biblioteca.ah` (principal) y `qa-lector2@biblioteca.ah` (aislamiento / "otra cuenta").
**Libros creados (solo en esas cuentas):**

| Archivo | Qué prueba |
|---|---|
| `qa-lector-faro.epub` | 6 capítulos: diálogos con raya, «comillas» y "comillas", números (1.250, 3,5, 22:00), abreviaturas (Sr., Dra., EE. UU., art., pág.), notas al pie, título raro `¿Qué? ¡No! — «Título raro» & <símbolos> Ñandú 2.0`, capítulo vacío, capítulo largo (4.216 palabras, 32 min de voz), capítulo de notas |
| `qa-voz-breve.epub` | 3 capítulos de ~13 s (fin de capítulo, avance automático, fin del libro) |
| `qa-lector-pdf.pdf`, `qa-lector-texto.txt`, `qa-lector-word.docx` | formatos convertidos |

> Regla aplicada: cada hallazgo CONFIRMADO se reprodujo al menos dos veces. Lo que solo se ve en el código o se vio una vez va como PLAUSIBLE.

---

## 1. Resumen

El lector y la voz están **mucho mejor de lo que hace pensar "muchos bugs"** en el camino feliz: abrir, índice, buscar, ir a %, temas, notas, velocidades de 0.5x a 5x (con el archivo correcto y la posición conservada), resaltado de frase y palabra (desfase prácticamente nulo), paso de página y de capítulo automáticos, temporizador, pausa larga y retomar desde el servidor funcionan.

Los fallos están en los **bordes**, que es justo donde vive el uso real en un móvil:

- **Las notas aparecen en capítulos donde no se hicieron** (re-anclaje por cita sin mirar el capítulo). Anderson lo vería como "mis resaltados salen en cualquier parte".
- **Un corte de red o un capítulo fallido al cambiar de capítulo deja la voz muerta**: ▶ no hace nada, no hay reintento, y "Capítulo siguiente" se salta el capítulo que falló. Con la pantalla bloqueada no hay forma de recuperarlo.
- **Cuando la sesión caduca la voz sigue sonando sin controles**, el progreso deja de guardarse y, si entra otra persona en ese navegador, ve y controla el libro de la anterior.
- **Abrir un libro en un dispositivo pisa en el servidor la posición más avanzada del otro**, aunque no se lea nada ni se conteste "¿Ir allí?".
- Varios detalles de interacción (tocar una nota en el borde pasa la página, la nota no se puede editar, mensaje "Preparando…" que no se va, la barra de arriba tapa la primera línea, modo continuo que no deja hojear con la voz).

### Conteo por severidad

| Severidad | Confirmados | Plausibles |
|---|---|---|
| Bloqueante | 0 | 0 |
| Alta | 3 | 0 |
| Media | 6 | 2 |
| Baja | 4 | 4 |
| **Total** | **13** | **6** |

---

## 2. Hallazgos CONFIRMADOS

| ID | Sev. | Pasos | Esperado | Obtenido | Evidencia | Causa probable |
|---|---|---|---|---|---|---|
| **LV-01** | **Alta** | 1) En el cap. 4 del faro resaltar 5 frases (5 colores), 1 frase completa y 1 nota. 2) Abrir el libro de nuevo empezando en el cap. 1 (otra sesión/otro perfil, o `/leer/{id}?frase=c000-s00014`). | El cap. 1 no tiene ninguna nota: 0 resaltados. | **6 resaltados pintados en el cap. 1** sobre frases que solo coinciden en texto ("Las olas rompían…", "Cada noche contaba las barcas" — la nota —, "El Dr. Gómez…", "La biblioteca del faro te…"). Al tocarlos abren la nota del cap. 4. Si luego se va al cap. 4, salen también allí (duplicadas). Reproducido 3 veces (perfil Android limpio ×2, perfil iPhone al reabrir en cap. 1). | `t03-01-cap1-pB.png`, `t12-02-lejos.png`, `t12-01-desde-aqui.png`; salida `t03.mjs` ("cap1 overlays (esperado 0): n=6") | `components/lector/LectorFoliate.web.tsx:177-188` `reanclarEn` corre para **todas** las notas en cada sección que carga; si las anclas de frase no están en ese documento (otro capítulo), cae a `rangoDesdeCita` (`components/lector/anclas.ts:68-80`, primera aparición del texto en la sección) sin comprobar `a.capitulo` ni prefijo/sufijo. Agrava: el efecto de `props.anotaciones` (`LectorFoliate.web.tsx:447-451`) corre antes de que exista la vista, así que en la primera carga ninguna nota está en `mapaCfi` y todas pasan por el re-anclaje. Arreglo natural: re-anclar solo si `a.capitulo` coincide con la sección y usar prefijo/sufijo para desambiguar. |
| **LV-02** | **Alta** | 1) Escuchar `qa-voz-breve` (cap. 1 dura 14 s). 2) A los 3 s cortar la red (`Network.emulateNetworkConditions offline`). 3) Esperar a que termine el capítulo. 4) Volver la red y tocar ▶ (dos veces). 5) Tocar "Capítulo siguiente". — Variante: simular que el capítulo 2 responde `ERROR` en `/audio/estado`. | Al volver la red, ▶ reintenta el capítulo 2 (o se reintenta solo). | Queda "No se pudo hablar con la biblioteca." y **▶ no hace nada** (audio sigue en `cap-000`, `paused=true`). "Capítulo siguiente" **salta al cap. 3** (el 2 nunca se oye) y además lo deja en pausa. Con el capítulo en ERROR: mismo bloqueo, ▶ no hace nada. Reproducido 2 veces offline y 1 con ERROR simulado. Con pantalla bloqueada (iPhone) el botón ▶ de la pantalla de bloqueo tampoco hace nada. | `t08-offline-1.png`, `t08-offline-2.png`, `t08-fallo.png`; salida `t08.mjs offline` / `fallo` | `utils/motorAudio.ts:270-279`: un fallo de red pone `fase:'error'` sin reintento; `cargar()` ya había puesto `this.urls = {u1:null}` (línea 253), y `reproducir()` sale si `!this.urls.u1` (`motorAudio.ts:384-386`), así que ▶ queda muerto. `capituloSiguiente()` (`456-461`) suma desde `estado.capitulo`, que ya apunta al capítulo fallido. Arreglo: en fase `error`, `reproducir()` debe volver a llamar a `cargar(estado.capitulo, …)`; y/o reintentar con backoff mientras `navigator.onLine`. |
| **LV-03** | **Alta** | 1) Entrar con un token que caduca en 60 s (firmado con el SECRET de QA). 2) Escuchar el faro y volver a la ficha (mini reproductor). 3) Esperar a que caduque. 4) Entrar con `qa-lector2` en la misma pestaña. | Al caducar la sesión la voz se para (y se guarda el progreso con lo último válido); otra cuenta nunca ve el libro de la anterior. | Al caducar: pantalla "Tu sesión expiró", **la voz sigue sonando** (sin mini reproductor, sin forma de pararla salvo la pantalla de bloqueo) y cada guardado de progreso da **401** (se pierde lo escuchado). Al entrar `qa-lector2`: el **mini reproductor muestra "QA Lector: El faro de las palabras"** (libro de la otra cuenta) y la voz continúa. Reproducido 2 veces. | `t09-token.png`, `t09-otra-cuenta.png`; salida `t09.mjs` ("RED 401: progreso/save ×4", "otra cuenta: mini: QA Lector: El faro…") | `contexts/AuthContext.tsx:98-105` (cierre por caducidad) no llama a `motor.detener()`; solo lo hace el "Cerrar sesión" manual (`screens/ajustes/AjustesScreen.tsx:47`). `navigation/AppNavigator.tsx:158` oculta el mini pero el motor (`contexts/VozContext.tsx`) vive fuera de React y sigue. Arreglo: llamar `motor.detener()` (tras un último guardado con el token aún válido, si se puede) también en `registrarCierreDeSesion` y en `logout()`. |
| **LV-04** | Media | 1) Android lee hasta el 68 % (se sube al servidor). 2) iPhone (con su caché en 39 %) abre el libro: sale "Seguiste en Android hasta… ¿Ir allí?". 3) **Sin tocar nada**, volver atrás. 4) Abrir en un tercer navegador sin caché. | Abrir y cerrar sin leer ni contestar no cambia la posición del servidor (o el aviso persiste). | El servidor pasa a **39 % del iPhone con fecha nueva**; el tercer navegador abre en 39 % sin aviso. Reproducido 2 veces. | salida `t07.mjs abrircerrar` ("servidor tras abrir y cerrar sin tocar nada: … 39.24 … iPhone") | `screens/lector/LectorScreen.tsx:129-151`: el `relocate` inicial de foliate (motivo `navigation`/`null`, no un gesto del usuario) ya crea `ultimo.current` con `actualizadoEn = ahora`, y al desmontar `salir()` lo sube (`155-167`). Arreglo: no guardar hasta el primer movimiento del usuario (`page`/`snap`/`scroll`/selección) o mientras el aviso "¿Ir allí?" siga sin responder. |
| **LV-05** | Media | Tocar un resaltado o nota que cae en el 25 % izquierdo o derecho de la pantalla. | Se abre la hoja de la nota, sin pasar página. | Se abre la hoja **y además la página retrocede/avanza** (en la prueba saltó al capítulo anterior "Interludio vacío"); al cerrar la hoja ya no estás donde tocaste. Reproducido 2 veces. | `t04-02-toque-lateral.png`; salida `t04.mjs lado` | `components/lector/LectorFoliate.web.tsx:303-313`: el `click` del documento pasa página por zonas sin mirar si el toque cayó sobre una anotación (foliate emite `show-annotation` desde su propio listener, `public/foliate/view.js:404-410`). Arreglo: en el handler, comprobar `overlayer.hitTest(ev)` (o marcar el evento en `show-annotation`) antes de paginar. |
| **LV-06** | Media | Tocar una nota (o resaltado) en el texto. | Poder **editar** el texto de la nota y cambiar el color (requisito "editar/borrar nota"). | La hoja solo ofrece **Borrar**. Tampoco hay edición en "Mis notas" (solo navega). Para corregir una nota hay que borrarla y rehacerla (perdiendo su fecha). Confirmado 2 veces + código. | `t04-01-hoja-nota.png`; salida `t04.mjs ver` ("botones hoja: Borrar") | `screens/lector/LectorScreen.tsx:648-679` (hoja de anotación sin campo ni botón de editar); `screens/notas/NotasScreen.tsx` solo enlaza al lector. La API ya acepta `id` en `/anotaciones/save`. |
| **LV-07** | Media | 1) Con la voz **sonando**, cambiar de voz en el reproductor a una que aún no tiene el capítulo generado. | Sigue sonando la voz actual hasta que la nueva esté lista (o aviso con tiempo estimado). | La lectura **se calla** mientras se genera la nueva voz: 20 s con la cola vacía (Tomás) y **más de 2 min** con la cola ocupada por otros usuarios (Elvira). Si mientras tanto vuelves a la voz anterior, queda en pausa (no reanuda). Reproducido 2 veces. | salidas `t05.mjs` (Elvira) y `t15.mjs` (Tomás) | `utils/motorAudio.ts:502-509` `setVoz` llama a `cargar()`, que pausa el `<audio>` (línea 264) antes de saber si la nueva voz está LISTA; `sonando` se calcula con la fase del momento (si estaba `preparando`, al volver queda en pausa). |
| **LV-08** | Media | En **modo continuo**, con la voz sonando y el lector abierto, tocar "Página siguiente" (o la flecha → del teclado) para hojear. | Se puede hojear; aparece "↩ Volver a la voz". | La vista avanza y **a los ~1-3 s vuelve sola a la frase que suena**; "Volver a la voz" **nunca aparece**. (En modo paginado sí funciona; con la rueda/arrastre en continuo también.) Reproducido 2 veces (botón y teclado). | salida `t13.mjs 1500 boton continuo` (relocates con motivo `null`) | En foliate, `#scrollNext/#scrollPrev` en modo `scrolled` llaman a `#scrollTo(…, null, true)` (`public/foliate/paginator.js:1029, 1041`) → `relocate` con `reason: null`; `LectorFoliate.web.tsx:325-329` solo deja de seguir la voz con `page`/`snap`/`scroll`, y la línea 321 tampoco hace sonar la página. Arreglo: tratar `null` en `siguiente()/anterior()` como gesto del usuario (p. ej. marcar `siguiendo=false` dentro de `siguiente/anterior` del `useImperativeHandle`). |
| **LV-09** | Media | Cambiar de voz (o ir a un capítulo sin audio) **con la voz en pausa**; esperar a que el taller lo genere. | Al quedar listo desaparece "Preparando…". | El audio de la nueva voz ya está cargado (`edge.es-CO-GonzaloNeural/cap-000.m4a`) pero el reproductor y el mini siguen diciendo **"Preparando la voz de Gonzalo…" indefinidamente** (4+ min) hasta que se toca ▶. Reproducido 2 veces (Ximena y Gonzalo). | salidas `t15.mjs` (Ximena, 14:54) y `t16.mjs` (Gonzalo) | `utils/motorAudio.ts:362`: cuando el audio queda LISTO sin reproducir, `ponerFuente` pone `fase:'pausado'` pero **no limpia `mensaje`**. Añadir `mensaje: null`. |
| **LV-10** | Baja | Abrir el lector en una página que no empieza con título (cualquier página intermedia), con las barras visibles. | La primera línea se ve entera. | La **barra superior tapa media primera línea** del texto (p. ej. "luz del faro. La Sra. Pérez llegó a las 7:30" cortada). Visto en 3 capturas distintas. | `t03-01-cap1-pB.png`, `t12-01-desde-aqui.png`, `t12-02-lejos.png` | `screens/lector/LectorScreen.tsx:262-268` barra `position:absolute` de ~52 px sobre el libro, y foliate con `margin` de 40 px (`LectorFoliate.web.tsx:196`). Subir el margen superior a la altura real de la barra (o reservarla cuando `cromo` está visible). |
| **LV-11** | Baja | Al hojear el libro (pasar 3 páginas o ir a un %), mirar la red. | 1 guardado cada 15 s como dice el comentario. | **7-8 POST `/progreso/save` en 5 s**: cada `relocate` programa su propio `setTimeout(subir, 15000)` mientras `ultimoServidor` sigue en 0. Visto en las 4 ejecuciones de `t07.mjs`. | salida `t07.mjs` ("saves de progreso: 8") | `screens/lector/LectorScreen.tsx:150`. Guardar un único temporizador en un `useRef` (si ya hay uno pendiente, no programar otro). |
| **LV-12** | Baja | Saltar con el índice / buscar / ir a %. | El botón "↶ Mi posición anterior" desaparece al cabo de un rato o tras usarlo. | Queda **fijo indefinidamente** en mitad de la página tapando texto (mientras haya historial). | `t01-06-tras-buscar.png`, `t02-04-cap4-pA.png` | `screens/lector/LectorScreen.tsx:395-402` se muestra mientras `history.canGoBack`. |
| **LV-13** | Baja | Aviso de conflicto entre dispositivos. | Texto claro. | "Seguiste en Android hasta **el capítulo 4 «Capítulo 4: El invierno largo»** (68 %)": nombre duplicado y el % es del **libro**, no del capítulo, aunque se lea como del capítulo. Visto en las 4 pruebas de conflicto. | salida `t07.mjs` | `logica/progreso.ts:84-89` `describirPosicion`: omitir "el capítulo N" cuando el título ya lo incluye y decir "68 % del libro". |

## 3. Hallazgos PLAUSIBLES (vistos una vez o solo por código)

| ID | Sev. | Qué | Por qué es plausible | Dónde |
|---|---|---|---|---|
| LV-P1 | Media | **La fecha del progreso la pone el cliente**: un dispositivo con el reloj adelantado gana siempre "el más reciente". Al simular un reloj +11 min en una pestaña, sus guardados bloquearon durante esos 11 min los de las demás (el servidor guardó `cap 5` "del futuro" y los progresos reales posteriores no lo reemplazaron). | Visto una vez (efecto lateral de la prueba de temporizador con reloj adelantado). | `logica/progreso.ts`, `utils/motorAudio.ts:623`, `LectorScreen.tsx:146`; contrato §9 "actualizadoEn lo pone el cliente". Mitigación: el servidor podría acotar `actualizadoEn` a su propio `now()`. |
| LV-P2 | Media | **"Preparando la voz…" sin tiempo estimado y en la misma cola que todos**: el capítulo largo (32 min de voz) que el usuario pidió esperó **7 min 36 s** detrás de trabajos de voz de otros QA; mientras tanto la web hizo 149 sondeos. Para Anderson/Samy, con varios libros encolados, el primer "▶" puede tardar minutos sin explicación. | Medido una vez (depende de la carga de la cola). | `utils/motorAudio.ts:311-316` (sondeo cada 3 s); prioridad en biblioteca-service/taller (contratos §7). Sugerencia: prioridad máxima para el capítulo que se está pidiendo para escuchar ya, y mostrar "N trabajos delante". |
| LV-P3 | Baja | Desde la pantalla `/escuchar/B`, si suena el libro A, los controles de voz, velocidad, ±15 s y capítulo actúan sobre **A** (`motor.setVoz`, `motor.capituloSiguiente`… no comprueban `esteLibro`). | Solo por código. | `screens/reproductor/ReproductorScreen.tsx:149-181, 248-256`. |
| LV-P4 | Baja | En modo continuo, "Página siguiente" al final del libro lanza `TypeError: Cannot read properties of undefined (reading 'load')` en `paginator.js:1013`. | Visto una vez (en la sección "Notas", final del libro). | `public/foliate/paginator.js:1013` vía `View.next`; `LectorFoliate.web.tsx:462` no captura el rechazo. |
| LV-P5 | Baja | Libros sin portada: Media Session queda sin `artwork` (pantalla de bloqueo sin imagen). `setPositionState` usa la duración del **archivo** (con 2x, la pantalla de bloqueo muestra la mitad de duración). | Código + `navigator.mediaSession` leído en la prueba (`art: []`). | `utils/motorAudio.ts:665-673` y `706-716`. |
| LV-P6 | Baja | El deslizador de avance llama a `onSoltar` en **cualquier** `keyup` (incluido Tab al enfocarlo) → salto a la posición redondeada a 0,1 %. | Solo por código. | `components/atoms/Deslizador.web.tsx` (`onKeyUp={() => onSoltar(local)}`). |

Notas fuera del alcance lector/voz (para el QA de conversión): el DOCX pierde el párrafo de estilo *Título* ("QA Documento Word") y el título del libro queda como el nombre del archivo ("qa lector word"). La nota al pie "1" queda pegada en el texto visual ("según la nota1.") aunque la voz la omite (correcto para la voz).

---

## 4. Lo que SÍ funciona (verificado)

**Lector**
- Abrir EPUB, PDF, TXT y DOCX convertidos; índice con los 6 capítulos, incluido el título raro con `& < > « » ¿ ¡ Ñ` sin romperse; el capítulo vacío aparece y se puede abrir.
- Salto a capítulo desde el índice, **"↶ Mi posición anterior"** vuelve exactamente al CFI previo.
- Página siguiente/anterior (botones, teclado), **ir a %** (50 % → 53,6 %), **deslizador** con vista previa (20 % → 21,3 %).
- **Buscar**: "SEMÁFORO-AZUL" → 1 resultado y lleva a la página con la coincidencia marcada; "luz del faro" → 50 resultados.
- Papel (Marfil/Pergamino/Noche), letra (Literata/EB Garamond/Lora), tamaño, márgenes, interlineado, **modo paginado y continuo**; las preferencias persisten al recargar.
- **Seleccionar → resaltar en los 5 colores**, nota (con comillas y raya en el texto), **copiar** (el portapapeles recibe el texto exacto), "escuchar desde aquí".
- Las notas **reaparecen** al recargar, en otro perfil/dispositivo (Android) y **siguen sobre su texto tras cambiar tamaño (110→160 %) y letra** (re-anclaje correcto en su propio capítulo). Borrar funciona.
- Aislamiento: `qa-lector2` no puede ver ni tocar el libro, notas, progreso ni binarios (`libro.epub`, `.m4a`) de `qa-lector` (respuestas 102 / 404).

**Progreso**
- **Retomar exacto desde el servidor sin caché**: perfil nuevo abre en el mismo CFI (`/6/8!/4,/48/6[c003-s00094]…`) que dejó el otro.
- **Conflicto entre sesiones**: "Seguiste en Android hasta … ¿Ir allí?" aparece en ambos sentidos; "Ir allí" lleva exactamente a la posición del otro.
- Al recargar en medio de la voz el `pagehide` sube la posición (11,75 s) y ▶ retoma ahí.
- Voz ↔ lectura: tras escuchar, el lector abre en la página de la frase que sonaba; "Escuchar" desde la ficha arranca en la frase donde ibas leyendo.

**Voz**
- Estado "Preparando la voz de Álvaro…" mientras el taller genera; los toques repetidos en ▶ y cambiar a 3x mientras prepara no rompen nada.
- **Velocidades** (archivo y `playbackRate` correctos, posición conservada al cruzar 2,5x):
  1x→`cap-000.m4a` r1 · 2,5x→1x r2,5 · 3x→`-2x.m4a` r1,5 · 4x→2x r2 · 5x→2x r2,5 · 2x→1x r2 · 0,5x→1x r0,5. Al cruzar 2,5x↔3x la posición 1x es continua (42,2 s → 47,0 s tras 2 s a 2,5x).
- **Sincronía del resaltado** (muestreo a 60 fps contra `tiempos.json`):
  - 1x (`qa-voz-breve`, 3 capítulos): frase 98,6 %, **palabra 97,7 %**; los fallos son de 1 fotograma (~20 ms) en el cambio de palabra/frase y ~150 ms al cambiar de capítulo.
  - 2x (faro cap. 1): frase **100 %**, palabra **99,8 %**.
  - 3x: frase 99,5 %, sin resaltado de palabra (como dice el plan).
  - Las palabras con abreviaturas (Sr.→señor, EE. UU.→Estados Unidos) se resaltan sobre el texto visual correcto.
- **Paso de página automático**: la frase que suena siempre estuvo en la página visible; **avance automático** de capítulo (Uno→Dos→Tres) con el lector siguiéndolo; "Fin del libro." al acabar.
- ±15 s, frase siguiente/anterior (cae en el `t0` de la frase), capítulo siguiente/anterior; 6 toques rápidos en "capítulo siguiente" terminan en el último sin errores; 8 en "anterior" vuelven al primero.
- **Temporizador**: cuenta atrás, fundido (volumen 0,26 a 6 s del final), se apaga con "El temporizador apagó la voz. Que descanses."; ▶ vuelve con volumen 1. "Quitar" funciona.
- **Pausa larga** (>5 min, reloj adelantado): al reanudar retrocede a la frase anterior (46,4 s → 41,3 s); pausa corta no retrocede.
- Cambiar de voz **con la voz sonando** reanuda sola en la misma frase cuando la nueva voz está lista (ver LV-07 para el silencio intermedio).
- **Mini reproductor** visible al navegar (ficha, biblioteca, lector) con título, capítulo y velocidad.
- **Media Session**: título = capítulo, artista = autora, álbum = libro, `playbackState` playing/paused correcto.
- "Escuchar desde aquí" desde la selección arranca en la frase elegida (`c000-s00017`) y la resalta; el botón de auriculares de la barra arranca en la primera frase visible.

## 5. No verificado (y por qué)
- **Dos pestañas sonando a la vez**: la prueba quedó sin concluir (la segunda pestaña esperaba la generación de otra voz). Por código, cada pestaña tiene su propio motor y ambas sonarían y se pisarían el progreso.
- **Pantalla bloqueada real en iPhone/Android** y botones físicos de auriculares: Chrome sin cabeza no lo permite; la Media Session se comprobó solo en metadatos/estado.
- **Libro aún convirtiéndose (estado real)**: la conversión de los libros de prueba tarda segundos; el mensaje `CONVIRTIENDO` solo se comprobó por código (`motorAudio.ts:311-315`).
