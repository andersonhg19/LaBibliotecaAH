# QA de regresión de la web (UX, diseño, lector/voz y biblioteca) — La Biblioteca AH

- **Fecha:** 2026-11-11 (13:30–15:40) · **Rol:** QA senior de regresión UX/diseño/reproducción web · **Instancia:** QA en casa, web `http://localhost:4100` (export de producción con su CSP real), gateway `:9920`.
- **Método:** Chrome sin cabeza EN CASA conducido por CDP (puerto 9361), emulando iPhone 390×844 (DPR 3, táctil, UA Safari), Android 412×915 (DPR 2,625, táctil, UA Chrome), PC 1440×900 (ratón) e iPhone en horizontal 844×390. Gestos táctiles reales (`Input.dispatchTouchEvent`), clics de ratón reales, selección de texto dentro del iframe de foliate, selector de archivos interceptado, red cortada con `Network.emulateNetworkConditions`, sesión revocada desactivando la cuenta desde la API de administración. Auditoría automática por pantalla (objetivos < 44 px, nombres accesibles, desbordes, scroll horizontal, letra < 12 px), consola (incluidas violaciones de CSP) y revisión visual de cada captura.
- **Cuentas:** `anderson` / `<clave>` (entrada por alias), `qa-ux@biblioteca.ah`, `qa-ux-300@biblioteca.ah`, `admin@biblioteca.ah` (solo lectura salvo desactivar/reactivar `qa-rw2`) y dos mías creadas por la API de administración (el registro público está cerrado): **`qa-rw@biblioteca.ah`** (alias `qarw`) y **`qa-rw2@biblioteca.ah`** (alias `qarw2`), clave `<clave-qa>`. `qa-rw` tiene 7 libros (dos en inglés: `keeper-en.epub` y `clockmaker-en.epub`, un EPUB de 5 capítulos generado para esta prueba), notas, colecciones y un deseo; `qa-rw2` tiene 2 libros + 32 documentos (para BI-02).
- **Scripts y capturas en casa:** `C:\srv\biblioteca-ah-qa\qa\regresion-web\` (`h.mjs` arnés, `api.mjs`, `b1–b3.mjs` API, `u1–u13.mjs` recorridos, `salida-*.txt`, `capturas\*.png`). Copia de las capturas en el scratchpad de la sesión (`...\scratchpad\qa\regresion-web\`).
- **Criterio:** PASA = se reprodujo el caso original y ya no ocurre (al menos 2 veces o en 2 tamaños/cuentas, salvo que se diga). FALLA = sigue ocurriendo o solo se arregló en parte. N-A = no aplica a la web o no se pudo ejecutar (se dice por qué).

## Resumen

La ronda de arreglos es **muy buena**: de 77 hallazgos revisados pasan 63, y lo nuevo (mueble con lámpara, atril, tema de día con madera, Mis notas como cuaderno, colecciones, «Ya lo tengo», traducción de selección y de capítulo, reproductor con deslizador y reintento, lector tipo papel) funciona y se ve de otra categoría. La consola queda limpia salvo una violación de CSP, no hay scroll horizontal ni objetivos < 44 px (salvo la cinta del marcador) y los tiempos son buenos (estantería con libros en ~0,32 s, texto del lector pintado en 0,39–0,53 s, traducción de una frase en 0,28 s, capítulo traducido en 1,8–2,6 s).

Lo que hay que arreglar antes de llevarlo a producción:

1. **RW-01 (bloqueante, ya corregido en QA durante la sesión):** el gateway desplegado al empezar rechazaba el preflight CORS (403): **nadie podía entrar desde la web**. Se probó con `--disable-web-security` mientras tanto; a las ~15:20 el gateway de QA se reconstruyó y entrar vuelve a funcionar sin trucos. Hay que confirmarlo en producción.
2. **RW-02 (alta):** en el **teléfono no se puede volver a mostrar la barra del lector**: al tocar el centro aparece 0,4 s y se va sola. Sin barra no hay Volver, Índice, Ajustes, Buscar ni Escuchar.
3. **LV-05 (media):** tocar un resaltado en el borde izquierdo **sigue pasando la página** (3 de 3 en el PC) y no abre la nota.
4. **RW-03 (media):** la CSP bloquea el silencio `data:audio/wav` que desbloquea el audio en iOS. Da un error en la consola y en un iPhone real el primer ▶ puede quedarse sin sonar (PLAUSIBLE).
5. **RW-04 (media):** el aviso («En favoritos», «Guardado») tapa la cabecera y el botón Volver durante 3 s, y el toque se pierde.

**Conteos:** UX 30 → **26 PASA / 4 FALLA / 0 N-A**. LV 19 (13 + 6 plausibles) → **12 PASA / 2 FALLA / 5 N-A**. BI de la web 28 → **25 PASA / 0 FALLA / 3 N-A** (con una salvedad del backend en BI-15, abajo). **Regresiones nuevas: 9** (RW-01…RW-09).

## 1. Verificación de los hallazgos originales

Evidencias: `capturas\` en casa (nombre de archivo) y `salida-*.txt` (línea citada).

### 1.1 UX / diseño (`qa-ux-diseno.md`)

| ID | Resultado | Evidencia y detalle |
|---|---|---|
| UX-01 | PASA | «Todo» es la primera pestaña y está activa a la vista en 390/412/1440 (`Todo:true@16-85`); Deseos/Documentos activas también visibles. `u1-catalogo-*.png` (ver RW-05 sobre el degradado). |
| UX-02 | PASA | La barra se esconde al abrir y la primera línea empieza en y=56 (iPhone) / 64 (PC); con la barra visible en el PC (0–56) no tapa el texto. `u3-inicial-*`, `u3-barra-vuelve-pc.png`. |
| UX-03 | PASA | La tarjeta propia dice «Es tu cuenta: no puedes desactivarte a ti mismo.»; las demás piden confirmación. `u6-admin-usuarios-iph390.png`. |
| UX-04 | PASA | `aria-selected` en pestañas (`true/false`), `aria-checked` en Estantería/Catálogo y en los filtros de Mis notas. |
| UX-05 | PASA | No se ve la costura en ninguna captura de 390, 412 ni 1440 (noche y día); `theme/madera.ts:8-24` documenta el arreglo. |
| UX-06 | PASA | Lomos de 45–50 px en el móvil y 48–54 px en el PC (antes 22–29). `u1-estanteria-*.png`. |
| UX-07 | PASA | 5 estrellas de 44×44; al tocar otra vez la misma queda media estrella y hay un botón «Quitar la calificación». |
| UX-08 | PASA | Con 40 libros: «Recién llegados 24 de 40» y «Ver todos ›», que abre el catálogo (40 libros). `u6-ux08.png`. |
| UX-09 | PASA | La primera página del PDF va dentro de una tapa de cuero con filete. `u1-estanteria-iph390.png`, `u1-catalogo-pc.png`. |
| UX-10 | PASA | El título largo queda en 4 líneas (24 px) con «Ver el título completo». `u2-ficha-largo-iph390.png`. |
| UX-11 | PASA | Antes de sonar se ve «—:—» (ya no sale «-0:00»); luego «quedan 0:12 a 1x» y «Del libro quedan 1 min»; el mini tiene cerrar (44×44). `u4-sonando.png`, `u11-mini.png`. |
| UX-12 | **FALLA** (mejoró en parte) | En 844×390 la cabecera ya es compacta, pero en el catálogo la búsqueda, las pestañas y las herramientas ocupan ~280 de 390 px (las portadas empiezan en y≈280) y en la estantería la lámpara y la cornisa se comen ~55 % de la altura. `u1-horizontal-estanteria.png`, `u1-horizontal-catalogo.png`. Causa: `BibliotecaScreen.tsx` (sin versión apaisada) y la lámpara/cornisa de `components/estanteria/Mueble.tsx`/`Lampara.tsx`, que no cambian de alto. |
| UX-13 | PASA | El resaltado de la búsqueda es miel (`rgba(217,163,91,…)`), no rojo; en el PC se limpia al cerrar (0 overlays). `u3-buscar-*.png`. |
| UX-14 | **FALLA** (residual, baja) | Las pantallas ya son de la casa y el texto propio de la web está corregido («Año», «Entró», «tú»). Quedan textos que vienen del backend: «Entro con los roles [ADMIN, USER]» en Auditoría (`auth-service/.../AuthenticationServiceImpl.java:100`) y «Administra usuarios, roles y modulos de la plataforma» en Roles (`auth-service/.../db/migration/V2__semilla.sql:18`). `u6-admin-*.png`. |
| UX-15 | PASA | `/manifest.webmanifest` (200, iconos 192/512), `apple-touch-icon` 180, `viewport-fit=cover` y `theme-color`. |
| UX-16 | PASA | El tema de día conserva la madera (roble claro) y el mueble. `u1-dia-estanteria-pc.png`, `u1-dia-ficha-iph390.png`. |
| UX-17 | PASA | «La contraseña es obligatoria.» / «El correo o usuario es obligatorio.» |
| UX-18 | PASA | «1 documento». |
| UX-19 | PASA | «7 libros», «1 documento», «3 deseos». |
| UX-20 | PASA | El deseo usa un lazo, no la estrella (`u2-deseo-iph390.png`). |
| UX-21 | PASA | Cifras modernas en contadores, % y tiempos (19 usos de `fontVariant`). |
| UX-22 | PASA | «Nada coincide con «zzzzqqq»» + «Limpiar la búsqueda». |
| UX-23 | PASA | `/leer/xxxx` → «No se pudo abrir el libro. No se encontró el libro.» con Reintentar/Volver. |
| UX-24 | PASA (con nota) | En el móvil el texto va alineado a la izquierda (sin ríos de espacios); en el PC va justificado con `hyphens:auto` y `lang=es`. Los PDF sin índice siguen con «Páginas X–Y», que es así por diseño del taller. |
| UX-25 | PASA | Vacíos con invitación y botón («Elegir un libro», «Traer libros»); el atril vacío queda en una línea. `r0-biblioteca-iph390.png`. |
| UX-26 | PASA | Al sacar el libro con el dedo se ve nítido, la tapa queda dentro de la pantalla y abre la ficha. `u6-sacar-*.png`. |
| UX-27 | PASA | Contraste mínimo del dorado del lomo sobre todos los cueros: **4,87:1** (`logica/lomos.ts`). |
| UX-28 | **FALLA** (baja) | Los estados ya van en una sola fila, pero en 390 y 412 se lee «**Abandon…**» (cortado). `r1-libro-…-iph390.png`, `u2-ficha-largo-iph390.png`. Causa: «Abandonado» (`logica/formato.ts:53`) en un segmento de 87 px. |
| UX-29 | PASA | La pestaña Datos dice «Estos datos los corregiste a mano.» y las ayudas son humanas («Si son varios, sepáralos con comas»). |
| UX-30 | **FALLA** (baja) | La ficha numera la portadilla «01 El jardín de los senderos de prueba» y «02 Capítulo 1…»; el índice del lector empieza en «Capítulo 1» (`u7-indice-jardin.png`, `salida-u7` «UX-30»). Causa: `FichaLibro.tsx:419` (`c.indice + 1` sobre todos los capítulos) frente al TOC de foliate. |

### 1.2 Lector y voz (`qa-lector-voz.md`)

| ID | Resultado | Evidencia y detalle |
|---|---|---|
| LV-01 | PASA | El faro tiene notas en los capítulos 2, 3, 4 y 5 (4 en el cap. 4 con citas que también existen en el cap. 1). Con un perfil Android limpio y el libro abierto en el cap. 1: **0 overlays**. `u8-lv01-cap1.png`. |
| LV-02 | PASA | Con la voz sonando se corta la red y se toca «Capítulo siguiente»: «⚠ Sin conexión con la biblioteca. Se reintentará sola; o toca ▶ para probar ya.» y botón **Reintentar**. Al volver la red **suena sola el capítulo pedido** (cap-004, no se salta). `u7-sin-red.png`. |
| LV-03 | PASA | Se desactiva `qa-rw2` mientras suena: la web va a `/entrar` con «Tu sesión expiró…», **la voz se para** y el mini desaparece. `u7-sesion-revocada.png`. |
| LV-04 | PASA | El «Android» sube 68 %; el iPhone abre, ve el aviso y sale sin tocar: el servidor sigue en **68 % Android** (antes pasaba al 39 %). |
| LV-05 | **FALLA** (media) | En el PC se resalta una frase entera con el menú y se hace clic en su segundo renglón, en el 25 % izquierdo: **no se abre la nota y la página retrocede** (0,2444→0,1412 y 0,9842→0,9667; con u3 0,5539→0,4508). 3 de 3. El toque en el centro del resaltado sí abre la hoja. `u10-lv05-*.png`. Causa probable: `LectorFoliate.web.tsx:449-465`; `overlayer.hitTest(ev)` no encuentra el resaltado cerca del margen, así que `accionDelToque` (`gestos.ts:14-25`) devuelve 'anterior'. Habría que comprobar el rango de la anotación (`range.getClientRects()` contra el punto) además del `hitTest`. |
| LV-06 | PASA | Al tocar un resaltado se abre la hoja con «TU NOTA» editable, los colores, «Guardar cambios» y «Borrar» (iPhone y PC). En Mis notas el menú ⋯ cambia el color (servidor `#B3A6D1`) y edita la nota (servidor «Nota editada en regresión»). `u7-hoja-nota-*.png`, `u7-notas-editada.png`. |
| LV-07 | PASA | Con la voz sonando se pasa de Álvaro a Tomás: **1 muestra en silencio de 107** (55 s mientras se generaba). Siguió sonando Álvaro y empalmó con Tomás en la misma posición. |
| LV-08 | N-A | No logré activar «Desplazamiento continuo» desde el script (el chip no respondió al clic sintético). Por código, `gestos.ts:27-44` abre la ventana de gesto del usuario. Pendiente de una prueba manual. |
| LV-09 | PASA | En pausa se cambia a Ximena: a los 6 s el aviso está vacío y el audio cargado es de Ximena (ya no se queda en «Preparando…»). |
| LV-10 | PASA | Igual que UX-02. |
| LV-11 | PASA | **1** `POST /progreso/save` tras pasar 3 páginas en ~8 s (antes 7–8), en el iPhone y en el PC. |
| LV-12 | PASA (por código) | `LectorScreen.tsx:182-188` oculta «Mi posición anterior» a los `volverSeVaMs`. No lo reproduje en vivo porque los capítulos del índice no se dejaron pulsar por texto en el script. |
| LV-13 | PASA | «Seguiste en Android hasta el capítulo 4 «Chapter Four: …» (68 % del libro). ¿Ir allí?»; si el título ya empieza por «Capítulo» no repite el número (`logica/progreso.ts:88-94`). |
| LV-P1 | PASA | Igual que BI-05. |
| LV-P2 | N-A | Depende de la cola del taller. Hoy, con el audio ya generado, suena en 0,6–1,1 s. |
| LV-P3 | N-A | No probado (dos libros a la vez). |
| LV-P4 | N-A | No probado (final del libro en modo continuo). |
| LV-P5 | N-A | Media Session / pantalla de bloqueo: no se puede comprobar en Chrome sin cabeza. |
| LV-P6 | **FALLA** (baja, por código) | `components/atoms/Deslizador.web.tsx:73` sigue con `onKeyUp={() => onSoltar(local)}`: cualquier tecla (también Tab al enfocar) salta a la posición. |

