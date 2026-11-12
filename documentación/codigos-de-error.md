# Catálogo de `errorCode` — La Biblioteca AH

> Estándares §15. Toda respuesta de la API es `ResultDTO {correct, message, errorCode, object}` con **HTTP 200**,
> también cuando algo falla (`correct=false`). El texto de `message` sale de `messages_es.properties`
> (`Message.Msj`); el frontend lo puede mostrar tal cual.
> Excepción: los **binarios** (GET `/v1/archivos/**`, `/v1/voces/*/muestra.mp3`) llevan además el código HTTP real.

## biblioteca-service

| errorCode | Significado | HTTP en binarios | Ejemplos (`Message.Msj`) |
|---|---|---|---|
| 0 | OK | 200 / 206 | — (también `progresoMasReciente`, que es `correct=true`) |
| 101 | Duplicado, o dos peticiones iguales que chocaron a la vez (v1.2) | — | `estanteDuplicado`, `conflictoConcurrente`, (v1.6) `carpetaDuplicada` (nombre repetido entre carpetas hermanas, sin mayúsculas) |
| 102 | No encontrado (o no es tuyo: nunca se confirma que exista lo de otro) | 404 | `libroNoEncontrado`, `estanteNoEncontrado`, `anotacionNoEncontrada`, `comentarioNoEncontrado`, `archivoNoEncontrado`, `libroNoEstaEnEstante`, `referenciaNoEstaEnEstante`, `capituloSinTexto` (v1.3: falta `frases/cap-NNN.json`), (v1.3.2) `rutaNoEncontrada` (ruta que Tomcat no encuentra fuera de Spring; HTTP 404), (v1.6) `carpetaNoEncontrada` (carpeta ajena o inexistente: al abrirla, crear dentro, mover o subir a ella) |
| 103 | Error de proceso (inesperado; queda en log con stacktrace) | — | `errorInesperado`, `originalNoGuardado` |
| 120 | Dato requerido o inválido / regla de negocio | 400 | `datosInvalidos`, `campoValorInvalido`, `campoTipoInvalido`, `cuerpoInvalido`, `parametroFaltante`, `parametroInvalido`, `sinArchivos`, `ningunArchivoAceptado`, `formatoNoSoportado`, `formatoNoCoincide`, `archivoVacio`, `subidaIncompleta`, `calificacionInvalida`, `deseoConArchivo`, `libroSinArchivo`, `capituloFueraDeRango`, `vozInvalida`, `vozNoDisponible` (v1.2: voz fuera del catálogo), `favoritosNoSeRenombra`, `favoritosNoSeBorra`, `demasiadosEstantes`, `valorFueraDeRango` (NaN, Infinity o fuera de rango en el progreso), `contenidoNoSoportado` (cuerpo que no es JSON), (v1.3) `idiomaNoSoportado` (fuera de `TRADUCTOR_IDIOMAS`), `mismoIdioma` (origen = destino, o libro ya en ese idioma), `libroAunSinConvertir` (traducir un capítulo de un libro que no está LISTO), (v1.3.2) `deseoSoloConArchivo` (cambiar el `tipo` de un DESEO en `/libros/save`), `deseoUnSoloArchivo` (`/subir` con `deseoId` y más de un archivo), `noEsUnDeseo` (`deseoId` que ya no es un deseo), `rutaInvalida` (ruta que Tomcat rechaza, p. ej. con `%2f`: **HTTP 400** con este ResultDTO), (v1.6) `carpetaDentroDeSiMisma`, `carpetaDemasiadoProfunda` (más de 10 niveles), `demasiadasCarpetas` (`BIBLIOTECA_MAX_CARPETAS`), `carpetaSoloDocumentos` (`/subir` con `carpetaId` y tipo LIBRO o `deseoId`), `soloDocumentosEnCarpetas` (mover un libro o deseo a una carpeta), `carpetaNoVacia` (borrar una carpeta con algo dentro sin decir `contenido`); `formatoNoCoincide` también para un ZIP u OLE cuyo contenido es de otro formato (v1.6) |
| 401 | Sin sesión, token inválido/caducado, sin `exp` o sin `userId`, o **sesión revocada** (v1.2: cuenta desactivada, roles o clave cambiados) | 401 | El filtro JWT responde con HTTP 401 `{"correct":false,"message":"Sesion invalida o vencida","errorCode":401}` o, si la sesión fue revocada, `"Tu sesión ya no es válida (la cuenta cambió o se desactivó). Vuelve a iniciar sesión."` |
| 403 | Sin permiso. (v1.4) `/v1/admin/**` sin el rol ADMIN: **HTTP 403** con este ResultDTO | 403 | `sinPermiso` |
| 413 | (v1.2) Subida por encima de los topes: más archivos por petición que `BIBLIOTECA_MAX_ARCHIVOS_POR_SUBIDA`, archivo o petición más grandes que `BIBLIOTECA_MAX_ARCHIVO` / `BIBLIOTECA_MAX_SUBIDA` | — | `demasiadosArchivos`, `archivoDemasiadoGrande` |
| 429 | (v1.3) Freno de traducción: más de `TRADUCTOR_CARACTERES_POR_MINUTO` (20 000) caracteres por minuto y usuario en `/v1/traducir` (lo que sale de la caché no cuenta), más de `TRADUCTOR_CAPITULOS_POR_HORA` (30) capítulos nuevos por hora, o cola de capítulos llena | — | `demasiadoTextoTraducido`, `demasiadosCapitulosTraducidos`, `traductorOcupado` |
| 503 | Almacenamiento (`/datos`) no disponible: la API de datos sigue funcionando. (v1.3) También: **el traductor no responde** (caído, arrancando, timeout de 60 s o respuesta inválida); solo falla la traducción | 503 | `datosNoDisponibles`, `traductorNoDisponible` |
| 507 | (v1.2) No queda espacio libre suficiente en `/datos` (`BIBLIOTECA_ESPACIO_MINIMO_MB` después de la subida) | — | `sinEspacio` |

