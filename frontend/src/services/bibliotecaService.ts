import { BIBLIOTECA_PREFIJO, MODO_DEMO } from '@config'
import api from '@servicios/api'
import type {
  AnotacionDTO,
  CapituloResumen,
  CarpetaBorradaDTO,
  CarpetaContenidoDTO,
  CarpetaDTO,
  ComentarioDTO,
  EjemplarDTO,
  EjemplarDetalleDTO,
  EstadoAudioDTO,
  EstadoCasaDTO,
  EstanteDTO,
  FacetasDTO,
  FiltroLibrosDTO,
  GuardarEjemplarDTO,
  OrdenCarpeta,
  PageDTO,
  Pestana,
  PreparacionLibroDTO,
  ProgresoDTO,
  ResultDTO,
  TipoEjemplar,
  TraduccionCapituloDTO,
  TraduccionDTO,
  VozDTO,
} from '@tipos'

/*
 * La API de biblioteca-service (contratos §9). Todo POST con ResultDTO; la
 * identidad sale del token, así que ningún método recibe userId.
 */
const B = BIBLIOTECA_PREFIJO

const post = async <T>(ruta: string, cuerpo?: unknown): Promise<ResultDTO<T>> => {
  const r = await api.post<ResultDTO<T>>(`${B}${ruta}`, cuerpo)
  return r.data
}

/** Un archivo elegido en el navegador (File) o un objeto {uri,name,type} en nativo. */
export type ArchivoParaSubir = Blob & { name?: string }

export const librosService = {
  /**
   * Sube UN archivo (la pantalla los manda de uno en uno para pintar una barra
   * de progreso por archivo). El campo multipart es `archivos` (lista en Spring).
   */
  subir: async (
    archivo: ArchivoParaSubir,
    tipo: 'LIBRO' | 'DOCUMENTO',
    alProgresar?: (fraccion: number) => void,
    opciones?: { deseoId?: string; carpetaId?: string | null },
  ): Promise<ResultDTO<EjemplarDTO[]>> => {
    const datos = new FormData()
    datos.append('archivos', archivo, archivo.name || 'archivo')
    datos.append('tipo', tipo)
    /* "Ya lo tengo" (BI-15, contrato v1.3.2): con deseoId y UN archivo, el servidor convierte el
       deseo en el ejemplar que llega y borra el deseo; la web no tiene que borrar nada. */
    if (opciones?.deseoId) datos.append('deseoId', opciones.deseoId)
    /* Contrato v1.6: subir directamente a una carpeta del archivador (solo documentos). */
    if (opciones?.carpetaId) datos.append('carpetaId', opciones.carpetaId)
    const r = await api.post<ResultDTO<EjemplarDTO[]>>(`${B}/libros/subir`, datos, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 0,
      onUploadProgress: (e) => {
        if (alProgresar && e.total) alProgresar(Math.min(1, e.loaded / e.total))
      },
    })
    return r.data
  },
  deseo: (d: { titulo: string; autor?: string; isbn?: string; nota?: string }) => post<EjemplarDTO>('/libros/deseo', d),
  todos: (f: FiltroLibrosDTO) => post<PageDTO<EjemplarDTO>>('/libros/all', f),
  detalle: (id: string) => post<EjemplarDetalleDTO>(`/libros/get/${encodeURIComponent(id)}`),
  guardar: (d: GuardarEjemplarDTO) => post<EjemplarDTO>('/libros/save', d),
  borrar: (id: string) => post<boolean>(`/libros/delete/${encodeURIComponent(id)}`),
  /** v1.2: las facetas de UNA pestaña (por defecto TODO = solo libros): cada número es lo que da el filtro. */
  facetas: (pestana?: Pestana) => post<FacetasDTO>('/libros/facetas', pestana ? { pestana } : undefined),
}

export const progresoService = {
  obtener: (ejemplarId: string) => post<ProgresoDTO | null>(`/progreso/get/${encodeURIComponent(ejemplarId)}`),
  guardar: (p: ProgresoDTO) => post<ProgresoDTO>('/progreso/save', p),
}