### 1.3 Biblioteca en la web (`qa-biblioteca.md`)

| ID | Resultado | Evidencia y detalle |
|---|---|---|
| BI-01 | PASA | Se retira «El faro» con nota, diario, calificación, favorito, género y progreso; al volver a subir el mismo EPUB reaparece **con el mismo id**, nNotas 1, diario, 4★, ♥, «Poesía» y progreso 42 %. El diálogo ahora dice la verdad («…se guardan: si vuelves a traer el mismo archivo, reaparecen»). `salida b1/b2`. |
| BI-02 | PASA | `qa-rw2` con 2 libros + 32 documentos: «Recién llegados 2 libros» con sus portadas (iPhone, Android, PC). `u1-bi02-recientes-*.png`. |
| BI-03 | PASA | En el teléfono: Estantería → ficha → «Leyendo» y ♥ → Volver: «Leyendo ahora 5→6», «Favoritos 4→5» sin recargar. `u10-bi03.png`. (Ver RW-04: si se toca Volver antes de 3 s, lo tapa el aviso.) |
| BI-04 | PASA | «Tus colecciones»: crear («Para el viaje»), renombrar y retirar (con confirmación) desde la web, con elección de madera. `u5-colecciones-*.png`. |
| BI-05 | PASA | Con un guardado a +1 h y otro a la hora buena gana el último (55 %, «pc»). |
| BI-06 | PASA | En el PC, un clic de ratón en la flecha › de Favoritos manda **1** `POST /ordenar`. |
| BI-07 | PASA | «Quitar la calificación» deja `null` en el servidor; `calificacion:null` por API también. |
| BI-08 | PASA | `anio:null` vacía el año. |
| BI-09 | PASA | 5 favoritos concurrentes y 4 «agregar a colección» concurrentes: todos `correct:true`. |
| BI-10 | PASA | Doble clic real en «Anotar en el diario» ×3 → 3 entradas (no 6); 3 envíos API simultáneos → 1. |
| BI-11 | PASA | El orden es igual antes y después de recargar («tres, dos, uno»). |
| BI-12 | PASA | La pestaña Todo solo trae `LIBRO`; los documentos van aparte. |
| BI-13 | PASA | Facetas por pestaña (`LEIDOS` → autores `[]`). |
| BI-14 | PASA | Se crea un género nuevo con la hoja de filtros abierta; al cerrarla y abrirla aparece sin recargar. |
| BI-15 | PASA en la web (salvedad en el backend) | La ficha del deseo muestra ISBN, «Tu nota: Regalo de cumpleaños», **«Ya lo tengo»** y «Dónde conseguirlo». «Ya lo tengo» con un archivo real: el deseo se cumple, entra el libro y la pestaña Deseos queda vacía (`u12-*.png`). **Salvedad:** por API, `libros/save {tipo:'LIBRO'}` todavía convierte un DESEO en «libro» sin archivo (`LibroServiceImpl.java:283-287` solo valida DESEO-con-archivo). |
| BI-16 | PASA | Subir algo repetido → «Ya tenías en tu biblioteca: "qa-voz-breve.epub".» y `yaLoTenias:true`. |
| BI-17 | N-A | Conversión .DOC en el taller (fuera de la web). |
| BI-18 | PASA | 99999 → «anio debe estar entre -3000 y 2100». El rango admite años a. C. a propósito. |
| BI-19 | PASA | Pistas «Desde=0 · Hasta=2026» (de la más antigua a la más nueva) y aviso de rango invertido en `Catalogo.tsx:455`. |
| BI-20 | PASA | Borrar una entrada del diario pide confirmación («¿Borrar la entrada del 11 nov 2026? No se puede deshacer.»). Al cancelar siguen las 3. |
| BI-21 | PASA | «"vacio.txt": el archivo está vacío.» |
| BI-22 | PASA | «1 documento», «3 deseos», «24 de 40». |
| BI-23 | PASA | «Novela» y «novela» se juntan en una sola faceta (n=2). |
| BI-24 | N-A | Orden por apellido: no lo probé en esta ronda. |
| BI-25 | PASA | Sinopsis de 300 KB → «no puede superar los 10000 caracteres»; 500 etiquetas → «más de 50 elementos». |
| BI-26 | PASA | «Ñandú informe» va al cajón **Ñ**. `u2-documentos-*.png`. |
| BI-27 | PASA | Leído → Por leer deja `fechaFin` en null. |
| BI-28 | N-A | No medí el doble POST con el dedo (sí el clic de ratón, BI-06 = 1). |

