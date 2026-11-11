import { BIBLIOTECA_PREFIJO } from '@config'
import api from '@servicios/api'
import type {
  AnotacionDTO,
  ComentarioDTO,
  EjemplarDTO,
  EjemplarDetalleDTO,
  EstadoAudioDTO,
  EstanteDTO,
  FacetasDTO,
  FiltroLibrosDTO,
  GuardarEjemplarDTO,
  PageDTO,
  ProgresoDTO,
  ResultDTO,
  TipoEjemplar,
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
  ): Promise<ResultDTO<EjemplarDTO[]>> => {
    const datos = new FormData()
    datos.append('archivos', archivo, archivo.name || 'archivo')
    datos.append('tipo', tipo)
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
  facetas: () => post<FacetasDTO>('/libros/facetas'),
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

export const vocesService = {
  todas: () => post<VozDTO[]>('/voces/all'),
}

export const audioService = {
  estado: (d: { ejemplarId: string; vozId: string; capitulo: number }) => post<EstadoAudioDTO>('/audio/estado', d),
}

export type { TipoEjemplar }
