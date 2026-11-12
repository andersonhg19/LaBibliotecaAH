import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  type Coincidencia,
  type IndiceHoja,
  buscar,
  celdaEn,
  clave,
  combinadaDe,
  indexar,
  limitarZoom,
  nombreCelda,
  siguienteZoom,
} from '@componentes/hoja/rejilla'
import type { HojaDeCalculo, LibroDeHojas } from '@componentes/hoja/tipos'

export interface Celda {
  fila: number
  columna: number
}

/** Una petición de "llévame a esta celda" (n cambia aunque la celda sea la misma). */
export interface IrA extends Celda {
  n: number
}

/*
 * EL ESTADO DEL VISOR (igual en web y en el respaldo nativo): hoja activa,
 * zoom, anchos arrastrados, celda elegida y búsqueda. La rejilla solo pinta.
 */
export function useVisorHoja(libro: LibroDeHojas) {
  const [hojaActiva, setHojaActiva] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [ajustes, setAjustes] = useState<Record<number, Record<number, number>>>({})
  const [seleccion, setSeleccion] = useState<Celda | null>(null)
  const [irA, setIrA] = useState<IrA | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [texto, setTexto] = useState('')
  const [consulta, setConsulta] = useState('')
  const [actual, setActual] = useState(-1)

  /* El índice de cada hoja se arma una vez, la primera vez que se abre. */
  const indices = useRef(new Map<HojaDeCalculo, IndiceHoja>())
  const indiceDe = useCallback((h: HojaDeCalculo) => {
    let i = indices.current.get(h)
    if (!i) {
      i = indexar(h)
      indices.current.set(h, i)
    }
    return i
  }, [])
  const cache = useRef(new WeakMap<HojaDeCalculo, string[]>())

  const hoja = libro.hojas[Math.min(hojaActiva, libro.hojas.length - 1)]
  const indice = useMemo(() => indiceDe(hoja), [hoja, indiceDe])

  /* Se busca al dejar de escribir (200 ms), no en cada letra. */
  useEffect(() => {
    const t = setTimeout(() => setConsulta(texto), 200)
    return () => clearTimeout(t)
  }, [texto])
  const coincidencias: Coincidencia[] = useMemo(
    () => (buscando ? buscar(libro, consulta, cache.current) : []),
    [libro, consulta, buscando],
  )
  useEffect(() => setActual(-1), [coincidencias])

  const ir = useCallback((c: Coincidencia) => {
    setHojaActiva(c.hoja)
    setSeleccion({ fila: c.fila, columna: c.columna })
    setIrA((p) => ({ fila: c.fila, columna: c.columna, n: (p?.n ?? 0) + 1 }))
  }, [])

  const saltar = useCallback(
    (sentido: 1 | -1) => {
      if (!coincidencias.length) return
      const n = coincidencias.length
      const i = actual < 0 ? (sentido > 0 ? 0 : n - 1) : (actual + sentido + n) % n
      setActual(i)
      ir(coincidencias[i])
    },
    [coincidencias, actual, ir],
  )

  const elegirHoja = useCallback((h: number) => {
    setHojaActiva(h)
    setSeleccion(null)
  }, [])

  const mover = useCallback(
    (df: number, dc: number) => {
      const base = seleccion ?? { fila: 0, columna: 0 }
      const m = combinadaDe(indice, base.fila, base.columna)
      /* Salir de una combinada por su borde, no celda a celda por dentro. */
      const desdeF = m ? (df > 0 ? m.f2 : df < 0 ? m.f1 : base.fila) : base.fila
      const desdeC = m ? (dc > 0 ? m.c2 : dc < 0 ? m.c1 : base.columna) : base.columna
      let fila = Math.min(hoja.filas - 1, Math.max(0, desdeF + df))
      let columna = Math.min(hoja.columnas - 1, Math.max(0, desdeC + dc))
      const destino = combinadaDe(indice, fila, columna)
      if (destino) {
        fila = destino.f1
        columna = destino.c1
      }
      setSeleccion({ fila, columna })
      setIrA((p) => ({ fila, columna, n: (p?.n ?? 0) + 1 }))
    },
    [seleccion, indice, hoja],
  )

  const seleccionar = useCallback(
    (fila: number, columna: number) => {
      const m = combinadaDe(indice, fila, columna)
      setSeleccion(m ? { fila: m.f1, columna: m.c1 } : { fila, columna })
    },
    [indice],
  )

  const ajustarAncho = useCallback(
    (columna: number, px: number) =>
      setAjustes((a) => ({ ...a, [hojaActiva]: { ...(a[hojaActiva] ?? {}), [columna]: Math.round(px) } })),
    [hojaActiva],
  )

  const cambiarZoom = useCallback((sentido: 1 | -1) => setZoom((z) => siguienteZoom(z, sentido)), [])
  const fijarZoom = useCallback((z: number) => setZoom(limitarZoom(z)), [])

  const cerrarBusqueda = useCallback(() => {
    setBuscando(false)
    setTexto('')
    setConsulta('')
  }, [])

  /* Coincidencias de la hoja activa, para pintarlas sin buscar en cada celda. */
  const enEstaHoja = useMemo(() => {
    const s = new Set<number>()
    for (const c of coincidencias) if (c.hoja === hojaActiva) s.add(clave(c.fila, c.columna))
    return s
  }, [coincidencias, hojaActiva])
  const claveActual =
    actual >= 0 && coincidencias[actual]?.hoja === hojaActiva
      ? clave(coincidencias[actual].fila, coincidencias[actual].columna)
      : null

  const textoSeleccion = seleccion
    ? `${nombreCelda(seleccion.fila, seleccion.columna)} · ${celdaEn(indice, seleccion.fila, seleccion.columna)?.[2] || '(vacía)'}`
    : null

  return {
    hojaActiva,
    hoja,
    indice,
    elegirHoja,
    zoom,
    cambiarZoom,
    fijarZoom,
    anchosAjustados: ajustes[hojaActiva] ?? {},
    ajustarAncho,
    seleccion,
    seleccionar,
    mover,
    textoSeleccion,
    irA,
    buscando,
    abrirBusqueda: () => setBuscando(true),
    cerrarBusqueda,
    texto,
    setTexto,
    coincidencias,
    actual,
    saltar,
    enEstaHoja,
    claveActual,
  }
}

export type EstadoVisor = ReturnType<typeof useVisorHoja>
