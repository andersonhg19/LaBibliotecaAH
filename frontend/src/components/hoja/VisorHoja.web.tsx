import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { View } from 'react-native'

import { BarraSeleccion, ControlesHoja } from '@componentes/hoja/ControlesHoja'
import type { PropsVisorHoja } from '@componentes/hoja/VisorHoja'
import {
  ALTO_LETRAS,
  ANCHO_NUMEROS,
  type Combinada,
  LETRA,
  type Rango,
  acumulados,
  alineacionPorDefecto,
  altosDe,
  anchoAlContenido,
  anchosDe,
  celdaEn,
  clave,
  combinadasQueTocan,
  desplazarPara,
  fijasDe,
  letraColumna,
  mismoRango,
  rangoVisible,
} from '@componentes/hoja/rejilla'
import type { EstiloCelda, TipoCelda } from '@componentes/hoja/tipos'
import { type EstadoVisor, useVisorHoja } from '@componentes/hoja/useVisorHoja'
import { fuentes, paleta } from '@tema'
import { reducirMovimiento } from '@tema/web'

/*
 * EL VISOR DE HOJAS EN LA WEB.
 *
 * Un solo contenedor con scroll nativo (el dedo en el iPhone se mueve como en
 * cualquier página) y, dentro, cuatro capas:
 *
 *   ┌ esquina (fija arriba e izquierda) ┬ banda de arriba: letras + filas fijas ┐
 *   ├ banda izquierda: nº de fila +     ┼ cuerpo                                ┤
 *   └   columnas fijas (fija a la izq.) ┴                                       ┘
 *
 * Las bandas usan `position: sticky`, así que no hay que sincronizar scrolls a
 * mano. Solo se pintan las celdas que se ven (+ un margen): rejilla.ts dice
 * cuáles, y aquí se recalcula en requestAnimationFrame al desplazar.
 */

const PAPEL = paleta.marfil
const PAPEL_CABECERA = '#F1EADB'
const TINTA = paleta.robleOscuro
const TINTA_CABECERA = '#6B5644'
const LINEA = '#DDD2B9'
const LINEA_CABECERA = '#CDBF9F'
const MIEL = paleta.miel
const COINCIDENCIA = 'rgba(217,163,91,0.30)'

interface Rangos {
  filas: Rango
  columnas: Rango
}

const VisorHoja: React.FC<PropsVisorHoja> = ({ libro }) => {
  const v = useVisorHoja(libro)

  /* Ctrl/⌘ + F abre la búsqueda de la hoja (no la del navegador). */
  const { abrirBusqueda } = v
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        abrirBusqueda()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abrirBusqueda])

  return (
    <View style={{ flex: 1, minHeight: 0 }} testID="visor-hoja">
      <ControlesHoja libro={libro} v={v} />
      <View style={{ flex: 1, minHeight: 0 }}>
        <Rejilla key={v.hojaActiva} v={v} />
      </View>
      <BarraSeleccion texto={v.textoSeleccion} />
    </View>
  )
}