## 2. Regresiones y hallazgos nuevos (RW)

| ID | Sev. | Estado | Qué pasa | Pasos | Evidencia | Causa (archivo:línea) |
|---|---|---|---|---|---|---|
| **RW-01** | Bloqueante | CONFIRMADO; **corregido en QA a las ~15:20** | El gateway devolvía **403 al preflight CORS** desde `http://localhost:4100`: la web no podía ni entrar («Access to XMLHttpRequest … blocked by CORS policy»). | Abrir `/entrar` y entrar con cualquier cuenta (13:35–15:10). | `curl -X OPTIONS … -H Origin: http://localhost:4100` → 403 (varias veces); a las 15:35 → 200 y `r0.mjs` entra sin `--disable-web-security`. | El cambio de `backend/gateway-service/src/main/resources/application.yml` metió `loadbalancer:` justo antes de `globalcors:`, y `globalcors` quedó colgando de `spring.cloud.loadbalancer` (el `diff` lo enseñaba así). A las 14:34 el archivo ya estaba arreglado (`globalcors` en la línea 45, bajo `gateway`) y el gateway de QA se reconstruyó. **Comprobar el preflight en producción antes de desplegar** y añadir una prueba de CORS al gateway. |
| **RW-02** | Alta | CONFIRMADO (iPhone y Android, 2 toques cada uno) | En el teléfono, tocar el centro de la página **no vuelve a mostrar la barra del lector**: aparece y a los ~0,4 s se va. Sin barra no hay Volver, Índice, Ajustes (ni «Ver en español»), Buscar, Marcar ni Escuchar. En el PC funciona. | Abrir un libro en el móvil, esperar 4 s a que se oculte la barra y tocar el centro. | `salida-u9.txt`: click a los 77 ms, `relocate:snap` a los ~540 ms y opacidad de la barra 0 → 0,98 → 0. Igual con un barrido hacia abajo. | foliate llama a `snap()` en **cada** `touchend`, incluso en un toque (`public/foliate/paginator.js:853-862`), y emite `relocate` con motivo `'snap'`. `LectorScreen.tsx:208-211` lo toma como pasar página y hace `setCromo(false)`. Arreglo: ocultar solo si cambió la ubicación (cfi/fracción distinta) o no tratar `'snap'` sin desplazamiento como gesto. |
| **RW-03** | Media | CONFIRMADO (consola, 4 ejecuciones); efecto en iOS PLAUSIBLE | Violación de CSP en cada reproducción: «Loading media from 'data:audio/wav;base64,UklGRiQ…' violates … media-src». Ese silencio es el que «desbloquea» el `<audio>` en iOS dentro del toque del usuario. Bloqueado, en Safari el `play()` que llega después de esperar al servidor puede ser rechazado y el primer ▶ no suena. | Tocar Escuchar o ▶. | `salida-u7/u8/u11` (consola). | `frontend/public/serve.json:90` (`media-src 'self' blob: https: …`, sin `data:`) frente a `utils/motorAudio.ts:107` (`SILENCIO = 'data:audio/wav…'`) y `:296-305` (`desbloquear`). Añadir `data:` a `media-src` o servir el silencio como archivo propio (`/silencio.wav`). |
| **RW-04** | Media | CONFIRMADO (2 veces) | El aviso («En favoritos», «Guardado») se pinta **encima de la cabecera** durante 3 s y se come el toque en Volver: el primer Volver tras marcar ♥ no hizo nada. | Ficha → ♥ → tocar Volver antes de 3 s. | `u10-toast-sobre-volver.png` (`elementFromPoint(30,28)` = «En favoritos»); `salida-u11` (Volver sin efecto). | `components/organisms/ToastContainer.tsx:28-34` (`top: 20`, `zIndex: 9999`, ancho completo) + `contexts/ToastContext.tsx:31` (3 s). Moverlo abajo (encima del mini o de la barra inferior), dejarlo pasar toques fuera de la píldora y estrecharlo. Además usa un verde menta genérico que no es de la casa. |
| **RW-05** | Baja | CONFIRMADO (390, 844 apaisado, 1440) | El degradado de la fila de pestañas del catálogo sale como un **bloque oscuro plano** sobre la madera y aparece aunque no haya nada que desplazar (PC). | Catálogo en el PC. | `u1-catalogo-pc.png` (rectángulo en x≈1390), `u1-horizontal-estanteria.png`. | `screens/biblioteca/Catalogo.tsx:236-243` y `:544` (degradado a `colors.background` liso, siempre visible). Usar `mask-image` en el ScrollView, o mostrarlo solo si `scrollWidth > clientWidth`. |
| **RW-06** | Baja | CONFIRMADO | Se ofrece «**A→es Traducir**» también en libros en español. | Seleccionar texto en «El faro». | `u3-menu-seleccion-iph390.png`. | `LectorScreen.tsx:782-797` (sin la condición `ofrecerTraduccion` que sí usa la hoja de ajustes, `:1037`). |
| **RW-07** | Baja | CONFIRMADO | La ficha de un **deseo** muestra «Leer» y «Escuchar» (apagados) debajo de «Ya lo tengo / Dónde conseguirlo»: 4 botones grandes donde solo sirven 2. | Abrir un deseo. | `u2-deseo-iph390.png`. | `FichaLibro.tsx:338-356` (los botones no se ocultan con `esDeseo`). |
| **RW-08** | Baja | CONFIRMADO | La **cinta del marcador** mide 36×64 px (el único objetivo < 44 px de la auditoría). | Marcar una página en el móvil. | `salida-u3` («Página marcada. Quitar el marcador» 36×64). | `LectorScreen.tsx:540-548` (zona táctil del ancho de la cinta). Añadir `hitSlop`/padding transparente. |
| **RW-09** | Baja | CONFIRMADO | Las opciones exclusivas del lector («Original / Texto paralelo / Solo en español», «Por páginas / Continuo», papel, letra) se anuncian como **checkbox**, no como radio. | Leer el rol de los chips. | `salida-u7` («Original:checkbox:true …»). | `components/atoms/Chip.tsx:49` (`estadoElegible(rol…)` con el rol por defecto). Pasar `rol="radio"` dentro de un `radiogroup`. |

