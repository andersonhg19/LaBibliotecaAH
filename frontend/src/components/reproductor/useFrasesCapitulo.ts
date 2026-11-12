import { useCallback, useEffect, useState } from 'react'

import { urlFrasesCapitulo } from '@servicios/archivos'

/*
 * EL TEXTO DEL CAPÍTULO QUE SUENA, frase a frase (contratos §5,
 * `frases/cap-NNN.json`). Lo usa el panel «Ver texto» del reproductor.
 *
 * Caché en memoria por archivo y capítulo: abrir y cerrar el panel, o volver a
 * un capítulo ya visto, no vuelve a descargar nada. Solo se cachea lo que llegó
 * bien; un fallo se puede reintentar.
 */

export interface FraseDeTexto {
  id: string
  texto: string
  finParrafo?: boolean
  esTitulo?: boolean
}

export interface EstadoFrases {
  frases: FraseDeTexto[] | null
  cargando: boolean
  error: string | null
  reintentar: () => void
}

export const TEXTOS_PANEL = {
  error: 'No se pudo cargar el texto de este capítulo.',
}

const cache = new Map<string, FraseDeTexto[]>()

/** Para las pruebas. */
export const olvidarFrasesEnCache = () => cache.clear()

export async function cargarFrasesCapitulo(archivoId: string, capitulo: number): Promise<FraseDeTexto[]> {
  const clave = `${archivoId}:${capitulo}`
  const guardadas = cache.get(clave)
  if (guardadas) return guardadas
  const r = await fetch(urlFrasesCapitulo(archivoId, capitulo))
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const datos = (await r.json()) as { frases?: FraseDeTexto[] }
  const frases = Array.isArray(datos?.frases) ? datos.frases.filter((f) => f && typeof f.id === 'string') : []
  cache.set(clave, frases)
  return frases
}

/** Carga las frases solo mientras `activo` (el panel abierto). */
export function useFrasesCapitulo(archivoId: string | null, capitulo: number, activo: boolean): EstadoFrases {
  const [estado, setEstado] = useState<{ clave: string; frases: FraseDeTexto[] | null; error: string | null }>({
    clave: '',
    frases: null,
    error: null,
  })
  const [intento, setIntento] = useState(0)
  const clave = archivoId ? `${archivoId}:${capitulo}` : ''

  useEffect(() => {
    if (!activo || !archivoId) return
    let vivo = true
    const enCache = cache.get(clave)
    if (enCache) {
      setEstado({ clave, frases: enCache, error: null })
      return
    }
    setEstado({ clave, frases: null, error: null })
    cargarFrasesCapitulo(archivoId, capitulo)
      .then((frases) => {
        if (vivo) setEstado({ clave, frases, error: null })
      })
      .catch((e: unknown) => {
        console.error('[voz] no se pudo cargar el texto del capítulo', e)
        if (vivo) setEstado({ clave, frases: null, error: TEXTOS_PANEL.error })
      })
    return () => {
      vivo = false
    }
  }, [activo, archivoId, capitulo, clave, intento])

  const reintentar = useCallback(() => setIntento((n) => n + 1), [])
  const actual = estado.clave === clave
  return {
    frases: actual ? estado.frases : null,
    cargando: activo && !!archivoId && (!actual || (!estado.frases && !estado.error)),
    error: actual ? estado.error : null,
    reintentar,
  }
}

/** Agrupa las frases en párrafos: se cierra uno en cada fin de párrafo y alrededor de cada título. */
export function enParrafos(frases: readonly FraseDeTexto[]): { titulo: boolean; frases: FraseDeTexto[] }[] {
  const salida: { titulo: boolean; frases: FraseDeTexto[] }[] = []
  let actual: FraseDeTexto[] = []
  const cerrar = (titulo = false) => {
    if (actual.length) salida.push({ titulo, frases: actual })
    actual = []
  }
  for (const f of frases) {
    if (f.esTitulo) {
      cerrar()
      actual.push(f)
      cerrar(true)
      continue
    }
    actual.push(f)
    if (f.finParrafo) cerrar()
  }
  cerrar()
  return salida
}
