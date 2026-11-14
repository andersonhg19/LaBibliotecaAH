// ============================================================================
// Respuesta genérica (convención heredada de Oh Churus)
// ============================================================================
export interface ResultDTO<T> {
  correct: boolean
  message: string
  errorCode: number
  object: T
}

export interface PageDTO<T> {
  page: number
  size: number
  totalPage: number
  totalElements?: number
  list: T[]
}

// ============================================================================
// Auth y administración (copia propia del módulo de Oh Churus, decisión D1)
// ============================================================================
export interface AuthResponse {
  token: string
  userId: string
  name: string
  email: string
  /** Nombre de usuario con el que también se entra (auth V3). */
  alias?: string
  roles?: string[]
}

/** `usuario` es el correo O el alias; el backend acepta aún `email` como sinónimo. */
export interface LoginRequest {
  usuario: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  alias: string
  password: string
}

export interface ResultUserDTO {
  id: string
  name: string
  email: string
  alias?: string
  active?: boolean
}

export interface UserFilter {
  name?: string
  email?: string
  page?: number
  size?: number
}

export interface AdminUser {
  id: number
  name: string
  email: string
  alias?: string
  active: boolean
  roles: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Rol {
  id: number
  name: string
  description?: string
  active: boolean
  usuarios: number
}

export interface PaginaDeModulo {
  id: number
  code: string
  name: string
  route: string
  icon?: string
  inMenu: boolean
  sortOrder: number
  active: boolean
}

export interface ModuloAdmin {
  id: number
  code: string
  name: string
  icon?: string
  sortOrder: number
  active: boolean
  pages: PaginaDeModulo[]
}

export interface PermisoDeRol {
  pageId: number
  moduleCode: string
  pageCode: string
  pageName: string
  canRead: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface LineaDeAuditoria {
  id: number
  actorUserId?: number
  actorEmail?: string
  entityType: string
  entityId?: number
  action: string
  details?: string
  occurredAt: string
}

// ============================================================================
// Biblioteca (contratos.md §9)
// ============================================================================
export type TipoEjemplar = 'LIBRO' | 'DOCUMENTO' | 'DESEO'
export type EstadoLectura = 'POR_LEER' | 'LEYENDO' | 'LEIDO' | 'ABANDONADO'
/** Formato del original (contrato v1.6: documentos de texto, ofimática y hojas de cálculo). */
export type Formato =
  | 'EPUB'
  | 'PDF'
  | 'DOCX'
  | 'DOC'
  | 'TXT'
  | 'MD'
  | 'HTML'
  | 'RTF'
  | 'ODT'
  | 'PPTX'
  | 'XLSX'
  | 'XLS'
  | 'ODS'
  | 'CSV'
  | 'JSON'
  | 'YAML'
  | 'LOG'
export type EstadoConversion = 'PENDIENTE' | 'PROCESANDO' | 'LISTO' | 'ERROR'
export type FuenteMetadatos = 'NOMBRE_ARCHIVO' | 'ARCHIVO' | 'MANUAL' | 'OPEN_LIBRARY' | 'IA'

export interface EjemplarDTO {
  id: string
  archivoId: string | null
  tipo: TipoEjemplar
  estado: EstadoLectura
  titulo: string
  subtitulo: string | null
  autores: string[]
  anio: number | null
  editorial: string | null
  idioma: string | null
  isbn: string | null
  sinopsis: string | null
  generos: string[]
  etiquetas: string[]
  calificacion: number | null
  favorito: boolean
  formatoOriginal: Formato | null
  estadoConversion: EstadoConversion | null
  tienePortada: boolean
  minutosEstimados: number | null
  porcentaje: number
  fechaLlegada: string
  ultimaApertura: string | null
  fechaFin: string | null
  nNotas: number
  fuenteMetadatos: FuenteMetadatos
  /** Nota de un deseo ("regalo de cumpleaños"); contrato v1.2 (BI-15). */
  nota?: string | null
  /** v1.2, solo en la respuesta de /subir: ese archivo ya estaba en tu biblioteca (BI-16). */
  yaLoTenias?: boolean
  /** v1.6: carpeta del archivador donde está el documento (null = raíz; los libros siempre null). */
  carpetaId?: string | null
}

export interface CapituloResumen {
  indice: number
  titulo: string
  minutos: number
  /*
   * 0.4.0 (contrato C3): lo que sabe el taller de cada sección. Todo opcional:
   * los libros v1 sin reclasificar no lo traen y la web numera por los títulos.
   */
  /** «capitulo», «parte», «prologo», «notas»… */
  tipo?: string | null
  region?: 'antes' | 'cuerpo' | 'despues' | null
  /** Número visible («01»); null = sin número. Ausente = libro v1. */
  numero?: number | null
  /** Si entra en el audiolibro (preferencia del usuario, o el defecto). Ausente = sí. */
  enVoz?: boolean
  enVozPorDefecto?: boolean
  /** Minutos que de verdad lee la voz (sin notas ni tablas). */
  minutosVoz?: number | null
}

export interface EjemplarDetalleDTO extends EjemplarDTO {
  capitulos: CapituloResumen[]
  progreso: ProgresoDTO | null
}

export type Pestana = 'TODO' | 'LEYENDO' | 'POR_LEER' | 'LEIDOS' | 'FAVORITOS' | 'DESEOS' | 'DOCUMENTOS'
export type Orden =
  'RECIENTES' | 'ANTIGUOS' | 'ULTIMO_ABIERTO' | 'TITULO' | 'AUTOR' | 'ANIO' | 'PROGRESO' | 'CALIFICACION'

export interface FiltroLibrosDTO {
  pestana?: Pestana
  texto?: string
  autores?: string[]
  generos?: string[]
  formatos?: string[]
  etiquetas?: string[]
  anioDesde?: number
  anioHasta?: number
  calificacionMin?: number
  conNotas?: boolean
  orden?: Orden
  page?: number
  size?: number
}

export interface GuardarEjemplarDTO {
  id: string
  titulo?: string
  /** v1.2: ausente = no se toca; null = se vacía. */
  autores?: string[] | null
  anio?: number | null
  editorial?: string | null
  sinopsis?: string | null
  generos?: string[] | null
  etiquetas?: string[] | null
  estado?: EstadoLectura
  calificacion?: number | null
  favorito?: boolean
  tipo?: TipoEjemplar
}

export interface Faceta {
  nombre: string
  n: number
}

export interface FacetasDTO {
  autores: Faceta[]
  generos: Faceta[]
  anios: Faceta[]
  formatos: Faceta[]
  etiquetas: Faceta[]
}

export type ModoProgreso = 'VISTA' | 'VOZ'

export interface ProgresoDTO {
  ejemplarId: string
  capitulo: number
  fraseId: string | null
  cfi: string | null
  posicionAudioSeg: number | null
  vozId: string | null
  velocidad: number | null
  porcentaje: number
  modo: ModoProgreso
  dispositivo: string | null
  actualizadoEn: string
}

export type TipoAnotacion = 'RESALTADO' | 'NOTA' | 'MARCADOR'

export interface AnotacionDTO {
  id?: string
  ejemplarId: string
  tipo: TipoAnotacion
  color: string | null
  cfi: string | null
  fraseInicio: string | null
  offsetInicio: number | null
  fraseFin: string | null
  offsetFin: number | null
  versionTexto: number | null
  textoCitado: string | null
  prefijo: string | null
  sufijo: string | null
  nota: string | null
  capitulo: number | null
  creado?: string
  editado?: string
}

export interface ComentarioDTO {
  id?: string
  ejemplarId: string
  texto: string
  creado?: string
}

export type TipoEstante = 'FAVORITOS' | 'COLECCION'

export interface EstanteDTO {
  id: string
  nombre: string
  tipo: TipoEstante
  colorMadera: string | null
  nLibros: number
}

// ---------------------------------------------------------------- archivador (contrato v1.6)
export type OrdenCarpeta = 'NOMBRE' | 'RECIENTES' | 'ANTIGUOS'

/** Una carpeta del archivador: documentos de todo su subárbol y subcarpetas directas. */
export interface CarpetaDTO {
  id: string
  nombre: string
  padreId: string | null
  nDocumentos: number
  nSubcarpetas: number
}

/** Lo que se ve al abrir una carpeta (o la raíz), o el resultado de buscar dentro. */
export interface CarpetaContenidoDTO {
  carpeta: CarpetaDTO | null
  ruta: CarpetaDTO[]
  subcarpetas: CarpetaDTO[]
  documentos: EjemplarDTO[]
  totalDocumentos: number
  busqueda: boolean
  recortado: boolean
  /** Solo al buscar: carpetaId → "Proyectos / 2026". */
  ubicaciones: Record<string, string>
}

export interface CarpetaBorradaDTO {
  documentosMovidos: number
  carpetasMovidas: number
  documentosRetirados: number
  carpetasBorradas: number
}

export interface VozDTO {
  id: string
  nombre: string
  pais: string
  genero: string
  motor: string
  porDefecto: boolean
}

/** contratos.md v1.1: CONVIRTIENDO / ERROR_CONVERSION cuando el libro aun no esta LISTO (no se encola voz). */
export type EstadoAudio = 'PENDIENTE' | 'GENERANDO' | 'LISTO' | 'ERROR' | 'CONVIRTIENDO' | 'ERROR_CONVERSION'

export interface EstadoAudioDTO {
  estado: EstadoAudio
  duracionSeg: number | null
  url1x: string | null
  url2x: string | null
  urlTiempos: string | null
  /** v1.2: por qué falló el capítulo, en texto humano (cuando `estado` es ERROR). */
  error?: string | null
  /** Opcional (aún no en el contrato): segundos estimados hasta que esté LISTO. */
  estimadoSeg?: number | null
  /** v1.5: con PENDIENTE/GENERANDO, el manifiesto de partes ya reproducibles (contratos §6 bis), o null. */
  urlPartes?: string | null
}

/** v1.5: una parte reproducible del capítulo que aún se genera (tiempos en la línea 1x del capítulo). */
export interface ParteAudio {
  n: number
  archivo: string
  t0: number
  t1: number
}

/** v1.5: cap-NNN.partes.json (contratos §6 bis). `frases` = tiempos de las frases de las partes ya escritas. */
export interface PartesCapitulo {
  versionFormato: number
  capitulo: number
  vozId: string
  completo: boolean
  duracionEstimada: number
  partes: ParteAudio[]
  frases: FraseTiempo[]
}

/** cap-NNN.tiempos.json (contratos §6). Palabras: [inicioChar, finChar, t0, t1]. */
export interface FraseTiempo {
  id: string
  t0: number
  t1: number
  palabras: [number, number, number, number][]
}

export interface TiemposCapitulo {
  capitulo: number
  vozId: string
  duracion: number
  frases: FraseTiempo[]
}

/** Traducción de un trozo de texto (POST /v1/traducir). */
export interface TraduccionDTO {
  traduccion: string
  origenDetectado: string | null
}

/** Traducción por frase de un capítulo (POST /v1/traducir/capitulo); si PENDIENTE, volver a preguntar. */
export interface TraduccionCapituloDTO {
  estado: 'LISTO' | 'PENDIENTE' | 'ERROR'
  frases: { id: string; texto: string }[]
  error?: string | null
}