**Otras notas (no son de la web):**

- Calidad de la traducción: «Dr. Price was taller than he had imagined» se tradujo como «**El** Dr. Price» (es Eleanor, una mujer) y «grandfather clock» como «reloj del **abuelo**» (es un reloj de pie). Es cosa del modelo del traductor.
- Los fragmentos de la búsqueda terminan en «…lejos.**…**» (punto más puntos suspensivos).
- El selector de «Ya lo tengo» abre en modo `selectMultiple` para un solo deseo.
- Con muchos inicios de sesión seguidos de la misma cuenta, el freno de login (5 en 5 min) bloqueó una entrada del script. Es lo esperado; lo dejo dicho para quien repita estas pruebas.

## 3. Funciones nuevas verificadas

| Función | Resultado | Evidencia |
|---|---|---|
| «Correo o usuario» con `anderson` / `<clave>` | PASA (iPhone y PC), sin CORS falso desde las 15:35 | `r0-*`, `u13` |
| Renovación de sesión | PASA: al abrir la app hace `POST /auth/renovar` y cambia el token guardado | `u13` |
| Sesión revocada | PASA: va a `/entrar` con «Tu sesión expiró», para la voz y quita el mini | `u7-sesion-revocada.png` |
| Mis notas: filtros por tipo | PASA (Notas 2, Marcadores 3, Subrayados 4, Todo 9; `aria-checked`) | `u5-notas-*` |
| Mis notas: búsqueda | PASA («raya» → 1; «zzzz» → «Nada coincide» + «Quitar los filtros») | `u5-notas-buscar` |
| Mis notas: vista por fecha | PASA | `u5-notas-fecha` |
| Mis notas: menú ⋯ (copiar, color, editar, borrar) | PASA (color y nota guardados en el servidor; borrar pide confirmación). Copiar falla solo en Chrome sin cabeza («Document is not focused»), con aviso en la consola | `u7-notas-editada.png`, `u5-notas-menu` |
| Mis notas: «Ir al lugar» | PASA: `/leer/…?frase=c003-s00051&cfi=…` y la frase queda en pantalla (121,187 de 1440×900) | `u10-ir-al-lugar.png` |
| Colecciones: crear / renombrar / retirar | PASA | `u5-colecciones-*` |
| Deseos: «Ya lo tengo» | PASA (el deseo se cumple con el archivo y desaparece de Deseos) | `u12-*.png` |
| Tema de día y selector (noche, día, como el dispositivo) | PASA (madera clara en estantería, ficha y notas) | `u1-dia-*` |
| Menú de selección | PASA: no tapa la selección (menú 145–249, selección 261–314 en el iPhone; 194–298 / 310–336 en el PC), objetivos de 44 px | `u3-menu-seleccion-*` |
| Traducir una selección | PASA: hoja con el original y la traducción en **276 ms**; Copiar, Escuchar y «Guardar como nota» (se guarda una NOTA con «Traducción: …») | `u5-traducir-hoja-iph390.png` |
| «Ver en español» por capítulo | PASA: texto paralelo con «Traduciendo el capítulo… 48 %» y listo en 1,8 s (PC) / 2,6 s (iPhone), 16 bloques; «Solo en español» oculta los 16 originales. Solo se ofrece en libros que no están en español | `u7-paralelo-*`, `u7-solo-es-*` |
| Reproductor: velocidad 0,5–5x en el deslizador | PASA: rango 0,5..5, paso 0,05; 5x → `cap-002-2x.m4a` a 2,5; 3x → `-2x` a 1,5; 0,5x → 1x a 0,5 | `salida-u4` |
| Reproductor: cambio de voz sin silencio | PASA (LV-07) | `salida-u7` |
| Reproductor: Reintentar en error | PASA (LV-02) | `u7-sin-red.png` |
| Mini reproductor con cerrar | PASA (44×44, para la voz) | `u11-mini.png` |
| Lector papel: la barra se oculta | PASA (sola a los 4 s; vuelve con un toque en el PC; **en el móvil no vuelve: RW-02**) | `u3-*`, `salida-u9` |
| Lector papel: folio | PASA («p. 3 de 13 · quedan 25 min» en versalitas; en el PC uno por página) | `u3-menu-seleccion-iph390.png`, `u7-ir-al-lugar.png` |
| Lector papel: marcador | PASA (cinta burdeos; ver RW-08) | `u3-marcador-*` |
| Lector papel: dos columnas en el PC | PASA (`max-column-count=2`, justificado con guiones) | `u3-barra-vuelve-pc.png` |
| Lector papel: sin ríos en el móvil | PASA (alineado a la izquierda, `hyphens:auto`) | `u3-*-iph390` |