const Rejilla: React.FC<{ v: EstadoVisor }> = ({ v }) => {
  const { hoja, indice, zoom } = v
  const caja = useRef<HTMLDivElement>(null)
  const anchos = useMemo(() => anchosDe(hoja, v.anchosAjustados), [hoja, v.anchosAjustados])
  const altos = useMemo(() => altosDe(hoja), [hoja])
  const posX = useMemo(() => acumulados(anchos, zoom), [anchos, zoom])
  const posY = useMemo(() => acumulados(altos, zoom), [altos, zoom])
  const fijas = useMemo(() => fijasDe(hoja), [hoja])

  const numerosW = Math.round(ANCHO_NUMEROS * Math.max(zoom, 0.75))
  const letrasH = Math.round(ALTO_LETRAS * Math.max(zoom, 0.75))
  const fx = posX[fijas.columnas]
  const fy = posY[fijas.filas]
  const cuerpoW = posX[hoja.columnas] - fx
  const cuerpoH = posY[hoja.filas] - fy
  const izquierdaW = numerosW + fx
  const arribaH = letrasH + fy

  const [rangos, setRangos] = useState<Rangos>({
    filas: { inicio: fijas.filas, fin: Math.min(hoja.filas - 1, fijas.filas + 40) },
    columnas: { inicio: fijas.columnas, fin: Math.min(hoja.columnas - 1, fijas.columnas + 12) },
  })

  const medir = useCallback(() => {
    const el = caja.current
    if (!el) return
    const filas = rangoVisible(posY, fijas.filas, el.scrollTop, el.clientHeight - arribaH, 4)
    const columnas = rangoVisible(posX, fijas.columnas, el.scrollLeft, el.clientWidth - izquierdaW, 2)
    setRangos((r) => (mismoRango(r.filas, filas) && mismoRango(r.columnas, columnas) ? r : { filas, columnas }))
  }, [posX, posY, fijas, arribaH, izquierdaW])

  useLayoutEffect(() => {
    medir()
  }, [medir])

  useEffect(() => {
    const el = caja.current
    if (!el) return
    let pendiente = 0
    const alDesplazar = () => {
      if (pendiente) return
      pendiente = requestAnimationFrame(() => {
        pendiente = 0
        medir()
      })
    }
    el.addEventListener('scroll', alDesplazar, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(alDesplazar) : null
    ro?.observe(el)
    window.addEventListener('resize', alDesplazar)
    return () => {
      el.removeEventListener('scroll', alDesplazar)
      ro?.disconnect()
      window.removeEventListener('resize', alDesplazar)
      if (pendiente) cancelAnimationFrame(pendiente)
    }
  }, [medir])

  /* Ctrl/⌘ + rueda = zoom (en vez del zoom de toda la página). */
  const { cambiarZoom } = v
  useEffect(() => {
    const el = caja.current
    if (!el) return
    let ultimo = 0
    const rueda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const ahora = Date.now()
      if (ahora - ultimo < 120) return
      ultimo = ahora
      cambiarZoom(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [cambiarZoom])

  /* "Llévame a esta celda" (búsqueda, flechas): se desplaza lo justo para verla fuera de lo fijo. */
  const irA = v.irA
  useEffect(() => {
    const el = caja.current
    if (!el || !irA) return
    const destino = desplazarPara(posX, posY, fijas, irA.fila, irA.columna, {
      x: el.scrollLeft,
      y: el.scrollTop,
      ancho: el.clientWidth - izquierdaW,
      alto: el.clientHeight - arribaH,
    })
    if (destino.x !== el.scrollLeft || destino.y !== el.scrollTop) {
      el.scrollTo({ left: destino.x, top: destino.y, behavior: reducirMovimiento() ? 'auto' : 'smooth' })
    }
    // Solo cuando llega una petición nueva, no al cambiar el zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irA])

  /* Un toque en cualquier celda (delegado: un solo manejador para todas). */
  const { seleccionar, mover } = v
  const alTocar = (e: React.MouseEvent<HTMLDivElement>) => {
    const celda = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null
    if (!celda) return
    seleccionar(Number(celda.dataset.f), Number(celda.dataset.c))
  }
  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const pasos: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const p = pasos[e.key]
    if (!p) return
    e.preventDefault()
    mover(p[0], p[1])
  }

  /* --------------------------------------------------- arrastre del ancho de columna */
  const { ajustarAncho } = v
  const ultimoToque = useRef<{ c: number; t: number }>({ c: -1, t: 0 })
  const agarrar = (e: React.PointerEvent<HTMLDivElement>, c: number) => {
    e.stopPropagation()
    e.preventDefault()
    const ahora = Date.now()
    if (ultimoToque.current.c === c && ahora - ultimoToque.current.t < 350) {
      ultimoToque.current = { c: -1, t: 0 }
      ajustarAncho(c, anchoAlContenido(hoja, indice, c))
      return
    }
    ultimoToque.current = { c, t: ahora }
    const inicioX = e.clientX
    const w0 = anchos[c]
    const asa = e.currentTarget
    asa.setPointerCapture?.(e.pointerId)
    const moverse = (m: PointerEvent) => ajustarAncho(c, w0 + (m.clientX - inicioX) / zoom)
    const soltar = () => {
      asa.removeEventListener('pointermove', moverse)
      asa.removeEventListener('pointerup', soltar)
      asa.removeEventListener('pointercancel', soltar)
    }
    asa.addEventListener('pointermove', moverse)
    asa.addEventListener('pointerup', soltar)
    asa.addEventListener('pointercancel', soltar)
  }

  /* --------------------------------------------------- pintar */
  const letra = LETRA * zoom
  const sel = v.seleccion ? clave(v.seleccion.fila, v.seleccion.columna) : -1

  /** Una celda (o una combinada) en (x, y) de su capa. */
  const celda = (
    f: number,
    c: number,
    x: number,
    y: number,
    w: number,
    h: number,
    combinada?: Combinada,
    oculta?: boolean,
  ) => {
    const datos = celdaEn(indice, f, c)
    const k = clave(f, c)
    return (
      <CeldaHoja
        key={k}
        f={f}
        c={c}
        x={x}
        y={y}
        w={w}
        h={h}
        zoom={zoom}
        texto={datos?.[2] ?? ''}
        tipo={datos?.[3] ?? 't'}
        estilo={(datos && hoja.estilos[datos[4]]) || SIN_ESTILO}
        marca={v.claveActual === k ? 2 : v.enEstaHoja.has(k) ? 1 : 0}
        seleccionada={sel === k}
        filasSpan={combinada ? combinada.f2 - combinada.f1 + 1 : 0}
        columnasSpan={combinada ? combinada.c2 - combinada.c1 + 1 : 0}
        oculta={!!oculta}
      />
    )
  }

  /**
   * Celdas de un rectángulo de filas × columnas de una capa, y las combinadas
   * que la tocan. Una combinada que cruza el borde de lo inmovilizado se pinta
   * entera en cada capa que toca (cada capa recorta lo suyo): así el título
   * combinado A1:H1 se lee aunque A esté fija.
   */
  const capa = (
    filas: Rango,
    columnas: Rango,
    dominio: { f: [number, number]; c: [number, number] },
    origen: { x: number; y: number },
  ) => {
    const r: React.ReactNode[] = []
    for (let f = filas.inicio; f <= filas.fin; f++) {
      const fila: React.ReactNode[] = []
      for (let c = columnas.inicio; c <= columnas.fin; c++) {
        if (indice.tapadas.has(clave(f, c))) continue
        fila.push(celda(f, c, posX[c] - origen.x, posY[f] - origen.y, posX[c + 1] - posX[c], posY[f + 1] - posY[f]))
      }
      if (fila.length)
        r.push(
          <div key={`f${f}`} role="row" aria-rowindex={f + 2} style={{ display: 'contents' }}>
            {fila}
          </div>,
        )
    }
    for (const m of combinadasQueTocan(indice, filas, columnas)) {
      const toca = m.f1 < dominio.f[1] && m.f2 >= dominio.f[0] && m.c1 < dominio.c[1] && m.c2 >= dominio.c[0]
      if (!toca) continue
      const anclaAqui = m.f1 >= dominio.f[0] && m.c1 >= dominio.c[0]
      r.push(
        <div key={`m${m.f1}-${m.c1}`} role="row" aria-rowindex={m.f1 + 2} style={{ display: 'contents' }}>
          {celda(
            m.f1,
            m.c1,
            posX[m.c1] - origen.x,
            posY[m.f1] - origen.y,
            posX[m.c2 + 1] - posX[m.c1],
            posY[m.f2 + 1] - posY[m.f1],
            m,
            !anclaAqui,
          )}
        </div>,
      )
    }
    return r
  }

  const letraCabecera = (c: number, x: number) => (
    <div
      key={`l${c}`}
      role="columnheader"
      aria-colindex={c + 2}
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: posX[c + 1] - posX[c],
        height: letrasH,
        boxSizing: 'border-box',
        borderRight: `1px solid ${LINEA_CABECERA}`,
        borderBottom: `1px solid ${LINEA_CABECERA}`,
        color: TINTA_CABECERA,
        textAlign: 'center',
        lineHeight: `${letrasH - 1}px`,
        overflow: 'hidden',
        background: v.seleccion && v.seleccion.columna === c ? 'rgba(201,162,39,0.25)' : PAPEL_CABECERA,
      }}
    >
      {letraColumna(c)}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Ancho de la columna ${letraColumna(c)}: arrastra para cambiarlo, doble toque para ajustarlo`}
        onPointerDown={(e) => agarrar(e, c)}
        style={{
          position: 'absolute',
          right: -8,
          top: 0,
          width: 16,
          height: '100%',
          cursor: 'col-resize',
          touchAction: 'none',
          zIndex: 3,
        }}
      />
    </div>
  )

  const numeroFila = (f: number, y: number) => (
    <div
      key={`n${f}`}
      role="rowheader"
      aria-rowindex={f + 2}
      style={{
        position: 'absolute',
        left: 0,
        top: y,
        width: numerosW,
        height: posY[f + 1] - posY[f],
        boxSizing: 'border-box',
        borderRight: `1px solid ${LINEA_CABECERA}`,
        borderBottom: `1px solid ${LINEA_CABECERA}`,
        color: TINTA_CABECERA,
        textAlign: 'right',
        paddingRight: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        background: v.seleccion && v.seleccion.fila === f ? 'rgba(201,162,39,0.25)' : PAPEL_CABECERA,
      }}
    >
      {f + 1}
    </div>
  )

  const fijasF: Rango = { inicio: 0, fin: fijas.filas - 1 }
  const fijasC: Rango = { inicio: 0, fin: fijas.columnas - 1 }
  const dCuerpo = {
    f: [fijas.filas, hoja.filas] as [number, number],
    c: [fijas.columnas, hoja.columnas] as [number, number],
  }
  const dArriba = { f: [0, fijas.filas] as [number, number], c: dCuerpo.c }
  const dIzquierda = { f: dCuerpo.f, c: [0, fijas.columnas] as [number, number] }
  const dEsquina = { f: dArriba.f, c: dIzquierda.c }

  const textoComun: React.CSSProperties = {
    fontFamily: fuentes.ui,
    fontSize: letra,
    fontVariantNumeric: 'tabular-nums',
  }

  const columnasVisibles: number[] = []
  for (let c = rangos.columnas.inicio; c <= rangos.columnas.fin; c++) columnasVisibles.push(c)
  const filasVisibles: number[] = []
  for (let f = rangos.filas.inicio; f <= rangos.filas.fin; f++) filasVisibles.push(f)

  return (
    <div
      ref={caja}
      role="grid"
      aria-label={`Celdas de la hoja ${hoja.nombre}`}
      aria-rowcount={hoja.filas + 1}
      aria-colcount={hoja.columnas + 1}
      aria-readonly
      tabIndex={0}
      onClick={alTocar}
      onKeyDown={alTeclear}
      data-testid="rejilla-hoja"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        background: PAPEL,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        outline: 'none',
        ...textoComun,
      }}
    >
      <div style={{ width: izquierdaW + cuerpoW, minHeight: arribaH + cuerpoH, position: 'relative' }}>
        {/* Arriba: esquina + letras y filas fijas */}
        <div
          style={{
            display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 4,
            height: arribaH,
            width: izquierdaW + cuerpoW,
          }}
        >
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 5,
              width: izquierdaW,
              height: arribaH,
              flex: 'none',
              background: PAPEL,
              overflow: 'hidden',
              boxShadow: fijas.columnas || fijas.filas ? '1px 1px 0 rgba(139,90,43,0.35)' : undefined,
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: numerosW,
                height: letrasH,
                background: PAPEL_CABECERA,
                borderRight: `1px solid ${LINEA_CABECERA}`,
                borderBottom: `1px solid ${LINEA_CABECERA}`,
                boxSizing: 'border-box',
              }}
            />
            {Array.from({ length: fijas.columnas }, (_, c) => letraCabecera(c, numerosW + posX[c]))}
            {Array.from({ length: fijas.filas }, (_, f) => numeroFila(f, letrasH + posY[f]))}
            <div style={{ position: 'absolute', left: numerosW, top: letrasH }}>
              {capa(fijasF, fijasC, dEsquina, { x: 0, y: 0 })}
            </div>
          </div>
          <div
            style={{
              position: 'relative',
              width: cuerpoW,
              height: arribaH,
              flex: 'none',
              background: PAPEL,
              overflow: 'hidden',
              boxShadow: fijas.filas ? '0 1px 0 rgba(139,90,43,0.35)' : undefined,
            }}
          >
            {columnasVisibles.map((c) => letraCabecera(c, posX[c] - fx))}
            <div style={{ position: 'absolute', left: 0, top: letrasH }}>
              {capa(fijasF, rangos.columnas, dArriba, { x: fx, y: 0 })}
            </div>
          </div>
        </div>
        {/* Abajo: números y columnas fijas + el cuerpo */}
        <div style={{ display: 'flex', width: izquierdaW + cuerpoW, height: cuerpoH }}>
          <div
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 3,
              width: izquierdaW,
              height: cuerpoH,
              flex: 'none',
              background: PAPEL,
              overflow: 'hidden',
              boxShadow: fijas.columnas ? '1px 0 0 rgba(139,90,43,0.35)' : undefined,
            }}
          >
            {filasVisibles.map((f) => numeroFila(f, posY[f] - fy))}
            <div style={{ position: 'absolute', left: numerosW, top: 0 }}>
              {capa(rangos.filas, fijasC, dIzquierda, { x: 0, y: fy })}
            </div>
          </div>
          <div style={{ position: 'relative', width: cuerpoW, height: cuerpoH, flex: 'none', overflow: 'hidden' }}>
            {capa(rangos.filas, rangos.columnas, dCuerpo, { x: fx, y: fy })}
          </div>
        </div>
      </div>
    </div>
  )
}

const SIN_ESTILO: EstiloCelda = {}

interface PropsCelda {
  f: number
  c: number
  x: number
  y: number
  w: number
  h: number
  zoom: number
  texto: string
  tipo: TipoCelda
  estilo: EstiloCelda
  /** 0 nada, 1 coincide con la búsqueda, 2 la coincidencia actual. */
  marca: 0 | 1 | 2
  seleccionada: boolean
  filasSpan: number
  columnasSpan: number
  /** Copia de una combinada cuya ancla vive en otra capa: no se anuncia dos veces. */
  oculta: boolean
}

/**
 * Una celda. Memorizada: al desplazar solo se crean las que entran en vista;
 * las que ya estaban no se vuelven a pintar (sus props no cambian).
 */
const CeldaHoja = React.memo(function CeldaHoja(p: PropsCelda) {
  const { estilo } = p
  const alinear = estilo.alinear ?? (p.texto ? alineacionPorDefecto(p.tipo) : 'izquierda')
  const vertical = estilo.vertical ?? 'centro'
  const combinada = p.filasSpan > 0
  const fondo = p.marca === 2 ? MIEL : p.marca === 1 ? COINCIDENCIA : (estilo.fondo ?? (combinada ? PAPEL : undefined))
  return (
    <div
      role="gridcell"
      aria-rowindex={p.f + 2}
      aria-colindex={p.c + 2}
      aria-selected={p.seleccionada}
      aria-hidden={p.oculta || undefined}
      {...(combinada ? { 'aria-rowspan': p.filasSpan, 'aria-colspan': p.columnasSpan } : {})}
      data-f={p.f}
      data-c={p.c}
      title={p.texto && !estilo.ajustar ? p.texto : undefined}
      style={{
        position: 'absolute',
        left: p.x,
        top: p.y,
        width: p.w,
        height: p.h,
        boxSizing: 'border-box',
        borderRight: `1px solid ${LINEA}`,
        borderBottom: `1px solid ${LINEA}`,
        background: fondo,
        color: estilo.color ?? TINTA,
        fontWeight: estilo.negrita ? 700 : 400,
        fontStyle: estilo.cursiva ? 'italic' : 'normal',
        textDecoration: estilo.subrayado ? 'underline' : 'none',
        textAlign: alinear === 'derecha' ? 'right' : alinear === 'centro' ? 'center' : 'left',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vertical === 'arriba' ? 'flex-start' : vertical === 'abajo' ? 'flex-end' : 'center',
        padding: `0 ${Math.max(2, Math.round(4 * p.zoom))}px`,
        overflow: 'hidden',
        outline: p.seleccionada ? `2px solid ${paleta.cedro}` : undefined,
        outlineOffset: -2,
        zIndex: p.seleccionada ? 2 : combinada ? 1 : undefined,
      }}
    >
      {p.texto ? (
        <span
          style={{
            whiteSpace: estilo.ajustar ? 'pre-wrap' : 'pre',
            overflow: 'hidden',
            textOverflow: estilo.ajustar ? undefined : 'ellipsis',
            overflowWrap: estilo.ajustar ? 'anywhere' : undefined,
            lineHeight: 1.25,
          }}
        >
          {p.texto}
        </span>
      ) : null}
    </div>
  )
})

export default VisorHoja
