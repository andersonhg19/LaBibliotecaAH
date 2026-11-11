/*
 * «VER EN ESPAÑOL»: el lector intercala (o sustituye) la traducción del
 * capítulo frase a frase, con los mismos ids cNNN-sNNNNN, así que las notas y
 * la voz siguen ancladas al original.
 *   · original  → el libro tal cual;
 *   · paralelo  → cada párrafo en pequeño y, debajo, su traducción;
 *   · solo      → solo la traducción (el original queda oculto, no borrado).
 */

export type ModoTraduccion = 'original' | 'paralelo' | 'solo'

/**
 * Se ofrece traducir salvo que el libro (o lo detectado) esté en español (QA RW-06).
 * Si no se sabe el idioma, se ofrece: mejor un botón de más que no poder traducir.
 */
export function ofrecerTraduccion(idiomaLibro: string | null | undefined, idiomaDetectado?: string | null): boolean {
  const idioma = (idiomaLibro || idiomaDetectado || '').trim().toLowerCase()
  if (!idioma) return true
  return !/^(es|spa|español|espanol|spanish)\b/.test(idioma)
}

/** El texto traducido de un párrafo: sus frases traducidas, en orden; null si ninguna lo está. */
export function textoTraducido(ids: string[], frases: Record<string, string>): string | null {
  const partes = ids.map((id) => frases[id]).filter((t): t is string => !!t && !!t.trim())
  return partes.length ? partes.join(' ') : null
}

const BLOQUE = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,figcaption'

/**
 * Aplica (o quita) la traducción en un documento del libro. Devuelve si cambió
 * algo (para que el paginador vuelva a medir).
 */
export function aplicarTraduccion(doc: Document, frases: Record<string, string>, modo: ModoTraduccion): boolean {
  let cambio = false
  doc.querySelectorAll('.bah-trad').forEach((e) => {
    e.remove()
    cambio = true
  })
  doc.querySelectorAll('.bah-orig,.bah-oculto').forEach((e) => {
    e.classList.remove('bah-orig', 'bah-oculto')
    cambio = true
  })
  if (modo === 'original') return cambio
  const bloques = new Map<Element, string[]>()
  doc.querySelectorAll('.bah-f').forEach((f) => {
    const b = f.closest(BLOQUE) ?? f.parentElement
    if (!b || !f.id) return
    const l = bloques.get(b) ?? []
    l.push(f.id)
    bloques.set(b, l)
  })
  for (const [b, ids] of bloques) {
    const t = textoTraducido(ids, frases)
    if (!t) continue
    const tr = doc.createElement(/^H\d$/.test(b.tagName) ? b.tagName.toLowerCase() : 'p')
    tr.className = 'bah-trad'
    tr.setAttribute('lang', 'es')
    tr.dataset.de = ids[0]
    tr.textContent = t
    b.classList.add(modo === 'solo' ? 'bah-oculto' : 'bah-orig')
    b.after(tr)
    cambio = true
  }
  return cambio
}

/** El CSS de la traducción dentro del libro. */
export const CSS_TRADUCCION = `
.bah-orig{font-size:.8em!important;opacity:.62;margin-bottom:.15em!important}
.bah-oculto{display:none!important}
.bah-trad{margin-top:0!important;animation:bahTrad 420ms ease-out both}
@keyframes bahTrad{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.bah-trad{animation:none}}
`