export const anotacionesService = {
  todas: (ejemplarId: string) => post<AnotacionDTO[]>(`/anotaciones/all/${encodeURIComponent(ejemplarId)}`),
  guardar: (a: AnotacionDTO) => post<AnotacionDTO>('/anotaciones/save', a),
  borrar: (id: string) => post<boolean>(`/anotaciones/delete/${encodeURIComponent(id)}`),
}

export const comentariosService = {
  todos: (ejemplarId: string) => post<ComentarioDTO[]>(`/comentarios/all/${encodeURIComponent(ejemplarId)}`),
  guardar: (c: { ejemplarId: string; texto: string; id?: string }) => post<ComentarioDTO>('/comentarios/save', c),
  borrar: (id: string) => post<boolean>(`/comentarios/delete/${encodeURIComponent(id)}`),
}

export const estantesService = {
  todos: () => post<EstanteDTO[]>('/estantes/all'),
  guardar: (e: { id?: string; nombre: string; colorMadera?: string | null }) => post<EstanteDTO>('/estantes/save', e),
  borrar: (id: string) => post<boolean>(`/estantes/delete/${encodeURIComponent(id)}`),
  libros: (id: string) => post<EjemplarDTO[]>(`/estantes/${encodeURIComponent(id)}/libros`),
  agregar: (id: string, ejemplarId: string) =>
    post<boolean>(`/estantes/${encodeURIComponent(id)}/agregar`, { ejemplarId }),
  quitar: (id: string, ejemplarId: string) =>
    post<boolean>(`/estantes/${encodeURIComponent(id)}/quitar`, { ejemplarId }),
  ordenar: (id: string, m: { ejemplarId: string; antesDe?: string; despuesDe?: string }) =>
    post<boolean>(`/estantes/${encodeURIComponent(id)}/ordenar`, m),
}

/*
 * EL ARCHIVADOR (contrato v1.6): carpetas y subcarpetas de documentos. carpetaId
 * null = la raíz. Todo POST con ResultDTO, como el resto.
 */
export const carpetasService = {
  todas: () => post<CarpetaDTO[]>('/carpetas/all'),
  contenido: (f: { carpetaId?: string | null; texto?: string; orden?: OrdenCarpeta }) =>
    post<CarpetaContenidoDTO>('/carpetas/contenido', {
      carpetaId: f.carpetaId ?? null,
      ...(f.texto?.trim() ? { texto: f.texto.trim() } : {}),
      ...(f.orden ? { orden: f.orden } : {}),
    }),
  guardar: (c: { id?: string; nombre: string; padreId?: string | null }) => post<CarpetaDTO>('/carpetas/save', c),
  mover: (carpetaId: string, destinoId: string | null) => post<CarpetaDTO>('/carpetas/mover', { carpetaId, destinoId }),
  moverDocumentos: (ejemplarIds: string[], carpetaId: string | null) =>
    post<number>('/carpetas/mover-documentos', { ejemplarIds, carpetaId }),
  borrar: (id: string, contenido?: 'SUBIR' | 'BORRAR') =>
    post<CarpetaBorradaDTO>(`/carpetas/delete/${encodeURIComponent(id)}`, contenido ? { contenido } : undefined),
}

export const vocesService = {
  todas: () => post<VozDTO[]>('/voces/all'),
}

/**
 * El cuerpo de /audio/estado. ÚNICO sitio que conoce el nombre del campo con el
 * que se pide reintentar un capítulo en ERROR (contrato v1.2): si el backend lo
 * llama de otra forma, se cambia solo aquí.
 */
export function cuerpoEstadoAudio(
  d: { ejemplarId: string; vozId: string; capitulo: number },
  reintentar = false,
): Record<string, unknown> {
  return reintentar ? { ...d, reintentar: true } : { ...d }
}

/*
 * 0.4.0 · «EN EL AUDIOLIBRO» POR CAPÍTULO (contrato C3). Las únicas rutas con
 * PUT/GET del cliente: así las definió el contrato compartido de la 0.4.0.
 */
