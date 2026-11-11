import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import {
  fraseDe,
  offsetDentro,
  offsetGlobal,
  primeraFrase,
  puntoEn,
  rangoDesdeCita,
  rangoDesdeFrases,
} from '@componentes/lector/anclas'
import {
  ControlLector,
  Destino,
  InfoLibro,
  ItemIndice,
  PropsLector,
  ResultadoBusqueda,
} from '@componentes/lector/tipos'
import type { Preferencias } from '@contextos/PreferenciasContext'
import { motor } from '@contextos/VozContext'
import { contextoDeCita } from '@logica/anotaciones'
import { capituloDeFrase } from '@logica/tiempos'
import { FUENTES_LECTOR } from '@tema/fuentes'
import { PAPELES } from '@tema/papel'
import { reducirMovimiento } from '@tema/web'
import type { AnotacionDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'
import { pasarPagina } from '@utils/sonidos'

/*
 * EL LECTOR: foliate-js (vendorizado en public/foliate, commit fijado) dentro
 * de un <foliate-view>. Aquí se le enseña lo nuestro:
 *   · el papel, la letra y los márgenes de Preferencias;
 *   · las notas con sus tres anclas, que se vuelven a pintar al reabrir;
 *   · el progreso (frase visible + CFI + %), que se avisa a la pantalla;
 *   · la voz: la frase que suena en miel y la palabra en latón (CSS Custom
 *     Highlight API), pasando de página sola; si te vas a otra parte, se
 *     avisa para ofrecer "↩ volver a la voz".
 */

// ---------------------------------------------------------------- tipos mínimos de foliate
interface Seccion {
  id: string
  linear?: string
}
interface ItemToc {
  label: string
  href: string
  subitems?: ItemToc[]
}
interface Contenido {
  index: number
  doc: Document
}
interface Renderer extends HTMLElement {
  setStyles: (css: string) => void
  getContents: () => Contenido[]
  goTo: (t: { index: number; anchor?: (d: Document) => Range | Element | null }) => Promise<void>
  scrollToAnchor: (a: Range | Element, select?: boolean) => Promise<void>
}
interface Historial extends EventTarget {
  back: () => void
  canGoBack: boolean
}
interface VistaFoliate extends HTMLElement {
  book: { sections: Seccion[]; toc?: ItemToc[] }
  renderer: Renderer
  history: Historial
  lastLocation: { fraction?: number; cfi?: string; tocItem?: { label?: string } } | null
  open: (f: File) => Promise<void>
  init: (o: { lastLocation?: unknown; showTextStart?: boolean }) => Promise<void>
  goTo: (t: string | number) => Promise<unknown>
  goToFraction: (f: number) => Promise<void>
  getCFI: (index: number, range: Range) => string
  addAnnotation: (a: { value: string; color?: string | null }, remove?: boolean) => Promise<unknown>
  deleteAnnotation: (a: { value: string }) => Promise<unknown>
  getSectionFractions: () => number[]
  search: (o: { query: string }) => AsyncGenerator<unknown>
  clearSearch: () => void
  deselect: () => void
  next: () => Promise<void>
  prev: () => Promise<void>
  close: () => void
}
type DibujoOverlay = (rects: DOMRectList, o: { color: string }) => SVGElement
interface ModOverlayer {
  Overlayer: { highlight: DibujoOverlay }
}

const importar = new Function('u', 'return import(u)') as (u: string) => Promise<unknown>

const nnn = (n: number) => String(n).padStart(3, '0')
const origen = () => (typeof location !== 'undefined' ? location.origin : '')

/** El CSS que se inyecta dentro del libro. */
export function cssDelLibro(p: Preferencias): string {
  const papel = PAPELES[p.temaPapel]
  const f = FUENTES_LECTOR.find((x) => x.clave === p.fuente) ?? FUENTES_LECTOR[0]
  const caras = FUENTES_LECTOR.map(
    (
      x,
    ) => `@font-face{font-family:'${x.nombre}';src:url('${origen()}/fuentes/${x.archivo}') format('truetype');font-style:normal;font-display:swap}
@font-face{font-family:'${x.nombre}';src:url('${origen()}/fuentes/${x.cursiva}') format('truetype');font-style:italic;font-display:swap}`,
  ).join('\n')
  return `${caras}
html{background:${papel.fondo}!important;color:${papel.tinta}!important;color-scheme:${p.temaPapel === 'noche' ? 'dark' : 'light'}}
body{font-family:${f.css}!important;font-size:${p.tamano}%!important;color:${papel.tinta}!important;background:transparent!important}
p,li,blockquote,dd,div{line-height:${p.interlineado}!important;-webkit-hyphens:auto;hyphens:auto;widows:2;orphans:2}
p{text-align:justify}
h1,h2,h3{font-family:${f.css};font-weight:600;color:${papel.tinta}}
a:link,a:visited{color:${papel.enlace}}
::selection{background:${papel.seleccion}}
.bah-f{border-radius:3px;transition:background-color 180ms ease}
.bah-voz{background-color:${p.temaPapel === 'noche' ? 'rgba(217,163,91,0.32)' : 'rgba(217,163,91,0.42)'};box-decoration-break:clone;-webkit-box-decoration-break:clone}
::highlight(bah-palabra){background-color:${p.temaPapel === 'noche' ? 'rgba(201,162,39,0.6)' : 'rgba(201,162,39,0.55)'};color:inherit}
img{max-width:100%;height:auto}
`
}

const aplanarIndice = (items: ItemToc[] | undefined, nivel = 0): ItemIndice[] =>
  (items ?? []).flatMap((i) => [
    { titulo: i.label?.trim() || '—', href: i.href, nivel },
    ...aplanarIndice(i.subitems, nivel + 1),
  ])

const LectorFoliate = forwardRef<ControlLector, PropsLector>((props, ref) => {
  const contenedor = useRef<HTMLDivElement>(null)
  const vista = useRef<VistaFoliate | null>(null)
  const overlayer = useRef<ModOverlayer['Overlayer'] | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const mapaCfi = useRef(new Map<string, AnotacionDTO>())
  const siguiendo = useRef(true)
  const ignorarHasta = useRef(0)
  const motivo = useRef('navigation')
  const fraseVoz = useRef<{ el: HTMLElement | null; id: string | null }>({ el: null, id: null })
  const navegandoA = useRef<string | null>(null)

  const seccionDeCapitulo = (cap: number): number => {
    const v = vista.current
    if (!v) return -1
    const re = new RegExp(`cap-${nnn(cap)}\\.x?html$`, 'i')
    const i = v.book.sections.findIndex((s) => re.test(s.id))
    if (i >= 0) return i
    const primera = v.book.sections.findIndex((s) => s.linear !== 'no')
    return Math.min(v.book.sections.length - 1, Math.max(0, primera) + cap)
  }

  const docConId = (id: string): Document | null => {
    for (const c of vista.current?.renderer.getContents() ?? []) if (c.doc.getElementById(id)) return c.doc
    return null
  }

  const irAFrase = async (id: string) => {
    const v = vista.current
    if (!v) return
    const doc = docConId(id)
    const el = doc?.getElementById(id)
    if (el) {
      await v.renderer.scrollToAnchor(el)
      return
    }
    const index = seccionDeCapitulo(Math.max(0, capituloDeFrase(id)))
    if (index >= 0) await v.renderer.goTo({ index, anchor: (d) => d.getElementById(id) })
  }

  /** Anota una nota en el mapa CFI → nota y la pinta (si su sección está a la vista). */
  const pintar = (a: AnotacionDTO, cfi: string) => {
    mapaCfi.current.set(cfi, a)
    vista.current
      ?.addAnnotation({ value: cfi, color: a.color })
      .catch((e) => console.warn('[lector] no se pudo pintar la nota', e))
  }

  /* Re-anclar con frase (2) o cita (3) las notas que no traen CFI, cuando su sección carga. */
  const reanclarEn = (doc: Document, index: number) => {
    const v = vista.current
    if (!v) return
    for (const a of propsRef.current.anotaciones) {
      if (a.cfi && mapaCfi.current.has(a.cfi)) continue
      let r: Range | null = null
      if (a.fraseInicio && a.fraseFin)
        r = rangoDesdeFrases(doc, a.fraseInicio, a.offsetInicio ?? 0, a.fraseFin, a.offsetFin ?? 0)
      if (!r && a.textoCitado) r = rangoDesdeCita(doc, a.textoCitado)
      if (r) pintar(a, v.getCFI(index, r))
    }
  }

  const aplicarPreferencias = (p: Preferencias) => {
    const v = vista.current
    if (!v) return
    const r = v.renderer
    r.setAttribute('flow', p.modo === 'continuo' ? 'scrolled' : 'paginated')
    r.setAttribute('gap', `${Math.max(2, p.margen)}%`)
    r.setAttribute('margin', '40px')
    r.setAttribute('max-inline-size', '720px')
    r.setAttribute('max-column-count', typeof window !== 'undefined' && window.innerWidth >= 1100 ? '2' : '1')
    if (reducirMovimiento()) r.removeAttribute('animated')
    else r.setAttribute('animated', '')
    r.setStyles(cssDelLibro(p))
    if (contenedor.current) contenedor.current.style.background = PAPELES[p.temaPapel].fondo
  }

  const resaltarVoz = (fraseId: string | null, palabra: [number, number] | null) => {
    const prev = fraseVoz.current
    if (prev.el && prev.id !== fraseId) prev.el.classList.remove('bah-voz')
    for (const c of vista.current?.renderer.getContents() ?? []) {
      const w = c.doc.defaultView as (Window & typeof globalThis) | null
      w?.CSS?.highlights?.delete('bah-palabra')
    }
    if (!fraseId) {
      fraseVoz.current = { el: null, id: null }
      return
    }
    const doc = docConId(fraseId)
    const el = doc?.getElementById(fraseId) ?? null
    if (!el) {
      fraseVoz.current = { el: null, id: fraseId }
      if (siguiendo.current && navegandoA.current !== fraseId) {
        navegandoA.current = fraseId
        ignorarHasta.current = Date.now() + 1500
        irAFrase(fraseId).finally(() => {
          navegandoA.current = null
        })
      }
      return
    }
    el.classList.add('bah-voz')
    const cambio = prev.id !== fraseId
    fraseVoz.current = { el, id: fraseId }
    const w = el.ownerDocument.defaultView as (Window & typeof globalThis) | null
    if (palabra && w?.CSS?.highlights && typeof w.Highlight === 'function') {
      const a = puntoEn(el, palabra[0])
      const b = puntoEn(el, palabra[1])
      const r = el.ownerDocument.createRange()
      try {
        r.setStart(a.nodo, a.offset)
        r.setEnd(b.nodo, b.offset)
        w.CSS.highlights.set('bah-palabra', new w.Highlight(r))
      } catch {
        /* la palabra cae fuera: solo frase */
      }
    }
    if (cambio && siguiendo.current) {
      ignorarHasta.current = Date.now() + 900
      vista.current?.renderer.scrollToAnchor(el).catch(() => {})
    }
  }

  // ---------------------------------------------------------------- montar
  useEffect(() => {
    let vivo = true
    const caja = contenedor.current
    if (!caja) return
    const quitar: (() => void)[] = []

    ;(async () => {
      try {
        await importar(`${origen()}/foliate/view.js`)
        const mod = (await importar(`${origen()}/foliate/overlayer.js`)) as ModOverlayer
        overlayer.current = mod.Overlayer
        const r = await fetch(props.url)
        if (!r.ok) throw new Error(`${r.status}`)
        const archivo = new File([await r.blob()], 'libro.epub', { type: 'application/epub+zip' })
        if (!vivo) return
        const v = document.createElement('foliate-view') as VistaFoliate
        v.style.width = '100%'
        v.style.height = '100%'
        v.style.display = 'block'
        caja.appendChild(v)
        vista.current = v
        await v.open(archivo)
        if (!vivo) return
        aplicarPreferencias(propsRef.current.prefs)

        v.addEventListener('draw-annotation', (e) => {
          const d = (
            e as CustomEvent<{
              draw: (f: DibujoOverlay, o: { color: string }) => void
              annotation: { value: string; color?: string }
            }>
          ).detail
          if (overlayer.current) d.draw(overlayer.current.highlight, { color: d.annotation.color || '#D9A35B' })
        })
        v.addEventListener('create-overlay', () => {
          for (const [cfi, a] of mapaCfi.current) v.addAnnotation({ value: cfi, color: a.color }).catch(() => {})
        })
        v.addEventListener('show-annotation', (e) => {
          const a = mapaCfi.current.get((e as CustomEvent<{ value: string }>).detail.value)
          if (a) propsRef.current.onTocarAnotacion(a)
        })
        v.history.addEventListener('index-change', () => propsRef.current.onPuedeVolver(v.history.canGoBack))
        v.addEventListener('load', (e) => {
          const { doc, index } = (e as CustomEvent<Contenido>).detail
          reanclarEn(doc, index)
          let t: ReturnType<typeof setTimeout> | null = null
          doc.addEventListener('selectionchange', () => {
            if (t) clearTimeout(t)
            t = setTimeout(() => informarSeleccion(doc, index), 280)
          })
          doc.addEventListener('keydown', teclas)
          doc.addEventListener('click', (ev) => {
            if ((ev.target as Element | null)?.closest?.('a[href]')) return
            const sel = doc.getSelection()
            if (sel && !sel.isCollapsed) return
            const fr = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
            const cr = caja.getBoundingClientRect()
            const x = (fr?.left ?? 0) + ev.clientX - cr.left
            if (x < cr.width * 0.25) v.prev()
            else if (x > cr.width * 0.75) v.next()
            else propsRef.current.onToqueCentro?.()
          })
          // Si la voz está en esta sección, se pinta ya.
          const f = fraseVoz.current.id
          if (f && doc.getElementById(f)) resaltarVoz(f, null)
        })
        v.renderer.addEventListener('relocate', (e) => {
          const d = (e as CustomEvent<{ reason: string; range?: Range; index: number }>).detail
          motivo.current = d.reason
          if (d.reason === 'page' || d.reason === 'snap') pasarPagina()
          const vozAqui =
            motor.obtener().libro?.ejemplarId === propsRef.current.ejemplarId &&
            motor.obtener().fase === 'reproduciendo'
          if (
            vozAqui &&
            siguiendo.current &&
            ['page', 'snap', 'scroll'].includes(d.reason) &&
            Date.now() > ignorarHasta.current
          ) {
            siguiendo.current = false
            propsRef.current.onSiguiendoVoz(false)
          }
          const ll = v.lastLocation
          const fraseId = primeraFrase(d.range)
          const capFrase = capituloDeFrase(fraseId)
          const capSeccion = /cap-(\d{3})/.exec(v.book.sections[d.index]?.id ?? '')
          propsRef.current.onReubicar({
            fraccion: ll?.fraction ?? 0,
            cfi: ll?.cfi ?? null,
            fraseId,
            capitulo: capFrase >= 0 ? capFrase : capSeccion ? Number(capSeccion[1]) : 0,
            etiqueta: ll?.tocItem?.label ?? '',
            motivo: d.reason,
          })
        })
        document.addEventListener('keydown', teclas)
        quitar.push(() => document.removeEventListener('keydown', teclas))

        // Índice y secciones para la vista previa del deslizador.
        const indice = aplanarIndice(v.book.toc)
        const fracciones = v.getSectionFractions()
        const tituloDe = (s: Seccion) =>
          indice.find(
            (i) => i.href.split('#')[0].endsWith(s.id.split('/').pop() ?? s.id) || s.id.endsWith(i.href.split('#')[0]),
          )?.titulo ?? ''
        const info: InfoLibro = {
          indice,
          secciones: v.book.sections
            .map((s, i) => ({ fraccion: fracciones[i] ?? 0, titulo: tituloDe(s) }))
            .filter((s) => s.titulo),
        }
        propsRef.current.onListo(info)

        // Abrir donde toca.
        const ini = propsRef.current.inicial
        if (ini?.cfi) await v.init({ lastLocation: ini.cfi })
        else if (ini?.fraccion != null && !ini.fraseId) await v.init({ lastLocation: { fraction: ini.fraccion } })
        else await v.init({ showTextStart: true })
        if (ini?.fraseId && !ini.cfi) await irAFrase(ini.fraseId)
      } catch (e) {
        console.error('[lector] no se pudo abrir el libro', e)
        if (vivo) propsRef.current.onError(MENSAJES.lectorFallo)
      }
    })()

    function teclas(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') vista.current?.next()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') vista.current?.prev()
    }

    function informarSeleccion(doc: Document, index: number) {
      const sel = doc.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return propsRef.current.onSeleccion(null)
      const r = sel.getRangeAt(0)
      const texto = r.toString().trim()
      if (!texto) return propsRef.current.onSeleccion(null)
      const fi = fraseDe(r.startContainer)
      const ff = fraseDe(r.endContainer)
      const global = offsetGlobal(doc, r.startContainer, r.startOffset)
      const { prefijo, sufijo } = contextoDeCita(doc.body.textContent ?? '', global, global + r.toString().length)
      const fr = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
      const rr = r.getBoundingClientRect()
      let cfi: string | null = null
      try {
        cfi = vista.current?.getCFI(index, r) ?? null
      } catch {
        cfi = null
      }
      const sec = /cap-(\d{3})/.exec(vista.current?.book.sections[index]?.id ?? '')
      propsRef.current.onSeleccion({
        texto,
        cfi,
        fraseInicio: fi?.id ?? null,
        offsetInicio: fi ? offsetDentro(fi, r.startContainer, r.startOffset) : null,
        fraseFin: ff?.id ?? null,
        offsetFin: ff ? offsetDentro(ff, r.endContainer, r.endOffset) : null,
        prefijo,
        sufijo,
        capitulo: fi ? capituloDeFrase(fi.id) : sec ? Number(sec[1]) : 0,
        x: (fr?.left ?? 0) + rr.left,
        y: (fr?.top ?? 0) + rr.top,
        ancho: rr.width,
        alto: rr.height,
      })
    }

    const desuscribir = motor.suscribirFrase((ev) => {
      if (ev.ejemplarId !== propsRef.current.ejemplarId) return
      resaltarVoz(ev.fraseId, ev.palabra)
    })
    quitar.push(desuscribir)

    return () => {
      vivo = false
      quitar.forEach((f) => f())
      try {
        vista.current?.close()
      } catch {
        /* nada */
      }
      vista.current?.remove()
      vista.current = null
    }
    // El libro se monta UNA vez por URL; el resto llega por propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.url])

  /* Cambiar papel, letra o márgenes no reabre el libro. */
  useEffect(() => {
    aplicarPreferencias(props.prefs)
  }, [props.prefs])

  /* Notas nuevas o borradas desde la pantalla. */
  useEffect(() => {
    const v = vista.current
    if (!v) return
    for (const a of props.anotaciones) if (a.cfi && !mapaCfi.current.has(a.cfi)) pintar(a, a.cfi)
  }, [props.anotaciones])

  useImperativeHandle(ref, () => ({
    irA: async (d: Destino) => {
      const v = vista.current
      if (!v) return
      if (d.cfi) await v.goTo(d.cfi)
      else if (d.fraseId) await irAFrase(d.fraseId)
      else if (d.href) await v.goTo(d.href)
      else if (d.fraccion != null) await v.goToFraction(Math.max(0, Math.min(1, d.fraccion)))
    },
    siguiente: () => vista.current?.next(),
    anterior: () => vista.current?.prev(),
    buscar: async (texto: string) => {
      const v = vista.current
      const res: ResultadoBusqueda[] = []
      if (!v || !texto.trim()) return res
      for await (const r of v.search({ query: texto.trim() })) {
        if (r === 'done') break
        const g = r as {
          label?: string
          subitems?: { cfi: string; excerpt: { pre: string; match: string; post: string } }[]
        }
        for (const s of g.subitems ?? [])
          res.push({
            cfi: s.cfi,
            antes: s.excerpt.pre,
            coincidencia: s.excerpt.match,
            despues: s.excerpt.post,
            capitulo: g.label ?? '',
          })
        if (res.length >= 200) break
      }
      return res
    },
    limpiarBusqueda: () => vista.current?.clearSearch(),
    volverAtras: () => vista.current?.history.back(),
    pintarAnotacion: (a: AnotacionDTO) => {
      if (a.cfi) pintar(a, a.cfi)
    },
    borrarAnotacion: (a: AnotacionDTO) => {
      for (const [cfi, x] of mapaCfi.current) {
        if (x.id === a.id) {
          mapaCfi.current.delete(cfi)
          vista.current?.deleteAnnotation({ value: cfi }).catch(() => {})
        }
      }
    },
    limpiarSeleccion: () => vista.current?.deselect(),
    seguirVoz: () => {
      siguiendo.current = true
      propsRef.current.onSiguiendoVoz(true)
      const f = motor.obtener().fraseId
      if (f) {
        ignorarHasta.current = Date.now() + 1500
        fraseVoz.current = { el: null, id: null }
        resaltarVoz(f, null)
      }
    },
  }))

  return (
    <div
      ref={contenedor}
      data-testid="lector"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: PAPELES[props.prefs.temaPapel].fondo }}
      aria-label="Texto del libro"
      role="document"
    />
  )
})

LectorFoliate.displayName = 'LectorFoliate'

export default LectorFoliate
