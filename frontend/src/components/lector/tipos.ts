import type { ModoTraduccion } from '@componentes/lector/traduccion'
import type { Preferencias } from '@contextos/PreferenciasContext'
import type { AnotacionDTO } from '@tipos'

export interface Ubicacion {
  /** 0..1 del libro (foliate la da al FINAL de la página a la vista). */
  fraccion: number
  /** 0..1 del libro al PRINCIPIO de la página a la vista (dónde vas dentro del capítulo). */
  fraccionInicio?: number | null
  cfi: string | null
  fraseId: string | null
  capitulo: number
  /** Título del capítulo actual según el índice del EPUB. */
  etiqueta: string
  /** Por qué se movió: 'page' | 'snap' | 'scroll' (el usuario), 'anchor' | 'navigation' | 'selection'. */
  motivo: string
  /**
   * Si el movimiento lo hizo la persona (pasar página, desplazarse, índice,
   * buscar, ir a %…) y no el libro solo (abrir, seguir a la voz). Solo
   * entonces se guarda la posición (QA LV-04).
   */
  porUsuario: boolean
  /** Página impresa estimada y total (folio), si se sabe. */
  pagina: number | null
  paginas: number | null
  /** Minutos que quedan del capítulo (a 1x), si se sabe. */
  minutosRestantes: number | null
  /** Ids de las frases a la vista (para saber si hay marcador en esta página). */
  frases: string[]
  /** El texto de la primera frase a la vista (la cita de un marcador). */
  textoInicio: string | null
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
  /** El idioma que declara el EPUB (o el del texto), para ofrecer «Ver en español». */
  idioma?: string | null
  /** Dónde empieza cada sección (0..1) y cómo se llama, para la vista previa del deslizador. */
  secciones: { fraccion: number; titulo: string; href?: string }[]
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
  /** Repinta una nota editada (color o texto) donde ya estaba anclada. */
  actualizarAnotacion: (a: AnotacionDTO) => void
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
  /** Idioma del libro según la ficha (para la partición silábica si el EPUB no lo declara). */
  idioma?: string | null
  /** Título del libro (cabecera de la página izquierda en el libro abierto del PC). */
  titulo?: string
  /** «Ver en español»: el modo y las frases traducidas que hay (id → texto). */
  traduccion?: { modo: ModoTraduccion; frases: Record<string, string> }
  /** Minutos de voz a 1x de un capítulo, para «quedan 12 min» en el folio. */
  minutosDe?: (capitulo: number) => number | null
}