## 4. Revisión crítica de diseño (priorizada, máx. 15)

Vara de medida: lujo, vida, libros bonitos, práctico y sin saturar. En general **ya se siente de lujo**: el mueble con cornisa y montantes, la lámpara con el haz, las placas de latón con tornillos, el atril con cinta y la ficha con la tapa sobre el halo son de otra categoría frente a la ronda anterior, y el tema de día es por fin «la misma casa a otra hora». Lo que todavía resta:

1. **(Funcional y de diseño) El lector en el móvil no deja recuperar la barra** (RW-02). Es lo primero que notarían Anderson y Samy. Además de arreglar el `snap`, proponer un pequeño **asa** fija (una cinta o un punto de latón de 44 px arriba a la derecha) que siempre muestre la barra.
2. **Primera vista del PC desaprovechada.** En 1440×900 hay ~170 px de madera vacía antes de la lámpara, el atril enseña 2 libros a la izquierda y la tarjeta «Sigue donde lo dejaste» a la derecha con ~650 px vacíos en medio, y «Recién llegados» queda bajo el pliegue (`u1-estanteria-completa-pc.png`). Propuesta: lámpara colgada de la cornisa (sin el hueco de arriba, −120 px), atril centrado con la tarjeta pegada a los libros y altura de balda ajustada para que se vean dos baldas al abrir.
3. **Horizontal (UX-12).** En 844×390 la lámpara y la cornisa ocupan media pantalla, y en el catálogo búsqueda + pestañas + herramientas ocupan el 70 %. Propuesta: con alto < 500 px, quitar la lámpara (solo el haz), plegar la búsqueda en un icono y poner pestañas y filtros en una sola fila.
4. **Confirmaciones con `window.confirm` del navegador** (retirar, borrar diario y notas, retirar colección): un cuadro gris del sistema en medio de la madera rompe el ambiente, y en el iPhone sale con el título del dominio. Propuesta: una `Hoja` propia con título en Cormorant, texto y dos botones (latón «Cancelar», burdeos «Sí, retirar»). `utils/confirmar.ts:22-25`.
5. **El aviso (toast)** tapa la cabecera y es verde menta genérico (RW-04). Propuesta: una píldora de pergamino con borde latón abajo, sobre el mini reproductor, que deje pasar los toques.
6. **El botón flotante «+»** (56 px) tapa el último lomo de «Recién llegados» y la portada de la segunda columna del catálogo en el móvil (`u1-estanteria-iph390.png`, `u1-catalogo-iph390.png`). Propuesta: margen inferior en la lista igual a la altura del botón, y que se encoja a un círculo de 44 px al desplazarse.
7. **Degradado de las pestañas** como bloque oscuro (RW-05). Propuesta: `mask-image: linear-gradient(90deg, #000 85%, transparent)` en la fila, solo si se desborda.
8. **Ficha del deseo con 4 botones** (RW-07) y la tapa en blanco con «deseo»: está bien, pero los dos botones apagados de abajo sobran. Ocultarlos y subir «Tu nota».
9. **«Abandon…»** cortado en el segmentado (UX-28). Propuesta: «Dejado», o letra de 13 px solo en esa opción, o iconos con la etiqueta debajo.
10. **Mis notas: «Ir al lugar»** es un botón oscuro y grande en cada tarjeta y, con 9 notas, la pantalla es una columna de botones iguales (`u5-notas-menu-iph390.png`). Propuesta: que toda la cita sea tocable, con «Ir al lugar ›» como enlace latón pequeño junto a ⋯. Se gana aire y la cita manda.
11. **Hoja «Leer a tu manera»** muy larga en el móvil: «Ver en español» queda bajo el pliegue y lo nuevo no se descubre (`u7-paralelo-iph390.png`). Propuesta: en libros en inglés, «Ver en español» arriba del todo; y agrupar en pestañas «Página / Texto / Idioma».
12. **El menú de selección mezcla estilos**: 5 círculos de color, 3 iconos sueltos y una píldora «A→es Traducir» con degradado. Funciona y no tapa nada, pero la píldora pesa más que el resto. Propuesta: el mismo botón circular con un icono «文A» (y quitarlo en libros en español, RW-06).
13. **Numeración ficha/lector** distinta (UX-30). Propuesta: no numerar la portadilla en la ficha, o rotularla «Portada».
14. **Dos columnas en el PC**: el lomo central es una sombra muy tenue y el folio izquierdo solo dice «2» mientras el derecho dice «3 de 13 · quedan 1 min» (`u7-ir-al-lugar.png`). Propuesta: un lomo central con algo más de sombra (degradado 0→18 % a 24 px a cada lado) y un folio simétrico («2 · 3 de 13 · quedan 1 min»).
15. **Textos del backend sin tildes** en Administración (UX-14 residual): «Entro con los roles», «modulos». Bajo impacto, pero desentona en una pantalla ya muy cuidada.

