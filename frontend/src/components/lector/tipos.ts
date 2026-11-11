import type { Preferencias } from '@contextos/PreferenciasContext'
import type { AnotacionDTO } from '@tipos'

export interface Ubicacion {
  /** 0..1 del libro. */
  fraccion: number
  cfi: string | null
  fraseId: string | null
  capitulo: number
  /** Título del capítulo actual según el índice del EPUB. */
  etiqueta: string
  /** Por qué se movió: 'page' | 'snap' | 'scroll' (el usuario), 'anchor' | 'navigation' | 'selection'. */
  motivo: string
}

export interface Seleccion {
  texto: string
  cfi: string | null
  fraseInicio: string | null
  offsetInicio: number | null
  fraseFin: string | null
  offsetFin: number | null
  prefijo: string
  sufijo: string
  capitulo: number
  /** Rectángulo de la selección en coordenadas de la ventana. */
  x: number
  y: number
  ancho: number
  alto: number
}

export interface ItemIndice {
  titulo: string
  href: string
  nivel: number
}

export interface InfoLibro {
  indice: ItemIndice[]
  /** Dónde empieza cada sección (0..1) y cómo se llama, para la vista previa del deslizador. */
  secciones: { fraccion: number; titulo: string }[]
}

export interface ResultadoBusqueda {
  cfi: string
  antes: string
  coincidencia: string
  despues: string
  capitulo: string
}

export interface Destino {
  cfi?: string | null
  fraseId?: string | null
  fraccion?: number | null
  href?: string | null
}

export interface ControlLector {
  irA: (d: Destino) => Promise<void>
  siguiente: () => void
  anterior: () => void
  buscar: (texto: string) => Promise<ResultadoBusqueda[]>
  limpiarBusqueda: () => void
  volverAtras: () => void
  pintarAnotacion: (a: AnotacionDTO) => void
  borrarAnotacion: (a: AnotacionDTO) => void
  limpiarSeleccion: () => void
  /** Volver a seguir a la voz (y saltar a la frase que suena). */
  seguirVoz: () => void
}

export interface PropsLector {
  ejemplarId: string
  url: string
  prefs: Preferencias
  inicial: Destino | null
  anotaciones: AnotacionDTO[]
  onListo: (info: InfoLibro) => void
  onReubicar: (u: Ubicacion) => void
  onSeleccion: (s: Seleccion | null) => void
  onTocarAnotacion: (a: AnotacionDTO) => void
  onSiguiendoVoz: (siguiendo: boolean) => void
  onPuedeVolver: (puede: boolean) => void
  onError: (mensaje: string) => void
  onToqueCentro?: () => void
}
