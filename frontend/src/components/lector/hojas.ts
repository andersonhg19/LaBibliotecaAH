/*
 * EL MODO «HOJAS». foliate pinta el capítulo en su flujo `scrolled` (una tira
 * vertical) y aquí se le da forma de libro: el texto se reparte en HOJAS de
 * papel con el largo real de una página (alto ≈ 1,45 × ancho), una debajo de
 * otra, separadas por un hueco con sombra y con su folio al pie.
 *
 * Sin partir líneas: cada corte cae ANTES de un párrafo o de una frase (las
 * `.bah-f` del taller) y se abre con un `::before` de la clase `bah-corte` que
 * empuja el texto a la hoja siguiente. Nada se inserta en el DOM del libro (los
 * CFI de notas y progreso no cambian): las hojas se dibujan en una capa hermana
 * del <body> (#bah-hojas), detrás del texto.
 */
import type { TemaPapel } from '@contextos/PreferenciasContext'

/** La mesa sobre la que descansan las hojas (más honda que el papel). */
export const MESA: Record<TemaPapel, string> = { noche: '#0E0906', pergamino: '#C7B189', marfil: '#D6CCB8' }

export interface GeometriaHoja {
  /** Ancho de la hoja (el <body>, con su relleno). */
  ancho: number
  /** Alto de una hoja. */
  alto: number
  /** Relleno de arriba y de abajo (el de abajo deja sitio al folio) y de los lados. */
  arriba: number
  abajo: number
  lados: number
  /** Hueco entre hoja y hoja. */
  hueco: number
}

/** La hoja según la ventana: en el PC una columna legible de ~660 px; en el teléfono, casi todo el ancho. */
export function geometriaHoja(anchoVentana: number): GeometriaHoja {
  const movil = anchoVentana < 600
  const ancho = movil ? Math.max(260, anchoVentana - 16) : Math.min(680, Math.max(480, anchoVentana - 120))
  return {
    ancho,
    alto: Math.round(ancho * 1.45),
    arriba: movil ? 36 : 64,
    abajo: movil ? 44 : 64,
    lados: movil ? 20 : 64,
    hueco: movil ? 20 : 32,
  }
}

/** Un trozo que puede abrir una hoja nueva: dónde empieza su primera línea y dónde acaba. */
export interface Candidato {
  arriba: number
  abajo: number
  /** Un párrafo (puede bajar entero) o una frase dentro de un párrafo. */
  bloque: boolean
}

/**
 * Dónde se corta una hoja cuyo texto debe acabar en `limite`: el índice del
 * primer trozo (desde `desde`) que ya no cabe y ante el que se abre la hoja
 * siguiente, o -1 si todo cabe. Un párrafo que cruza el límite no se corta él:
 * se busca dentro la frase que cruza (vienen después, en orden del documento).
 * Un trozo que empieza arriba del todo y aun así no cabe (una frase más larga
 * que una hoja) no puede bajar entero: se deja correr y se corta en el siguiente.
 */
export function elegirCorte(c: Candidato[], desde: number, limite: number, inicioTexto: number): number {
  for (let i = desde; i < c.length; i++) {
    const x = c[i]
    if (x.abajo <= limite + 0.5) continue
    // Empieza ya por debajo del límite: la hoja siguiente empieza aquí.
    if (x.arriba >= limite - 2) return i
    // Cruza el límite. Un párrafo con frases dentro deja decidir a sus frases.
    if (x.bloque && c[i + 1] && !c[i + 1].bloque && c[i + 1].arriba < x.abajo) continue
    if (x.arriba <= inicioTexto + 1) continue
    return i
  }
  return -1
}

const BLOQUES = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figure,table,dt,dd,hr,img'
const ID_CAPA = 'bah-hojas'

/** Quita los cortes y la capa de hojas (antes de volver a maquetar). */
export function limpiarHojas(doc: Document) {
  doc.getElementById(ID_CAPA)?.remove()
  doc.body?.style.removeProperty('min-height')
  doc.querySelectorAll('.bah-corte').forEach((e) => {
    e.classList.remove('bah-corte')
    ;(e as HTMLElement).style.removeProperty('--bah-hueco')
  })
}

/** Dónde empieza el texto de un elemento (su primera línea de verdad, sin el ::before del corte). */
function arribaDelTexto(e: Element): number {
  const r = e.ownerDocument.createRange()
  r.selectNodeContents(e)
  const rs = Array.from(r.getClientRects()).filter((x) => x.height > 0)
  return rs.length ? rs[0].top : e.getBoundingClientRect().top
}

function candidatos(doc: Document): { el: Element; bloque: boolean }[] {
  const lista: { el: Element; bloque: boolean }[] = []
  doc.body.querySelectorAll(`${BLOQUES},.bah-f`).forEach((el) => {
    if ((el as HTMLElement).offsetParent === null && el.tagName !== 'BODY') return
    const bloque = !el.classList.contains('bah-f')
    // Un bloque que contiene otros bloques no se corta él: se cortan sus hijos.
    if (bloque && el.querySelector(BLOQUES)) return
    lista.push({ el, bloque })
  })
  return lista
}

/**
 * Reparte el capítulo en hojas. `folio(n)` da el texto del pie de la n-ésima
 * hoja del capítulo (0, 1, 2…). Devuelve cuántas hojas salieron.
 */
