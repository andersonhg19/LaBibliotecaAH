import { useCallback, useState } from 'react'

/*
 * Tres estados, no dos.
 *
 * La auditoria encontro 8 catch vacios y 12 comprobaciones de res.correct sin
 * rama else. Con eso, token caducado, backend caido, permiso denegado y "aun no
 * tienes datos" terminaban pintando EXACTAMENTE el mismo pixel: la pantalla
 * vacia. El usuario no podia distinguir un fallo de una lista sin registros, y
 * por eso la app "se sentia inestable".
 *
 * Este hook obliga a separar cargando / listo / error, y a que el error traiga
 * el mensaje que el backend ya se molesto en calcular.
 */

export const MENSAJE_ERROR_POR_DEFECTO = 'Error al cargar datos. Intenta de nuevo.'

const MARCA_ERROR_DE_CARGA = '__esErrorDeCarga'

/** Convierte un mensaje del backend en una excepcion reconocible por useCarga. */
export const errorDeCarga = (mensaje?: string): Error =>
  Object.assign(new Error(mensaje?.trim() || MENSAJE_ERROR_POR_DEFECTO), {
    [MARCA_ERROR_DE_CARGA]: true,
  })

interface RespuestaBackend<T> {
  correct: boolean
  message?: string
  object?: T
}

/**
 * Devuelve el object de una respuesta correcta y lanza con el message del
 * backend cuando correct es false. Sustituye al `if (res.correct)` suelto, que
 * al no tener else dejaba la pantalla en su estado inicial y silenciaba la
 * unica explicacion disponible.
 */
export function exigir<T>(res: RespuestaBackend<T> | null | undefined): T | undefined {
  if (!res || !res.correct) {
    throw errorDeCarga(res?.message)
  }
  return res.object
}

/** Saca el texto mas util disponible: el nuestro, el del backend, o el generico. */
export function mensajeDeError(error: unknown): string {
  const err = error as
    ({ message?: unknown; response?: { data?: { message?: unknown } } } & Record<string, unknown>) | null | undefined
  if (err && err[MARCA_ERROR_DE_CARGA] && typeof err.message === 'string') {
    return err.message
  }
  const delBackend = err?.response?.data?.message
  if (typeof delBackend === 'string' && delBackend.trim()) {
    return delBackend
  }
  return MENSAJE_ERROR_POR_DEFECTO
}

export interface Carga {
  cargando: boolean
  refrescando: boolean
  error: string | null
  /** Carga con spinner: primera entrada, cambio de filtro o reintento. */
  cargar: () => Promise<void>
  /** Carga sin spinner de pantalla completa: pull to refresh. */
  refrescar: () => Promise<void>
}

export function useCarga(tarea: () => Promise<void>): Carga {
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const correr = useCallback(
    async (esRefresco: boolean) => {
      if (esRefresco) setRefrescando(true)
      else setCargando(true)
      setError(null)
      try {
        await tarea()
      } catch (err) {
        setError(mensajeDeError(err))
      } finally {
        setCargando(false)
        setRefrescando(false)
      }
    },
    [tarea],
  )

  const cargar = useCallback(() => correr(false), [correr])
  const refrescar = useCallback(() => correr(true), [correr])

  return { cargando, refrescando, error, cargar, refrescar }
}
