/*
 * LOS ERRORES SE DICEN EN ESPANOL.
 *
 * Parte del backend responde en ingles ("Invalid email or password",
 * "Category name already exists at this level", "must be less than or equal
 * to 500"), y esos textos llegaban tal cual al aviso de la pantalla. Aqui se
 * traducen en un solo sitio (lo usa el interceptor de api.ts), para que ninguna
 * pantalla tenga que acordarse. Lo que no se reconoce se deja como vino: un
 * mensaje raro es mejor que ninguno.
 */

/*
 * EL CATÁLOGO DE MENSAJES (estándar 16 y 34): todo texto de error, aviso o
 * confirmación que ve el usuario sale de aquí. Una pantalla nunca escribe su
 * propio "No se pudo…": así se dice igual en toda la biblioteca y se corrige
 * en un solo sitio.
 */
export const MENSAJES = {
  // genéricos
  errorCarga: 'No se pudo cargar. Inténtalo otra vez.',
  sinConexion: 'No se pudo hablar con la biblioteca. Revisa la conexión.',
  errorGuardar: 'No se pudo guardar. Inténtalo otra vez.',
  guardado: 'Guardado.',
  borrado: 'Borrado.',
  // entrada
  entrarFallo: 'No se pudo entrar',
  entrarRespaldo: 'No se pudo iniciar sesión',
  registroFallo: 'No se pudo crear la cuenta',
  registroRespaldo: 'No se pudo completar el registro',
  sesionExpirada: 'Tu sesión expiró. Vuelve a entrar para seguir leyendo.',
  // biblioteca
  libroNoEncontrado: 'No se encontró el libro.',
  subidaFallo: 'No se pudo subir',
  subidaListo: 'Ya está en la biblioteca',
  subidaPreparando: 'Lo estamos preparando: aparecerá listo para leer en un momento.',
  formatoNoAdmitido: 'Ese formato no se admite. Sube EPUB, PDF, DOCX, DOC o TXT.',
  deseoGuardado: 'Añadido a tus deseos',
  favoritoPuesto: 'En favoritos',
  favoritoQuitado: 'Fuera de favoritos',
  ordenFallo: 'No se pudo guardar el nuevo orden. Se deja como estaba.',
  estanteCreado: 'Estante creado',
  estanteRenombrado: 'Estante renombrado',
  estanteBorrado: 'Estante retirado. Sus libros siguen en tu biblioteca.',
  favoritosProtegido: 'Favoritos es de la casa: no se renombra ni se borra.',
  libroBorrado: 'Libro retirado de la biblioteca',
  /* BI-01: lo que se conserva al retirar (el servidor guarda notas, diario y avance). */
  retirarAviso: (titulo: string) =>
    `«${titulo}» saldrá de tu biblioteca. Tus notas, tu diario y dónde ibas se guardan: si vuelves a traer el mismo archivo, reaparecen.`,
  /* BI-07/08: el servidor respondió bien pero no aplicó el cambio: no se dice "Guardado". */
  noSeAplico: 'El servidor no aplicó el cambio. Se deja como estaba.',
  calificacionQuitada: 'Calificación quitada',
  archivoGrande: (max: string) => `El archivo es demasiado grande (máximo ${max}).`,
  demasiadosArchivos: 'Son demasiados archivos de una vez. Súbelos en tandas más pequeñas.',
  yaLoTenias: 'Ya estaba en tu biblioteca',
  yaLoTeniasComoLibro: 'Ya lo tienes como libro: no se duplica',
  deseoCumplido: 'Deseo cumplido: el libro ya está en tu biblioteca',
  registroCerrado: 'El registro está cerrado. Pide a quien administra la biblioteca que te cree la cuenta.',
  rangoAniosInvertido: '«Desde» es posterior a «Hasta»: no hay años en ese rango.',
  preparandoLibro: 'Preparando el libro…',
  conversionFallo: 'No se pudo preparar este archivo. Prueba a subirlo de nuevo o en otro formato.',
  // lector
  lectorFallo: 'No se pudo abrir el libro.',
  lectorSinArchivo: 'Este libro todavía no tiene archivo para leer.',
  notaGuardada: 'Nota guardada',
  resaltadoGuardado: 'Resaltado',
  copiado: 'Copiado',
  progresoFallo: 'No se pudo guardar dónde vas. Se reintentará.',
  // voz
  vozPreparando: (voz: string) => `Preparando la voz de ${voz}…`,
  vozFallo: 'La voz de este capítulo no se pudo generar. Prueba otra voz o vuelve más tarde.',
  libroConvirtiendo: 'El libro aún se está preparando en el taller; la voz empezará en cuanto esté listo…',
  libroNoConvertido: 'Este libro no se pudo preparar, así que todavía no tiene voz. Revisa su ficha.',
  vozAudioFallo: 'No se pudo cargar el audio de este capítulo.',
  vozToqueParaEmpezar: 'Toca ▶ para empezar a escuchar.',
  vozTemporizador: 'El temporizador apagó la voz. Que descanses.',
  vozFinCapitulo: 'Fin del capítulo. El temporizador apagó la voz.',
  vozFinLibro: 'Fin del libro.',
  vozSinDocumento: 'Este documento no tiene voz todavía.',
  // validaciones de formularios
  /* "La contraseña es obligatoria", "El título es obligatorio" (UX-17): el
     género sale del artículo con que se nombra el campo. */
  requerido: (campo: string) => `${campo} es ${/^(la|las)\s/i.test(campo) ? 'obligatoria' : 'obligatorio'}.`,
  correoInvalido: 'Escribe un correo válido.',
  // alias (mismas reglas que el backend: ValidationUtils.FORMATO_ALIAS)
  aliasInvalido:
    'El usuario debe tener de 3 a 30 caracteres: letras sin tilde, números, punto (.), guion (-) o guion bajo (_). Sin espacios ni @.',
  aliasAyuda: 'Con él también podrás entrar. De 3 a 30: letras sin tilde, números, punto, guion o guion bajo.',
  aliasGuardado: 'Usuario actualizado',
  claveCorta: 'La contraseña debe tener al menos 6 caracteres.',
  claveDebil: 'Usa al menos 10 caracteres, con letras y números (y que no sea fácil de adivinar).',
  claveNoCoincide: 'Las contraseñas no coinciden.',
  textoLargo: (max: number) => `Máximo ${max} caracteres.`,
  anioInvalido: 'Escribe un año entero entre -3000 y 2100 (o déjalo vacío).',
  archivoVacio: 'El archivo está vacío.',
  conflicto: 'Otro cambio llegó a la vez. Se recarga lo que hay.',
  cuentaCreada: 'Cuenta creada',
} as const