export function maquetarHojas(doc: Document, g: GeometriaHoja, folio: (n: number) => string, tinta: string): number {
  const body = doc.body
  if (!body) return 0
  limpiarHojas(doc)
  const base = body.getBoundingClientRect().top
  const lista = candidatos(doc)
  const inicios = [base]
  let desde = 0
  for (let vueltas = 0; vueltas < 2000; vueltas++) {
    const inicio = inicios[inicios.length - 1]
    const limite = inicio + g.alto - g.abajo
    const datos: Candidato[] = lista.slice(desde).map(({ el, bloque }) => {
      const r = el.getBoundingClientRect()
      return { arriba: arribaDelTexto(el), abajo: r.bottom, bloque }
    })
    const k = elegirCorte(datos, 0, limite, inicio + g.arriba)
    if (k < 0) break
    const i = desde + k
    const el = lista[i].el as HTMLElement
    const siguiente = inicio + g.alto + g.hueco
    const deseado = siguiente + g.arriba
    el.classList.add('bah-corte')
    let hueco = Math.max(0, deseado - arribaDelTexto(el))
    el.style.setProperty('--bah-hueco', `${hueco}px`)
    // Medir y corregir (márgenes que colapsan, la línea partida por el ::before…).
    for (let n = 0; n < 3; n++) {
      const error = deseado - arribaDelTexto(el)
      if (Math.abs(error) < 0.5) break
      hueco = Math.max(0, hueco + error)
      el.style.setProperty('--bah-hueco', `${hueco}px`)
    }
    inicios.push(siguiente)
    desde = i + 1
  }
  // La última hoja tiene su largo entero: el <body> llega hasta su pie (foliate mide el documento).
  const ultima = inicios[inicios.length - 1]
  if (body.getBoundingClientRect().bottom < ultima + g.alto)
    body.style.setProperty('min-height', String(ultima + g.alto - base) + 'px', 'important')
  // La capa de hojas, detrás del texto (hermana del <body>: no toca los CFI).
  const html = doc.documentElement
  const capa = doc.createElement('div')
  capa.id = ID_CAPA
  capa.setAttribute('aria-hidden', 'true')
  const caja = body.getBoundingClientRect()
  const raiz = html.getBoundingClientRect()
  const fin = Math.max(caja.bottom, inicios[inicios.length - 1] + g.alto)
  inicios.forEach((top, n) => {
    const hoja = doc.createElement('div')
    hoja.className = 'bah-hoja'
    const alto = n === inicios.length - 1 ? Math.max(g.alto, fin - top) : g.alto
    hoja.style.cssText = `top:${top - raiz.top}px;left:${caja.left - raiz.left}px;width:${caja.width}px;height:${alto}px`
    const pie = doc.createElement('div')
    pie.className = 'bah-folio'
    pie.style.color = tinta
    pie.textContent = folio(n)
    hoja.appendChild(pie)
    capa.appendChild(hoja)
  })
  html.appendChild(capa)
  return inicios.length
}

/** El CSS de las hojas (va dentro del libro, con el resto de cssDelLibro). */
export function cssHojas(g: GeometriaHoja, papel: { fondo: string }, mesa: string, noche: boolean): string {
  const sombra = noche
    ? '0 1px 0 rgba(255,230,190,0.05) inset, 0 14px 30px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.5)'
    : '0 12px 28px rgba(60,35,15,0.28), 0 2px 5px rgba(60,35,15,0.22)'
  return `
html{background:${mesa}!important;position:relative!important}
body{box-sizing:border-box!important;max-width:${g.ancho}px!important;padding:${g.arriba}px ${g.lados}px ${g.abajo}px!important;position:relative;z-index:1;background:transparent!important}
#bah-hojas{position:absolute;inset:0;z-index:0;pointer-events:none}
.bah-hoja{position:absolute;background:${papel.fondo};box-shadow:${sombra};border-radius:2px${noche ? ';outline:1px solid rgba(201,162,39,0.14)' : ''}}
.bah-folio{position:absolute;left:0;right:0;bottom:${Math.round(g.abajo / 2 - 8)}px;text-align:center;font:600 15px/1 'Cormorant Garamond',Georgia,serif;letter-spacing:.06em;font-variant:small-caps;font-variant-numeric:lining-nums;opacity:.62}
.bah-corte::before{content:'';display:block;height:var(--bah-hueco,0px)}`
}

/**
 * En Hojas, foliate solo pinta un capítulo a la vez y su tira se acaba: seguir
 * desplazando al llegar al pie (o a la cabeza) pasa al capítulo siguiente (o al
 * anterior). Devuelve 1, -1 o 0 según la posición del contenedor y hacia dónde
 * empuja la persona (positivo = hacia abajo).
 */
export function pasoDeCapitulo(
  c: { scrollTop: number; clientHeight: number; scrollHeight: number },
  empuje: number,
): -1 | 0 | 1 {
  const alPie = c.scrollTop + c.clientHeight >= c.scrollHeight - 2
  const enCabeza = c.scrollTop <= 1
  if (empuje > 0 && alPie) return 1
  if (empuje < 0 && enCabeza) return -1
  return 0
}
