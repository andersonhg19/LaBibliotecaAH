# Catálogo de `errorCode` — La Biblioteca AH

> Estándares §15. Toda respuesta de la API es `ResultDTO {correct, message, errorCode, object}` con **HTTP 200**,
> también cuando algo falla (`correct=false`). El texto de `message` sale de `messages_es.properties`
> (`Message.Msj`); el frontend lo puede mostrar tal cual.
> Excepción: los **binarios** (GET `/v1/archivos/**`, `/v1/voces/*/muestra.mp3`) llevan además el código HTTP real.

## biblioteca-service

| errorCode | Significado | HTTP en binarios | Ejemplos (`Message.Msj`) |
|---|---|---|---|
| 0 | OK | 200 / 206 | — (también `progresoMasReciente`, que es `correct=true`) |
| 101 | Duplicado | — | `estanteDuplicado` |
| 102 | No encontrado (o no es tuyo: nunca se confirma que exista lo de otro) | 404 | `libroNoEncontrado`, `estanteNoEncontrado`, `anotacionNoEncontrada`, `comentarioNoEncontrado`, `archivoNoEncontrado`, `libroNoEstaEnEstante`, `referenciaNoEstaEnEstante` |
| 103 | Error de proceso (inesperado; queda en log con stacktrace) | — | `errorInesperado`, `originalNoGuardado` |
| 120 | Dato requerido o inválido / regla de negocio | 400 | `datosInvalidos`, `campoValorInvalido`, `campoTipoInvalido`, `cuerpoInvalido`, `parametroFaltante`, `parametroInvalido`, `sinArchivos`, `ningunArchivoAceptado`, `formatoNoSoportado`, `formatoNoCoincide`, `archivoVacio`, `archivoDemasiadoGrande`, `subidaIncompleta`, `calificacionInvalida`, `deseoConArchivo`, `libroSinArchivo`, `capituloFueraDeRango`, `vozInvalida`, `favoritosNoSeRenombra`, `favoritosNoSeBorra` |
| 401 | Sin sesión, token inválido/caducado, o token sin `userId` | 401 | `sesionSinUsuario`; el filtro JWT responde `{"correct":false,"message":"Sesion invalida o vencida","errorCode":401}` con HTTP 401 |
| 403 | Sin permiso | 403 | `sinPermiso` (reservado) |
| 503 | Almacenamiento (`/datos`) no disponible: la API de datos sigue funcionando | 503 | `datosNoDisponibles` |

Notas:
- La subida de varios archivos con algunos rechazados responde `correct=true`, `errorCode=0` y en `message`
  la lista de rechazos (`algunosRechazados`); si no entra ninguno, `correct=false`, `errorCode=120`.
- `POST /v1/audio/estado` con el libro aún sin convertir **no es un error**: `object.estado = "CONVIRTIENDO"`
  (o `"ERROR_CONVERSION"`), sin encolar voz (contrato v1.1).

## auth-service (heredado de Oh Churus, sin cambios de numeración)

| errorCode | Significado |
|---|---|
| 0 | OK |
| 101 | Credenciales incorrectas / contraseña obligatoria |
| 102 | Correo no disponible (duplicado) |
| 103 | Usuario no encontrado |
| 104 | Rol no encontrado |
| 105 | Se quedaría sin administradores |
| 106 | No puedes desactivarte a ti mismo |
| 107 | El rol ya existe |
| 108 | Rol de sistema (ADMIN/USER): no se cambia |
| 109 | Rol en uso |
| 110 | Página no encontrada |
| 111 | ADMIN conserva siempre el módulo de administración |
| 400 | Datos inválidos (validación) |
| 401 | Token inválido o caducado (HTTP 401) |
| 403 | Sin permiso |
| 429 | Demasiados intentos de inicio de sesión |
| 500 | Error inesperado |

> Ojo: en los endpoints de administración (roles, módulos, usuarios de otros) el `message` es la **clave**
> (`roleNotFound`, `lastAdminCannotLoseRole`…), igual que en Oh Churus; la web la traduce.
> auth-service conserva la numeración de Oh Churus (estándares §19: "conserva el patrón heredado"); la
> convergencia con el catálogo 101/102/103/120 queda como pendiente si el frontend lo necesita.
