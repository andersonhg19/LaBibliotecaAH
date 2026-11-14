import { esWeb, reducirMovimiento } from '@tema/web'

/*
 * LA PORTADA VUELA A LA FICHA (F2, propuesta #1 de la auditoría UX y su
 * prototipo). Técnica FLIP: al tocar una portada (catálogo, atril…) se guarda
 * su rectángulo; al montarse la ficha de ESE libro, su tapa se dibuja en su
 * sitio final y se anima con `transform` desde el rectángulo de origen hasta
 * ninguno (solo transform: va por la GPU y no mueve el diseño). ≤ 400 ms.
 * Con «Reducir movimiento», en vez de volar aparece con un fundido corto.
 *
 * Las portadas se marcan con `data-portada="<id>"` (dataSet en Portada.tsx);
 * un único oyente en fase de captura apunta cuál se tocó. Solo web.
 */

export const DURACION_VUELO_MS = 380
/** Un origen viejo (tocaste hace rato y la ficha llega por otro camino) no vuela. */
const CADUCA_MS = 2500

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

let origen: { id: string; rect: Rect; t: number } | null = null

/** Apunta de dónde sale el libro `id` (lo usan el oyente global y las pruebas). */
export function guardarOrigen(id: string, rect: Rect, ahora = Date.now()): void {
  if (!id || !(rect.width > 0) || !(rect.height > 0)) return
  origen = { id, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, t: ahora }
}

/** ¿Hay un vuelo pendiente hacia la ficha de `id`? (para no repetir la llegada de siempre). */
export function hayVueloPara(id: string, ahora = Date.now()): boolean {
  return !!origen && origen.id === id && ahora - origen.t < CADUCA_MS
}

/** La transformación que lleva el destino al origen (el «Invert» de FLIP). */
export function transformDesde(de: Rect, a: Rect): string {
  const sx = de.width / a.width
  const sy = de.height / a.height
  const r = (n: number) => Math.round(n * 1000) / 1000
  return `translate(${r(de.left - a.left)}px, ${r(de.top - a.top)}px) scale(${r(sx)}, ${r(sy)})`
}

type ElementoAnimable = {
  getBoundingClientRect: () => Rect
  animate?: (k: Keyframe[], o: KeyframeAnimationOptions) => unknown
  style?: { transformOrigin?: string }
}

/**
 * Hace volar la tapa de la ficha (`el`) desde donde se tocó. Devuelve true si
 * animó algo. Consume el origen: la siguiente ficha no vuela por error.
 */
export function volarPortada(id: string, el: unknown, ahora = Date.now()): boolean {
  if (!hayVueloPara(id, ahora)) return false
  const de = origen!.rect
  origen = null
  const nodo = el as ElementoAnimable | null
  if (!nodo || typeof nodo.getBoundingClientRect !== 'function' || typeof nodo.animate !== 'function') return false
  if (reducirMovimiento()) {
    nodo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' })
    return true
  }
  const a = nodo.getBoundingClientRect()
  if (!(a.width > 0) || !(a.height > 0)) return false
  if (nodo.style) nodo.style.transformOrigin = '0 0'
  nodo.animate([{ transform: transformDesde(de, a) }, { transform: 'none' }], {
    duration: DURACION_VUELO_MS,
    easing: 'cubic-bezier(.2,.8,.2,1)',
  })
  return true
}

/* El oyente global: el puntero o el teclado (Enter/Espacio) sobre una portada marcada. */
let instalado = false
export function instalarVuelo(): void {
  if (!esWeb || instalado || typeof document === 'undefined') return
  instalado = true
  const apuntar = (destino: EventTarget | null) => {
    const el = (destino as Element | null)?.closest?.('[data-portada]') as HTMLElement | null
    const id = el?.getAttribute('data-portada')
    if (el && id) guardarOrigen(id, el.getBoundingClientRect())
  }
  document.addEventListener('pointerup', (e) => apuntar(e.target), true)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const activo = document.activeElement
      // La portada puede estar DENTRO del botón que tiene el foco.
      apuntar(activo?.querySelector?.('[data-portada]') ?? activo)
    },
    true,
  )
}

instalarVuelo()
