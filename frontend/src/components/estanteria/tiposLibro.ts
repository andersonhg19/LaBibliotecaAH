import type { EjemplarDTO } from '@tipos'

export type ModoEstante = 'lomo' | 'portada'

export interface PropsLibroEnEstante {
  libro: EjemplarDTO
  modo: ModoEstante
  /** Abrir la ficha (al tocar, o al terminar el gesto de sacar y abrir). */
  onAbrir: (libro: EjemplarDTO) => void
  /** Ancho de la portada en modo portada. */
  anchoPortada?: number
  colorFijo?: string | null
  /** Modo ordenar (Favoritos): arrastrar en horizontal o con los botones ‹ ›. */
  ordenando?: boolean
  estanteId?: string
  indice?: number
  total?: number
  /** Mover a la izquierda (-1) o a la derecha (+1) con los botones. */
  onMover?: (desde: number, hasta: number) => void
  /** Al soltar tras arrastrar: x del puntero (en pantalla) para calcular el destino. */
  onSoltarEn?: (desde: number, x: number) => void
  /** Mostrar la barra de progreso bajo la portada (estante "Leyendo ahora"). */
  conProgreso?: boolean
}

export const etiquetaLibro = (l: EjemplarDTO) => {
  const autor = l.autores?.length ? `, de ${l.autores.join(', ')}` : ''
  const estado =
    l.tipo === 'DESEO'
      ? ' (deseo)'
      : l.porcentaje > 0 && l.porcentaje < 100
        ? `, vas por el ${Math.round(l.porcentaje)} %`
        : ''
  return `${l.titulo}${autor}${estado}`
}