Notas:
- (v1.3.2) Lo que Tomcat responde por su cuenta (ruta inválida, ruta sin contexto, error del contenedor) también es
  ResultDTO JSON, con el código HTTP real (400 → 120 `rutaInvalida`, 404 → 102 `rutaNoEncontrada`, 5xx → 103
  `errorInesperado`), sin HTML ni versión del servidor. En los binarios, un `Range` inválido o fuera del archivo da
  **HTTP 416 sin cuerpo** con `Content-Range: bytes */<tamaño>`.
- (v1.3.2) `mismoIdioma` en `/traducir/capitulo` solo sale si el texto del capítulo, detectado por el traductor, ya
  está en el idioma de destino (no basta con el idioma guardado del libro).
- (v1.6) `GET /v1/archivos/{id}/hoja.json` sigue la regla de los binarios: 404 si no es tuyo, no es una hoja o aún no
  está convertida; 503 sin `/datos`.
- La subida de varios archivos con algunos rechazados responde `correct=true`, `errorCode=0` y en `message`
  la lista de rechazos (`algunosRechazados`); si no entra ninguno, `correct=false`, `errorCode=120`.
- `POST /v1/traducir/capitulo` con el traductor caído en un capítulo largo **no es un error de la petición**:
  `object.estado = "ERROR"` y `object.error` = "No se pudo traducir el capítulo: …" (v1.3). En un capítulo corto
  (traducido en la misma llamada) sí da `errorCode 503`.
- `POST /v1/audio/estado` con el libro aún sin convertir **no es un error**: `object.estado = "CONVIRTIENDO"`
  (o `"ERROR_CONVERSION"`), sin encolar voz (contrato v1.1).
- (v1.5) Sin códigos nuevos. `GET /v1/archivos/{id}/frases/cap-NNN.json` y las partes del audio
  (`cap-NNN.partes.json`, `cap-NNN.parte-KKK.m4a`) siguen las reglas de los binarios: 404 + 102 `archivoNoEncontrado`
  si no existen, no son tuyos o el nombre no encaja; 503 sin `/datos`. Que un capítulo aún no tenga partes **no es un
  error**: `/audio/estado` responde `PENDIENTE`/`GENERANDO` con `urlPartes: null`. Si el capítulo acaba en `ERROR`
  mientras sus partes ya suenan, la web deja sonar lo generado y muestra el motivo (`object.error`) al llegar al final.

## auth-service (heredado de Oh Churus, sin cambios de numeración)

| errorCode | Significado |
|---|---|
| 0 | OK |
| 101 | Credenciales incorrectas / contraseña obligatoria. En el login el mensaje es el mismo exista o no la cuenta, se entre por correo o por alias (`credencialesIncorrectas`) |
| 102 | Correo no disponible (duplicado). Desde v1.2 sin distinguir mayúsculas y aunque la cuenta esté desactivada |
| 103 | Usuario no encontrado |
| 104 | Rol no encontrado |
| 105 | Se quedaría sin administradores |
| 106 | No puedes desactivarte a ti mismo |
| 107 | El rol ya existe |
| 108 | Rol de sistema (ADMIN/USER): no se cambia |
| 109 | Rol en uso |
| 110 | Página no encontrada |
| 111 | ADMIN conserva siempre el módulo de administración |
| 112 | Alias no disponible: ya lo tiene otra cuenta, sin distinguir mayúsculas (`aliasNoDisponible`) — registro, guardado propio y de administración |
| 400 | Datos inválidos (validación). Incluye `aliasObligatorio`, `aliasInvalido` (3–30 `[a-z0-9._-]`, sin @), `usuarioObligatorio` (login sin `usuario` ni `email`) , `claveDeOtraCuenta` (la edición de administración no cambia contraseñas) y (v1.2) `claveDebil` (menos de 10 caracteres, espacios al borde, muy repetitiva o común). (v1.3.2) `rutaInvalida`: ruta que Tomcat rechaza (p. ej. `%2f`), **HTTP 400** con ResultDTO JSON |
| 401 | Sin token, token inválido o caducado, o sesión revocada (v1.2): HTTP 401 con ResultDTO. `/v1/auth/renovar` con la cuenta inactiva también da 401 |
| 403 | Sin permiso (v1.2: HTTP 403 con ResultDTO, antes cuerpo vacío). También `registroCerrado`: alta pública desactivada (`REGISTRO_PUBLICO=false`) |
| 429 | Demasiados intentos de inicio de sesión: 5 en 5 min por cuenta y dispositivo, 20 en 10 min por dispositivo o 60 por minuto en total (v1.2) |
| 404 | (v1.3.2) `rutaNoEncontrada`: ruta que Tomcat no encuentra fuera de Spring (HTTP 404 con ResultDTO JSON) |
| 500 | Error inesperado (`errorInesperado`; también el de Tomcat fuera de Spring, HTTP 5xx con ResultDTO JSON) |

> Ojo: en los endpoints de administración (roles, módulos, usuarios de otros) el `message` es la **clave**
> (`roleNotFound`, `lastAdminCannotLoseRole`…), igual que en Oh Churus; la web la traduce.
> Los mensajes del alias y del login con correo o alias (V3: 112 y los 400 de arriba, y el 101 del login) ya salen
> en español de `auth-service/src/main/resources/messages_es.properties`, también en administración.
> auth-service conserva la numeración de Oh Churus (estándares §19: "conserva el patrón heredado"); la
> convergencia con el catálogo 101/102/103/120 queda como pendiente si el frontend lo necesita.
