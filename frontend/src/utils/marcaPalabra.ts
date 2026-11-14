/*
 * LA PALABRA QUE SE DESLIZA EN «VER TEXTO» (F1, propuesta #3 de la auditoría UX
 * y su prototipo). En vez de repintar el fondo de cada palabra, una ÚNICA capa
 * (la «marca») se mueve con `transform` hasta el rectángulo de la palabra que
 * suena: se ve fluido y casi no cuesta. Con «Reducir movimiento» salta sin
 * deslizarse. Solo web: en nativo no se pinta.
 *
 * `palabra` = [inicioChar, finChar] dentro del texto de la frase (lo que manda
 * el motor de voz; contrato §6 de tiempos.json).
 */

export interface RectMarca {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Margen alrededor de la palabra (px): la marca no se pega a las letras. */
const AIRE = 3

/**
 * El nodo de texto y el desplazamiento dentro de él para el carácter `n` del
 * elemento (recorre los nodos de texto en orden). Null si se pasa del final.
 */
export function puntoEnTexto(el: Node, n: number): { nodo: Text; desplazamiento: number } | null {
  let quedan = Math.max(0, n)
  const pila: Node[] = [el]
  while (pila.length) {
    const nodo = pila.shift() as Node
    if (nodo.nodeType === 3) {
      const largo = (nodo.textContent ?? '').length
      if (quedan <= largo) return { nodo: nodo as Text, desplazamiento: quedan }
      quedan -= largo
    } else {
      pila.unshift(...Array.from(nodo.childNodes))
    }
  }
  return null
}

/**
 * Dónde va la marca, relativa a `contenedor`, para la palabra [a, b] dentro del
 * elemento de la frase. Si la palabra se parte entre dos líneas, la primera.
 */
export function rectDePalabra(frase: HTMLElement, a: number, b: number, contenedor: HTMLElement): RectMarca | null {
  if (!(b > a)) return null
  const ini = puntoEnTexto(frase, a)
  const fin = puntoEnTexto(frase, b)
  if (!ini || !fin || typeof document === 'undefined') return null
  const r = document.createRange()
  try {
    r.setStart(ini.nodo, ini.desplazamiento)
    r.setEnd(fin.nodo, fin.desplazamiento)
  } catch {
    return null
  }
  const caja = r.getClientRects()[0] ?? r.getBoundingClientRect()
  if (!caja || !(caja.width > 0)) return null
  const c = contenedor.getBoundingClientRect()
  return {
    x: Math.round(caja.left - c.left - AIRE),
    y: Math.round(caja.top - c.top),
    ancho: Math.round(caja.width + AIRE * 2),
    alto: Math.round(caja.height),
  }
}

/** Pone la marca en su sitio (o la esconde con null). `deslizar` = con transición. */
export function ponerMarca(marca: HTMLElement, r: RectMarca | null, deslizar: boolean): void {
  if (!r) {
    marca.style.opacity = '0'
    return
  }
  const estaba = marca.style.opacity === '1'
  // La primera vez (o tras esconderse) aparece en su sitio, sin venir volando desde la esquina.
  marca.style.transition =
    deslizar && estaba
      ? 'transform 160ms cubic-bezier(.3,.7,.4,1), width 160ms cubic-bezier(.3,.7,.4,1), height 160ms ease, opacity 120ms ease'
      : 'none'
  marca.style.transform = `translate(${r.x}px, ${r.y}px)`
  marca.style.width = `${r.ancho}px`
  marca.style.height = `${r.alto}px`
  marca.style.opacity = '1'
}
