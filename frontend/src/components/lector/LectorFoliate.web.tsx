import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import { useWindowDimensions } from 'react-native'

import {
  capituloDeSeccion,
  debeReanclarEn,
  fraseDe,
  offsetDentro,
  offsetGlobal,
  primeraFrase,
  puntoEn,
  rangoDesdeCita,
  rangoDesdeFrases,
} from '@componentes/lector/anclas'
import { ANCHO_ESTRECHO, cssDelLibro } from '@componentes/lector/cssLibro'
import { LECTOR_PAPEL } from '@componentes/lector/disenoLector'
import { minutosRestantes, paginaImpresa, textoFolio } from '@componentes/lector/folio'
import { accionDelToque, esMovimientoDelUsuario, puntoSobreCajas } from '@componentes/lector/gestos'
import {
  GeometriaHoja,
  MESA,
  geometriaHoja,
  limpiarHojas,
  maquetarHojas,
  pasoDeCapitulo,
} from '@componentes/lector/hojas'
import {
  ControlLector,
  Destino,
  InfoLibro,
  ItemIndice,
  PropsLector,
  ResultadoBusqueda,
} from '@componentes/lector/tipos'
import { aplicarTraduccion } from '@componentes/lector/traduccion'
import type { Preferencias } from '@contextos/PreferenciasContext'
import { motor } from '@contextos/VozContext'
import { contextoDeCita } from '@logica/anotaciones'
import { capituloDeFrase } from '@logica/tiempos'
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
 *     avisa para ofrecer "↩ volver a la voz";
 *   · el papel de verdad: cabecera y folio en los márgenes («p. 34 de 210 ·
 *     quedan 12 min»), y en el PC el libro abierto a dos columnas con la
 *     sombra del lomo en medio.
 */

