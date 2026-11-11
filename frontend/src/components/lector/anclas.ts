/*
 * LAS TRES ANCLAS DE UNA NOTA (plan §7.3), del lado del DOM del libro:
 *   1. el CFI (lo calcula foliate);
 *   2. frase + desplazamiento: el id del <span class="bah-f"> y cuántos
 *      caracteres hay desde su inicio;
 *   3. la cita con 32 caracteres antes y después.
 * Si el libro se reprocesa y el CFI ya no vale, se re-ancla con (2) y si no
 * con (3). Funciones puras sobre un Document: no dependen de React.
 */

export const fraseDe = (nodo: Node | null): HTMLElement | null => {
  if (!nodo) return null
  const el = nodo.nodeType === Node.ELEMENT_NODE ? (nodo as Element) : nodo.parentElement
  return (el?.closest('.bah-f') as HTMLElement | null) ?? null
}

/** Caracteres de texto desde el inicio de `el` hasta (nodo, offset). */
export function offsetDentro(el: HTMLElement, nodo: Node, offset: number): number {
  const r = el.ownerDocument.createRange()
  r.setStart(el, 0)
  try {
    r.setEnd(nodo, offset)
  } catch {
    return 0
  }
  return r.toString().length
}

/** El punto (nodo de texto, offset) que está `n` caracteres dentro de `el`. */
export function puntoEn(el: HTMLElement, n: number): { nodo: Node; offset: number } {
  const w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let resto = Math.max(0, n)
  let ultimo: Text | null = null
  for (let t = w.nextNode() as Text | null; t; t = w.nextNode() as Text | null) {
    ultimo = t
    if (resto <= t.length) return { nodo: t, offset: resto }
    resto -= t.length
  }
  return ultimo ? { nodo: ultimo, offset: ultimo.length } : { nodo: el, offset: 0 }
}

/** Rango desde las anclas de frase (2). */
export function rangoDesdeFrases(
  doc: Document,
  fraseInicio: string,
  offsetInicio: number,
  fraseFin: string,
  offsetFin: number,
): Range | null {
  const a = doc.getElementById(fraseInicio)
  const b = doc.getElementById(fraseFin)
  if (!a || !b) return null
  const p = puntoEn(a, offsetInicio)
  const q = puntoEn(b, offsetFin)
  const r = doc.createRange()
  try {
    r.setStart(p.nodo, p.offset)
    r.setEnd(q.nodo, q.offset)
  } catch {
    return null
  }
  return r.collapsed ? null : r
}

/** Caracteres iguales al final de `a` y `b` (cuánto coincide el contexto de antes). */
const comunAlFinal = (a: string, b: string) => {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}
/** Caracteres iguales al principio de `a` y `b` (cuánto coincide el contexto de después). */
const comunAlPrincipio = (a: string, b: string) => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Dónde está la cita dentro del texto de una sección (QA LV-01). No basta la
 * primera aparición: «Las olas rompían…» puede estar en varios capítulos y en
 * varios sitios del mismo. Se elige la aparición cuyo contexto (los 32
 * caracteres de antes y de después guardados con la nota) mejor coincide; si
 * hay contexto guardado y ninguna aparición lo comparte, NO se ancla (mejor una
 * nota huérfana que una nota pintada en otro sitio).
 */
export function indiceDeCita(texto: string, cita: string, prefijo?: string | null, sufijo?: string | null): number {
  if (!texto || !cita) return -1
  const apariciones: number[] = []
  for (let i = texto.indexOf(cita); i >= 0; i = texto.indexOf(cita, i + 1)) apariciones.push(i)
  if (!apariciones.length) return -1
  const pre = prefijo ?? ''
  const suf = sufijo ?? ''
  if (!pre && !suf) return apariciones[0]
  let mejor = -1
  let puntos = -1
  for (const i of apariciones) {
    const p =
      comunAlFinal(texto.slice(Math.max(0, i - pre.length), i), pre) +
      comunAlPrincipio(texto.slice(i + cita.length, i + cita.length + suf.length), suf)
    if (p > puntos) {
      puntos = p
      mejor = i
    }
  }
  const minimo = Math.min(6, pre.length + suf.length)
  return puntos >= minimo ? mejor : -1
}

/** El capítulo de una nota: el que trae guardado o el de su frase (c003-s00012 → 3). */
export function capituloDeNota(a: { capitulo?: number | null; fraseInicio?: string | null }): number | null {
  if (a.capitulo != null && a.capitulo >= 0) return a.capitulo
  const m = /^c(\d{3})-/.exec(a.fraseInicio ?? '')
  return m ? Number(m[1]) : null
}

/** El capítulo de una sección del EPUB por su nombre de archivo (…/cap-003.xhtml → 3). */
export function capituloDeSeccion(idSeccion: string | null | undefined): number | null {
  const m = /cap-(\d{3})/.exec(idSeccion ?? '')
  return m ? Number(m[1]) : null
}

/**
 * Si una nota sin CFI válido se puede re-anclar en esta sección: solo en su
 * propio capítulo (QA LV-01: antes se pintaban en cualquier capítulo con el
 * mismo texto). Si ni la nota ni la sección dicen su capítulo, se deja probar.
 */
export function debeReanclarEn(
  a: { capitulo?: number | null; fraseInicio?: string | null },
  capituloSeccion: number | null,
): boolean {
  const c = capituloDeNota(a)
  if (c == null) return true
  return capituloSeccion === c
}

/** Rango desde la cita (3): la aparición del texto citado con el contexto que mejor coincide. */
export function rangoDesdeCita(
  doc: Document,
  cita: string,
  prefijo?: string | null,
  sufijo?: string | null,
): Range | null {
  const body = doc.body
  if (!body || !cita) return null
  const todo = body.textContent ?? ''
  const i = indiceDeCita(todo, cita, prefijo, sufijo)
  if (i < 0) return null
  const p = puntoEn(body, i)
  const q = puntoEn(body, i + cita.length)
  const r = doc.createRange()
  r.setStart(p.nodo, p.offset)
  r.setEnd(q.nodo, q.offset)
  return r
}

/** Desplazamiento global (en el texto de la sección) del inicio de un rango. */
export function offsetGlobal(doc: Document, nodo: Node, offset: number): number {
  const r = doc.createRange()
  r.setStart(doc.body, 0)
  try {
    r.setEnd(nodo, offset)
  } catch {
    return 0
  }
  return r.toString().length
}

/** La primera frase visible de un rango (la página): para guardar dónde vas. */
export function primeraFrase(rango: Range | null | undefined): string | null {
  if (!rango) return null
  const directa = fraseDe(rango.startContainer)
  if (directa?.id) return directa.id
  const frag = rango.cloneContents()
  return (frag.querySelector?.('.bah-f') as HTMLElement | null)?.id ?? null
}