**Rendimiento percibido:** estantería con libros a ~0,32 s de navegar (iPhone, Android y PC); texto del lector pintado en 0,39–0,53 s; voz ya generada sonando en 0,6–1,1 s; traducción de frase 0,28 s; capítulo traducido 1,8–2,6 s; al sacar un libro, la animación hasta la ficha dura ~1,5 s y se ve fluida. No vi saltos de layout al cargar (los lomos y las placas aparecen ya colocados).

**Consola:** limpia en los recorridos (solo el aviso de `navigator.vibrate` antes del primer toque y el de `useNativeDriver`), salvo la **violación de CSP de RW-03**. El `NotAllowedError` del portapapeles y algunos `ERR_INTERNET_DISCONNECTED` salen de la propia prueba (sin foco, red cortada a propósito). Hubo un `ERR_EMPTY_RESPONSE` suelto durante la traducción del capítulo, sin efecto visible.

**Objetivos táctiles:** la auditoría no encontró ninguno < 44 px en estantería, catálogo, ficha (día y noche), notas, administración y lector, salvo la cinta del marcador (RW-08).

**Contraste:** dorado de los lomos ≥ 4,87:1 en todos los cueros; los textos del tema de noche y de día ya estaban entre 5,5 y 13,8:1 (ronda anterior) y no cambiaron de paleta.