export const capitulosVozService = {
  /** enVoz null = volver a lo que decide el taller para ese capítulo. */
  cambiar: async (ejemplarId: string, indice: number, enVoz: boolean | null): Promise<ResultDTO<CapituloResumen>> => {
    const r = await api.put<ResultDTO<CapituloResumen>>(
      `${B}/ejemplares/${encodeURIComponent(ejemplarId)}/capitulos/${indice}/voz`,
      { enVoz },
    )
    return r.data
  },
  /** true = solo la historia (región cuerpo) en el audiolibro; false = borra las preferencias. */
  soloHistoria: async (ejemplarId: string, soloHistoria: boolean): Promise<ResultDTO<unknown>> => {
    const r = await api.put<ResultDTO<unknown>>(`${B}/ejemplares/${encodeURIComponent(ejemplarId)}/capitulos/voz`, {
      soloHistoria,
    })
    return r.data
  },
}

/** 0.4.0 · «Preparar el libro entero» (contrato C5): encola en baja prioridad lo que falta. */
export const preparacionService = {
  preparar: (ejemplarId: string, vozId: string) => post<boolean>('/voz/preparar-libro', { ejemplarId, vozId }),
  estado: async (ejemplarId: string, vozId: string): Promise<ResultDTO<PreparacionLibroDTO>> => {
    const r = await api.get<ResultDTO<PreparacionLibroDTO>>(`${B}/voz/preparar-libro`, {
      params: { ejemplarId, vozId },
    })
    return r.data
  },
}

/** 0.4.0 · La lámpara del estado de la casa (contrato C6). */
export const estadoCasaService = {
  obtener: async (): Promise<ResultDTO<EstadoCasaDTO>> => {
    const r = await api.get<ResultDTO<EstadoCasaDTO>>(`${B}/estado-casa`)
    return r.data
  },
}

export const audioService = {
  estado: (d: { ejemplarId: string; vozId: string; capitulo: number }, o?: { reintentar?: boolean }) =>
    post<EstadoAudioDTO>('/audio/estado', cuerpoEstadoAudio(d, o?.reintentar)),
}

export type { TipoEjemplar }

/*
 * TRADUCCIÓN (contrato del coordinador, backend en curso):
 *   POST /v1/traducir           {texto, origen?: 'en'|'auto', destino: 'es'} → {traduccion, origenDetectado}
 *   POST /v1/traducir/capitulo  {ejemplarId, capitulo, destino: 'es'} → {estado, frases: [{id, texto}], error?}
 * ADAPTADOR mientras el servidor no lo tenga: si la ruta no existe (404) se
 * contesta con un error claro; en el modo demostración se simula marcando el
 * texto como «(simulada)», para poder probar la pantalla sin backend.
 */
export const TOPE_TRADUCCION = 5000
const NO_DISPONIBLE = 'La traducción todavía no está disponible en la biblioteca.'
const sinRuta = (e: unknown) => {
  const st = (e as { response?: { status?: number } } | null)?.response?.status
  return st === 404 || st === 405
}
const simulada = (t: string) => `(simulada) ${t}`

export const traduccionService = {
  traducir: async (d: { texto: string; origen?: 'en' | 'auto'; destino?: 'es' }): Promise<ResultDTO<TraduccionDTO>> => {
    const cuerpo = { texto: d.texto.slice(0, TOPE_TRADUCCION), origen: d.origen ?? 'auto', destino: d.destino ?? 'es' }
    if (MODO_DEMO)
      return {
        correct: true,
        message: 'OK',
        errorCode: 0,
        object: { traduccion: simulada(cuerpo.texto), origenDetectado: 'en' },
      }
    try {
      return await post<TraduccionDTO>('/traducir', cuerpo)
    } catch (e) {
      if (sinRuta(e)) return { correct: false, message: NO_DISPONIBLE, errorCode: 404, object: null as never }
      throw e
    }
  },
  capitulo: async (d: {
    ejemplarId: string
    capitulo: number
    destino?: 'es'
  }): Promise<ResultDTO<TraduccionCapituloDTO>> => {
    const cuerpo = { ...d, destino: d.destino ?? 'es' }
    if (MODO_DEMO) return { correct: true, message: 'OK', errorCode: 0, object: { estado: 'LISTO', frases: [] } }
    try {
      return await post<TraduccionCapituloDTO>('/traducir/capitulo', cuerpo)
    } catch (e) {
      if (sinRuta(e)) return { correct: false, message: NO_DISPONIBLE, errorCode: 404, object: null as never }
      throw e
    }
  },
}