// ---------------------------------------------------------------- tipos mínimos de foliate
interface Seccion {
  id: string
  linear?: string
  size?: number
}
interface ItemToc {
  label: string
  href: string
  subitems?: ItemToc[]
}
interface Overlayer {
  hitTest: (p: { x: number; y: number }) => [string?, Range?]
}
interface Contenido {
  index: number
  doc: Document
  overlayer?: Overlayer
}
interface Renderer extends HTMLElement {
  setStyles: (css: string) => void
  getContents: () => Contenido[]
  goTo: (t: { index: number; anchor?: (d: Document) => Range | Element | null }) => Promise<void>
  scrollToAnchor: (a: Range | Element, select?: boolean) => Promise<void>
  /** Las cajas de los márgenes de arriba y de abajo (una por columna; null en continuo). */
  heads?: HTMLElement[] | null
  feet?: HTMLElement[] | null
}
interface Historial extends EventTarget {
  back: () => void
  canGoBack: boolean
}
interface VistaFoliate extends HTMLElement {
  book: { sections: Seccion[]; toc?: ItemToc[] }
  renderer: Renderer
  history: Historial
  lastLocation: {
    fraction?: number
    cfi?: string
    tocItem?: { label?: string }
    location?: { current: number; next: number; total: number }
  } | null
  open: (f: File) => Promise<void>
  init: (o: { lastLocation?: unknown; showTextStart?: boolean }) => Promise<void>
  goTo: (t: string | number) => Promise<unknown>
  goToFraction: (f: number) => Promise<void>
  getCFI: (index: number, range: Range) => string
  addAnnotation: (a: { value: string; color?: string | null }, remove?: boolean) => Promise<unknown>
  deleteAnnotation: (a: { value: string }) => Promise<unknown>
  getSectionFractions: () => number[]
  search: (o: { query: string; draw?: DibujoOverlay; drawOptions?: unknown }) => AsyncGenerator<unknown>
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
const PREFIJO_BUSQUEDA = 'foliate-search:'

/** Las coincidencias de la búsqueda en miel con un filete de latón debajo (UX-13), no el rectángulo rojo de foliate. */
const dibujarBusqueda: DibujoOverlay = (rects) => {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  for (const { left, top, height, width } of Array.from(rects)) {
    const fondo = document.createElementNS(ns, 'rect')
    fondo.setAttribute('x', String(left - 1))
    fondo.setAttribute('y', String(top))
    fondo.setAttribute('width', String(width + 2))
    fondo.setAttribute('height', String(height))
    fondo.setAttribute('rx', '3')
    fondo.setAttribute('fill', LECTOR_PAPEL.busquedaRelleno)
    const filete = document.createElementNS(ns, 'rect')
    filete.setAttribute('x', String(left))
    filete.setAttribute('y', String(top + height - 2))
    filete.setAttribute('width', String(width))
    filete.setAttribute('height', '2')
    filete.setAttribute('fill', LECTOR_PAPEL.busquedaBorde)
    g.append(fondo, filete)
  }
  return g as unknown as SVGElement
}

/*
 * Los resaltados como un marcador de verdad: el trazo entra y sale un poco
 * torcido (bordes irregulares sutiles) y se aclara hacia el final, en vez del
 * rectángulo plano de foliate.
 */
const dibujarMarcador: DibujoOverlay = (rects, o) => {
  const ns = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(ns, 'g')
  g.setAttribute('fill', o.color)
  g.style.opacity = 'var(--overlayer-highlight-opacity, .42)'
  Array.from(rects).forEach(({ left, top, height, width }, i) => {
    const a = (i % 3) - 1
    const p = document.createElementNS(ns, 'path')
    const x0 = left - 1.5
    const x1 = left + width + 1.5
    const y0 = top + 1.5
    const y1 = top + height - 0.5
    p.setAttribute(
      'd',
      `M${x0 + 1.2} ${y0 + a * 0.6} L${x1 - 0.8} ${y0 - 0.4} Q${x1 + 1.2} ${(y0 + y1) / 2} ${x1 - 0.4} ${y1 + 0.5} L${x0 + 0.6} ${y1 + a * 0.5} Q${x0 - 1.4} ${(y0 + y1) / 2} ${x0 + 1.2} ${y0 + a * 0.6} Z`,
    )
    const brillo = document.createElementNS(ns, 'rect')
    brillo.setAttribute('x', String(left))
    brillo.setAttribute('y', String(top + height * 0.15))
    brillo.setAttribute('width', String(Math.max(0, width)))
    brillo.setAttribute('height', String(height * 0.35))
    brillo.setAttribute('fill', 'rgba(255,255,255,0.12)')
    g.append(p, brillo)
  })
  return g as unknown as SVGElement
}

const aplanarIndice = (items: ItemToc[] | undefined, nivel = 0): ItemIndice[] =>
  (items ?? []).flatMap((i) => [
    { titulo: i.label?.trim() || '—', href: i.href, nivel },
    ...aplanarIndice(i.subitems, nivel + 1),
  ])

/** Las frases que caen dentro del rango visible. */
const frasesDe = (rango: Range | null | undefined): string[] => {
  if (!rango) return []
  try {
    const ids = new Set<string>()
    const directa = fraseDe(rango.startContainer)
    if (directa?.id) ids.add(directa.id)
    rango
      .cloneContents()
      .querySelectorAll?.('.bah-f')
      .forEach((e) => (e as HTMLElement).id && ids.add((e as HTMLElement).id))
    return [...ids]
  } catch {
    return []
  }
}

/**
 * La selección con sus dos bordes DENTRO de nodos de texto. Un triple clic (o
 * elegir un párrafo entero) deja los bordes en el elemento, y el CFI que sale
 * de ahí («/4[c003-s00002],/4[c003-s00002]») foliate lo resolvía en otra parte
 * del capítulo: el resaltado se pintaba lejos del texto elegido y tocarlo no
 * abría nada (QA LV-05).
 */
function aNodosDeTexto(r: Range): Range {
  const doc = r.startContainer.ownerDocument
  if (!doc || (r.startContainer.nodeType === 3 && r.endContainer.nodeType === 3)) return r
  const textos: Text[] = []
  const w = doc.createTreeWalker(r.commonAncestorContainer, NodeFilter.SHOW_TEXT)
  for (let n = w.currentNode.nodeType === 3 ? w.currentNode : w.nextNode(); n; n = w.nextNode())
    if (r.intersectsNode(n) && (n.textContent ?? '').trim()) textos.push(n as Text)
  if (!textos.length) return r
  const nueva = r.cloneRange()
  if (r.startContainer.nodeType !== 3) nueva.setStart(textos[0], 0)
  if (r.endContainer.nodeType !== 3) {
    const ult = textos[textos.length - 1]
    nueva.setEnd(ult, ult.length)
  }
  return nueva
}

const LectorFoliate = forwardRef<ControlLector, PropsLector>((props, ref) => {
  const contenedor = useRef<HTMLDivElement>(null)
  const vista = useRef<VistaFoliate | null>(null)
  const overlayer = useRef<ModOverlayer['Overlayer'] | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const mapaCfi = useRef(new Map<string, AnotacionDTO>())
  /** El rango vivo de cada nota pintada (para tocarla aunque el hitTest de foliate falle: QA LV-05). */
  const rangos = useRef(new Map<string, { doc: Document; range: Range }>())
  const pintadas = useRef(new Set<string>())
  const siguiendo = useRef(true)
  const ignorarHasta = useRef(0)
  const gestoHasta = useRef(0)
  const fraseVoz = useRef<{ el: HTMLElement | null; id: string | null }>({ el: null, id: null })
  const navegandoA = useRef<string | null>(null)
  const ratioTexto = useRef(0)
  /** Páginas del libro (estimadas, como el folio): numeran las Hojas. */
  const paginasDelLibro = useRef(0)
  const hayBusqueda = useRef(false)
  const { width, height } = useWindowDimensions()
  /* El modo ya llega decidido por la pantalla (modoEfectivo): 'libro' = dos páginas, 'continuo' = Hojas. */
  const dosColumnas = width >= LECTOR_PAPEL.anchoDosColumnas && width > height && props.prefs.modo === 'libro'
  const geometria = useRef<GeometriaHoja>(geometriaHoja(width))
  geometria.current = geometriaHoja(width)
  const columnasRef = useRef(dosColumnas)
  columnasRef.current = dosColumnas
  const estrecho = width < ANCHO_ESTRECHO
  const estrechoRef = useRef(estrecho)
  estrechoRef.current = estrecho

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

  /** La nota (de las pintadas en ese documento) bajo el punto, mirando sus cajas de ahora. */
  const notaEnPunto = (doc: Document, x: number, y: number): { cfi: string; nota: AnotacionDTO } | null => {
    for (const [cfi, { doc: d, range }] of Array.from(rangos.current.entries()).reverse()) {
      if (d !== doc) continue
      const nota = mapaCfi.current.get(cfi)
      if (!nota) continue
      try {
        if (puntoSobreCajas(x, y, range.getClientRects())) return { cfi, nota }
      } catch {
        /* rango de un capítulo ya descargado */
      }
    }
    return null
  }

  /** Anota una nota en el mapa CFI → nota y la pinta (si su sección está a la vista). */
  const pintar = (a: AnotacionDTO, cfi: string) => {
    if (a.tipo === 'MARCADOR') return
    mapaCfi.current.set(cfi, a)
    pintadas.current.add(a.id ?? cfi)
    vista.current
      ?.addAnnotation({ value: cfi, color: a.color })
      .catch((e) => console.warn('[lector] no se pudo pintar la nota', e))
  }

  /*
   * Re-anclar con frase (2) o cita (3) las notas que no traen CFI, cuando su
   * sección carga: SOLO en su capítulo y con el contexto de la cita (QA LV-01).
   */
  const reanclarEn = (doc: Document, index: number) => {
    const v = vista.current
    if (!v) return
    const capSeccion = capituloDeSeccion(v.book.sections[index]?.id)
    for (const a of propsRef.current.anotaciones) {
      if (a.tipo === 'MARCADOR') continue
      if (a.cfi && mapaCfi.current.has(a.cfi)) continue
      if (pintadas.current.has(a.id ?? a.cfi ?? '')) continue
      if (!debeReanclarEn(a, capSeccion)) continue
      let r: Range | null = null
      if (a.fraseInicio && a.fraseFin)
        r = rangoDesdeFrases(doc, a.fraseInicio, a.offsetInicio ?? 0, a.fraseFin, a.offsetFin ?? 0)
      if (!r && a.textoCitado) r = rangoDesdeCita(doc, a.textoCitado, a.prefijo, a.sufijo)
      if (r) pintar(a, v.getCFI(index, r))
    }
  }

  const aplicarPreferencias = (p: Preferencias) => {
    const v = vista.current
    if (!v) return
    const r = v.renderer
    const dos = columnasRef.current
    const enHojas = p.modo === 'continuo'
    const g = geometria.current
    r.setAttribute('flow', enHojas ? 'scrolled' : 'paginated')
    r.setAttribute('gap', enHojas ? '0%' : `${Math.max(dos ? 6 : 2, p.margen)}%`)
    // En Hojas (nunca a dos páginas) el margen de arriba deja sitio a la barra; el resto lo pone cada hoja.
    r.setAttribute('margin', `${dos ? LECTOR_PAPEL.margenPC : LECTOR_PAPEL.margenMovil}px`)
    r.setAttribute('max-inline-size', enHojas ? `${g.ancho}px` : dos ? '640px' : '720px')
    r.setAttribute('max-column-count', dos ? '2' : '1')
    if (reducirMovimiento()) r.removeAttribute('animated')
    else r.setAttribute('animated', '')
    r.setStyles(cssDelLibro(p, { estrecho: estrechoRef.current, hojas: enHojas ? g : null }))
    if (contenedor.current)
      contenedor.current.style.background = enHojas ? MESA[p.temaPapel] : PAPELES[p.temaPapel].fondo
    maquetarLuego()
  }

  /*
   * HOJAS: cada capítulo cargado se reparte en hojas con su folio. Se rehace al
   * cargar, al cambiar letra/papel/ventana y al traducir; un toque de espera
   * deja que el navegador aplique estilos y fuentes antes de medir.
   */
  const tMaquetar = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maquetarDoc = (doc: Document, index: number) => {
    const v = vista.current
    if (!v) return
    const p = propsRef.current.prefs
    if (p.modo !== 'continuo') {
      limpiarHojas(doc)
      return
    }
    try {
      const fr = v.getSectionFractions()
      const total = paginasDelLibro.current
      const primera = total ? Math.max(1, Math.round((fr[index] ?? 0) * total) + 1) : 0
      // foliate vuelve a medir solo (observa el tamaño del documento) y redibuja las notas.
      maquetarHojas(doc, geometria.current, (k) => String((primera || 1) + k), PAPELES[p.temaPapel].tinta)
    } catch (e) {
      console.warn('[lector] no se pudieron maquetar las hojas', e)
    }
  }
  const maquetarLuego = (ms = 120) => {
    if (tMaquetar.current) clearTimeout(tMaquetar.current)
    tMaquetar.current = setTimeout(() => {
      for (const c of vista.current?.renderer.getContents() ?? []) maquetarDoc(c.doc, c.index)
    }, ms)
  }

  /** Cabecera y folio en los márgenes de la página, como en un libro impreso. */
  const pintarMarginales = (pie: string[], etiqueta: string) => {
    const r = vista.current?.renderer
    if (!r) return
    const papel = PAPELES[propsRef.current.prefs.temaPapel]
    const estilo = (el: HTMLElement) => {
      el.style.fontFamily = "'CormorantGaramond_600SemiBold', 'Cormorant Garamond', Georgia, serif"
      el.style.fontSize = '15px'
      el.style.letterSpacing = '0.06em'
      el.style.fontVariant = 'small-caps'
      el.style.fontVariantNumeric = 'lining-nums'
      el.style.color = papel.tinta
      el.style.opacity = '0.62'
    }
    const cabezas = r.heads ?? []
    const titulo = propsRef.current.titulo ?? ''
    cabezas.forEach((h, i) => {
      estilo(h)
      h.textContent = cabezas.length >= 2 ? (i === 0 ? titulo : etiqueta) : etiqueta
    })
    const pies = r.feet ?? []
    pies.forEach((f, i) => {
      estilo(f)
      f.textContent = pie.length >= pies.length ? (pie[i] ?? '') : i === pies.length - 1 ? pie.join(' · ') : ''
    })
  }

  /** Lo que haga la persona con los botones o el teclado deja de seguir a la voz (QA LV-08). */
  const gestoDelUsuario = () => {
    gestoHasta.current = Date.now() + 1500
    const m = motor.obtener()
    if (m.libro?.ejemplarId === propsRef.current.ejemplarId && m.fase === 'reproduciendo' && siguiendo.current) {
      siguiendo.current = false
      propsRef.current.onSiguiendoVoz(false)
    }
  }

  const pasar = (dir: 1 | -1) => {
    const v = vista.current
    if (!v) return
    gestoDelUsuario()
    // Al final (o al principio) del libro foliate rechaza la promesa (QA LV-P4).
    ;(dir === 1 ? v.next() : v.prev()).catch(() => {})
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
        // Las notas con CFI quedan registradas ANTES de que cargue ninguna sección:
        // así no pasan por el re-anclaje por cita (QA LV-01).
        for (const a of propsRef.current.anotaciones) if (a.cfi) pintar(a, a.cfi)

        v.addEventListener('draw-annotation', (e) => {
          const d = (
            e as CustomEvent<{
              draw: (f: DibujoOverlay, o: { color: string }) => void
              annotation: { value: string; color?: string }
              doc?: Document
              range?: Range
            }>
          ).detail
          d.draw(dibujarMarcador, { color: d.annotation.color || '#D9A35B' })
          if (d.doc && d.range) rangos.current.set(d.annotation.value, { doc: d.doc, range: d.range })
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
          // La partición silábica necesita el idioma: si el EPUB no lo declara, el de la ficha.
          if (!doc.documentElement.lang && propsRef.current.idioma) doc.documentElement.lang = propsRef.current.idioma
          const tam = v.book.sections[index]?.size ?? 0
          if (!ratioTexto.current && tam > 2000) ratioTexto.current = (doc.body?.textContent?.length ?? 0) / tam
          reanclarEn(doc, index)
          const tr = propsRef.current.traduccion
          if (tr && tr.modo !== 'original') aplicarTraduccion(doc, tr.frases, tr.modo)
          // Hojas: al acabar la tira del capítulo, seguir con la rueda o el dedo pasa al siguiente (o al anterior).
          const contenedorDe = () =>
            (doc.defaultView?.frameElement as HTMLElement | null)?.parentElement?.parentElement ?? null
          let empuje = 0
          doc.addEventListener(
            'wheel',
            (ev) => {
              const c = contenedorDe()
              if (propsRef.current.prefs.modo !== 'continuo' || !c) return
              const paso = pasoDeCapitulo(c, ev.deltaY)
              empuje = paso ? empuje + ev.deltaY : 0
              if (Math.abs(empuje) > 240) {
                empuje = 0
                pasar(paso as 1 | -1)
              }
            },
            { passive: true },
          )
          let toque: { y: number; c: { scrollTop: number; clientHeight: number; scrollHeight: number } } | null = null
          doc.addEventListener(
            'touchstart',
            (ev) => {
              const c = contenedorDe()
              toque = c
                ? {
                    y: ev.touches[0]?.clientY ?? 0,
                    c: { scrollTop: c.scrollTop, clientHeight: c.clientHeight, scrollHeight: c.scrollHeight },
                  }
                : null
            },
            { passive: true },
          )
          doc.addEventListener('touchend', (ev) => {
            if (propsRef.current.prefs.modo !== 'continuo' || !toque) return
            const dy = toque.y - (ev.changedTouches[0]?.clientY ?? toque.y)
            const paso = Math.abs(dy) > 60 ? pasoDeCapitulo(toque.c, dy) : 0
            toque = null
            if (paso) pasar(paso)
          })
          // Hojas: se maquetan cuando las fuentes del libro ya están (si no, las líneas se mueven después).
          if (propsRef.current.prefs.modo === 'continuo')
            (doc.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(() => maquetarDoc(doc, index), 30))
          let t: ReturnType<typeof setTimeout> | null = null
          doc.addEventListener('selectionchange', () => {
            if (t) clearTimeout(t)
            t = setTimeout(() => informarSeleccion(doc, index), 280)
          })
          doc.addEventListener('keydown', teclas)
          doc.addEventListener('click', (ev) => {
            const contenido = v.renderer.getContents().find((c) => c.doc === doc)
            let [valor] = contenido?.overlayer?.hitTest(ev) ?? []
            if (!valor) {
              /* QA LV-05: el hitTest de foliate usa las cajas medidas al pintar y no ve el
                 hueco entre renglones; se mira el rango vivo, con holgura, y se abre la nota. */
              const tocada = notaEnPunto(doc, ev.clientX, ev.clientY)
              if (tocada) {
                valor = tocada.cfi
                propsRef.current.onTocarAnotacion(tocada.nota)
              }
            }
            const sel = doc.getSelection()
            const fr = (doc.defaultView?.frameElement as HTMLElement | null)?.getBoundingClientRect()
            const cr = caja.getBoundingClientRect()
            const accion = accionDelToque({
              x: (fr?.left ?? 0) + ev.clientX - cr.left,
              ancho: cr.width,
              sobreAnotacion: !!valor && !valor.startsWith(PREFIJO_BUSQUEDA),
              sobreEnlace: !!(ev.target as Element | null)?.closest?.('a[href]'),
              haySeleccion: !!sel && !sel.isCollapsed,
            })
            if (accion === 'anterior') pasar(-1)
            else if (accion === 'siguiente') pasar(1)
            else if (accion === 'centro') propsRef.current.onToqueCentro?.()
          })
          // Si la voz está en esta sección, se pinta ya.
          const f = fraseVoz.current.id
          if (f && doc.getElementById(f)) resaltarVoz(f, null)
        })
        v.renderer.addEventListener('relocate', (e) => {
          const d = (e as CustomEvent<{ reason: string; range?: Range; index: number; fraction?: number }>).detail
          if (d.reason === 'page' || d.reason === 'snap') pasarPagina()
          const ahora = Date.now()
          const porUsuario = esMovimientoDelUsuario(d.reason, ahora, ignorarHasta.current, gestoHasta.current)
          const m = motor.obtener()
          const vozAqui = m.libro?.ejemplarId === propsRef.current.ejemplarId && m.fase === 'reproduciendo'
          if (vozAqui && siguiendo.current && porUsuario) {
            siguiendo.current = false
            propsRef.current.onSiguiendoVoz(false)
          }
          // La búsqueda marcada se va en cuanto sigues leyendo por tu cuenta.
          if (hayBusqueda.current && porUsuario && ['page', 'snap', 'scroll'].includes(d.reason)) {
            hayBusqueda.current = false
            v.clearSearch()
          }
          const ll = v.lastLocation
          const fraseId = primeraFrase(d.range)
          const capFrase = capituloDeFrase(fraseId)
          const capSeccion = capituloDeSeccion(v.book.sections[d.index]?.id)
          const capitulo = capFrase >= 0 ? capFrase : (capSeccion ?? 0)
          const pag = ll?.location ? paginaImpresa(ll.location.current, ll.location.total, ratioTexto.current) : null
          if (pag?.paginas && !paginasDelLibro.current) paginasDelLibro.current = pag.paginas
          const min = minutosRestantes(propsRef.current.minutosDe?.(capitulo), d.fraction ?? 0)
          const etiqueta = ll?.tocItem?.label ?? ''
          pintarMarginales(textoFolio(pag, min, v.renderer.feet?.length ?? 1), etiqueta)
          propsRef.current.onReubicar({
            fraccion: ll?.fraction ?? 0,
            cfi: ll?.cfi ?? null,
            fraseId,
            capitulo,
            etiqueta,
            motivo: d.reason,
            porUsuario,
            pagina: pag?.pagina ?? null,
            paginas: pag?.paginas ?? null,
            minutosRestantes: min,
            frases: frasesDe(d.range),
            textoInicio: fraseId
              ? (d.range?.startContainer.ownerDocument?.getElementById(fraseId)?.textContent?.trim().slice(0, 160) ??
                null)
              : null,
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
          idioma: (v as unknown as { language?: { canonical?: string } }).language?.canonical ?? null,
          secciones: v.book.sections
            .map((s, i) => ({ fraccion: fracciones[i] ?? 0, titulo: tituloDe(s) }))
            .filter((s) => s.titulo),
        }
        propsRef.current.onListo(info)

        // Abrir donde toca (moverse al abrir no es «leer»: no cuenta como gesto).
        ignorarHasta.current = Date.now() + 2000
        const ini = propsRef.current.inicial
        if (ini?.cfi) {
          /* Un CFI guardado que ya no se resuelve (otra edición del archivo, o uno mal
             formado) no puede dejar el libro sin abrir: se abre por el % o por el principio. */
          try {
            await v.init({ lastLocation: ini.cfi })
          } catch (e) {
            console.warn('[lector] la posición guardada no se pudo abrir; se abre por el porcentaje', e)
            if (ini.fraccion != null) await v.init({ lastLocation: { fraction: ini.fraccion } })
            else await v.init({ showTextStart: true })
          }
        } else if (ini?.fraccion != null && !ini.fraseId) await v.init({ lastLocation: { fraction: ini.fraccion } })
        else await v.init({ showTextStart: true })
        if (ini?.fraseId && !ini.cfi) await irAFrase(ini.fraseId)
        ignorarHasta.current = Date.now() + 800
      } catch (e) {
        console.error('[lector] no se pudo abrir el libro', e)
        if (vivo) propsRef.current.onError(MENSAJES.lectorFallo)
      }
    })()

    function teclas(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') pasar(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') pasar(-1)
    }

    function informarSeleccion(doc: Document, index: number) {
      const sel = doc.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return propsRef.current.onSeleccion(null)
      const r = aNodosDeTexto(sel.getRangeAt(0))
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
      const sec = capituloDeSeccion(vista.current?.book.sections[index]?.id)
      propsRef.current.onSeleccion({
        texto,
        cfi,
        fraseInicio: fi?.id ?? null,
        offsetInicio: fi ? offsetDentro(fi, r.startContainer, r.startOffset) : null,
        fraseFin: ff?.id ?? null,
        offsetFin: ff ? offsetDentro(ff, r.endContainer, r.endOffset) : null,
        prefijo,
        sufijo,
        capitulo: fi ? capituloDeFrase(fi.id) : (sec ?? 0),
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

  /* Cambiar papel, letra, márgenes o pasar a dos columnas no reabre el libro. */
  useEffect(() => {
    aplicarPreferencias(props.prefs)
    // aplicarPreferencias lee lo demás por refs; se reaplica cuando cambian las preferencias o la ventana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prefs, dosColumnas, estrecho, width])

  /* «Ver en español»: se aplica a lo cargado y el paginador vuelve a medir. */
  const claveTraduccion = props.traduccion
    ? `${props.traduccion.modo}:${Object.keys(props.traduccion.frases).length}`
    : 'original:0'
  useEffect(() => {
    const v = vista.current
    if (!v) return
    const tr = propsRef.current.traduccion ?? { modo: 'original' as const, frases: {} }
    let cambio = false
    for (const c of v.renderer.getContents()) cambio = aplicarTraduccion(c.doc, tr.frases, tr.modo) || cambio
    if (cambio) (v.renderer as Renderer & { render?: () => void }).render?.()
    if (cambio && propsRef.current.prefs.modo === 'continuo') maquetarLuego(200)
    // Solo cuando cambia la traducción; el resto llega por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveTraduccion])

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
      gestoDelUsuario()
      if (d.cfi) await v.goTo(d.cfi)
      else if (d.fraseId) await irAFrase(d.fraseId)
      else if (d.href) await v.goTo(d.href)
      else if (d.fraccion != null) await v.goToFraction(Math.max(0, Math.min(1, d.fraccion)))
    },
    siguiente: () => pasar(1),
    anterior: () => pasar(-1),
    buscar: async (texto: string) => {
      const v = vista.current
      const res: ResultadoBusqueda[] = []
      if (!v || !texto.trim()) return res
      hayBusqueda.current = true
      for await (const r of v.search({ query: texto.trim(), draw: dibujarBusqueda })) {
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
    limpiarBusqueda: () => {
      hayBusqueda.current = false
      vista.current?.clearSearch()
    },
    volverAtras: () => {
      gestoDelUsuario()
      vista.current?.history.back()
    },
    pintarAnotacion: (a: AnotacionDTO) => {
      if (a.cfi) pintar(a, a.cfi)
    },
    borrarAnotacion: (a: AnotacionDTO) => {
      pintadas.current.delete(a.id ?? a.cfi ?? '')
      for (const [cfi, x] of mapaCfi.current) {
        if (x.id === a.id) {
          mapaCfi.current.delete(cfi)
          rangos.current.delete(cfi)
          vista.current?.deleteAnnotation({ value: cfi }).catch(() => {})
        }
      }
    },
    actualizarAnotacion: (a: AnotacionDTO) => {
      for (const [cfi, x] of mapaCfi.current) {
        if (x.id !== a.id) continue
        mapaCfi.current.set(cfi, a)
        // addAnnotation sobre un valor que ya existe lo quita y lo vuelve a dibujar con el color nuevo.
        vista.current?.addAnnotation({ value: cfi, color: a.color }).catch(() => {})
      }
    },
    limpiarSeleccion: () => vista.current?.deselect(),
    seguirVoz: () => {
      siguiendo.current = true
      gestoHasta.current = 0
      propsRef.current.onSiguiendoVoz(true)
      const f = motor.obtener().fraseId
      if (f) {
        ignorarHasta.current = Date.now() + 1500
        fraseVoz.current = { el: null, id: null }
        resaltarVoz(f, null)
      }
    },
  }))

  const papel = PAPELES[props.prefs.temaPapel]
  const noche = props.prefs.temaPapel === 'noche'
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: papel.fondo }}>
      <div
        ref={contenedor}
        data-testid="lector"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: papel.fondo }}
        aria-label="Texto del libro"
        role="document"
      />
      {/* La fibra del papel: una viñeta muy suave en los bordes (no recibe toques). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: noche
            ? 'radial-gradient(ellipse at 50% 45%, transparent 62%, rgba(0,0,0,0.28) 100%)'
            : 'radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(107,72,32,0.10) 100%)',
        }}
      />
      {/* El libro abierto del PC: la sombra del lomo entre las dos páginas. */}
      {dosColumnas ? (
        <div
          aria-hidden
          data-testid="lomo-central"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: 90,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            background: noche
              ? 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.22) 42%, rgba(0,0,0,0.42) 50%, rgba(0,0,0,0.22) 58%, transparent 100%)'
              : 'linear-gradient(to right, transparent 0%, rgba(74,46,28,0.07) 38%, rgba(74,46,28,0.20) 49%, rgba(255,255,255,0.35) 50.5%, rgba(74,46,28,0.10) 56%, transparent 100%)',
          }}
        />
      ) : null}
    </div>
  )
})

LectorFoliate.displayName = 'LectorFoliate'

export default LectorFoliate
