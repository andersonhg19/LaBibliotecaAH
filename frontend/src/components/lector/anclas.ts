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

/** Rango desde la cita (3): primera aparición del texto citado en la sección. */
export function rangoDesdeCita(doc: Document, cita: string): Range | null {
  const body = doc.body
  if (!body || !cita) return null
  const todo = body.textContent ?? ''
  const i = todo.indexOf(cita)
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