const EXACTOS: Record<string, string> = {
  'invalid email or password': 'Correo/usuario o contraseña incorrectos.',
  'email already in use': 'Ese correo ya está registrado.',
  'email already in use by another user': 'Ese correo ya lo usa otra cuenta.',
  'password is required for new users': 'La contraseña es obligatoria.',
  'category name already exists at this level': 'Ya existe una categoría con ese nombre.',
  'category cannot be its own parent': 'Una categoría no puede estar dentro de sí misma.',
  'cannot delete category with active children': 'No se puede borrar: la categoría tiene subcategorías.',
  'cannot remove the household owner': 'No se puede sacar del hogar a quien lo creó.',
  'user is already a member': 'Esa persona ya es parte del hogar.',
  'card deleted': 'Tarjeta borrada.',
  'allocation deleted': 'Presupuesto quitado.',
  'access denied': 'No tienes permiso para hacer esto.',
  forbidden: 'No tienes permiso para hacer esto.',
  unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
}

const ENTIDADES: Record<string, string> = {
  category: 'la categoría',
  'parent category': 'la categoría principal',
  'savings category': 'el ahorro',
  user: 'la cuenta',
  movement: 'el movimiento',
  'parent movement': 'el movimiento principal',
  household: 'el hogar',
  'scheduled movement': 'el programado',
  card: 'la tarjeta',
  debt: 'la deuda',
  member: 'esa persona en el hogar',
  allocation: 'el presupuesto',
}

export const enEspanol = (mensaje?: string | null): string => {
  if (!mensaje) return mensaje ?? ''
  const limpio = mensaje.trim()
  const clave = limpio.toLowerCase().replace(/[.!]+$/, '')
  if (EXACTOS[clave]) return EXACTOS[clave]

  const noEncontrado = /^(.+?) not found(?::\s*(.*))?$/i.exec(limpio)
  if (noEncontrado) {
    const entidad = ENTIDADES[noEncontrado[1].toLowerCase()]
    if (entidad) return `No se encontró ${entidad}.`
  }

  const borrado = /^(.+?) deleted successfully$/i.exec(limpio)
  if (borrado && ENTIDADES[borrado[1].toLowerCase()]) return 'Borrado.'

  if (/^error\s+\w+ing\b/i.test(limpio)) return 'Algo falló en el servidor. Inténtalo otra vez.'

  /* Validaciones de Spring: "amount: must be less than or equal to 500". */
  const maximo = /must be less than or equal to ([\d.,]+)/i.exec(limpio)
  if (maximo) return `El valor debe ser como máximo ${maximo[1]}.`
  const minimo = /must be greater than or equal to ([\d.,]+)/i.exec(limpio)
  if (minimo) return `El valor debe ser como mínimo ${minimo[1]}.`
  if (/must be greater than 0/i.test(limpio)) return 'El valor debe ser mayor que cero.'
  if (/must not be (blank|null|empty)/i.test(limpio)) return 'Falta un dato obligatorio.'

  return limpio
}

/**
 * El texto que conviene mostrar cuando una peticion lanza (HTTP 4xx/5xx): el
 * mensaje del servidor si lo trae (p. ej. el 429 del login, que ya viene en
 * espanol), luego el del error si no es el generico de axios, y si no, el de
 * respaldo.
 */
export const mensajeDelServidor = (err: unknown, respaldo: string): string => {
  const e = err as { response?: { data?: { message?: unknown } }; message?: unknown } | null | undefined
  const delServidor = e?.response?.data?.message
  if (typeof delServidor === 'string' && delServidor.trim()) return enEspanol(delServidor)
  const propio = typeof e?.message === 'string' ? e.message : ''
  if (propio && !/^(Request failed with status code|Network Error|timeout of)/i.test(propio)) return enEspanol(propio)
  return respaldo
}