## 5. Recorridos básicos (regresión)

| Recorrido | Resultado |
|---|---|
| Entrar (correo y alias, vacío, error) | OK (con RW-01 hasta las 15:20) |
| Estantería (atril, recientes, favoritos, ordenar, vacío, día/noche) | OK |
| Sacar un libro con el dedo | OK |
| Catálogo, pestañas, búsqueda, filtros, orden | OK (RW-05 estético) |
| Subir (lote API, repetido, vacío, «Ya lo tengo» con el selector) | OK |
| Ficha (estados, estrellas, diario, datos, colecciones, retirar) | OK (UX-28, RW-04, RW-07) |
| Leer (abrir, páginas, selección, resaltar, nota, marcador, índice, buscar, ir al lugar) | OK en el PC; **en el móvil RW-02**; LV-05 en el PC |
| Escuchar (preparar, velocidad, voces, red, mini, sesión) | OK (RW-03 en la consola) |
| Notas, Ajustes, Documentos | OK |
| Administración (usuarios, roles, módulos, auditoría) | OK (UX-14 residual) |

**Conteo final:**

| Informe | Total | PASA | FALLA | N-A |
|---|---|---|---|---|
| UX (`qa-ux-diseno.md`) | 30 | 26 | 4 (UX-12, UX-14, UX-28, UX-30) | 0 |
| LV (`qa-lector-voz.md`, 13 + 6 P) | 19 | 12 | 2 (LV-05, LV-P6) | 5 (LV-08, P2, P3, P4, P5) |
| BI de la web (`qa-biblioteca.md`) | 28 | 25 | 0 (salvedad de backend en BI-15) | 3 (BI-17, BI-24, BI-28) |
| **Regresiones nuevas** | **9** | | RW-01 (bloqueante, ya corregida en QA), RW-02 (alta), RW-03 y RW-04 (medias), RW-05…RW-09 (bajas) | |

(UX-24 cuenta como PASA con nota y LV-12 como PASA por código. En LV, «PASA» son LV-01, 02, 03, 04, 06, 07, 09, 10, 11, 12, 13 y P1.)

## 6. No cubierto (límites)

- Safari y Chrome reales (todo se emuló en Chrome sin cabeza): el teclado virtual, el rebote, la pantalla de bloqueo y el audio de iOS (RW-03 queda PLAUSIBLE por eso).
- LV-08 (desplazamiento continuo con voz), LV-P3/P4, BI-24 y BI-28: ver la tabla.
- El sonido de página y la vibración.
- Producción: no se tocó. **Antes de desplegar, comprobar el CORS del gateway (RW-01).**
