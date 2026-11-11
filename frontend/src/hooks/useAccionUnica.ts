import { useCallback, useRef, useState } from 'react'

/*
 * Un doble toque en "Guardar" creaba DOS movimientos identicos.
 *
 * El boton ya recibia `loading`, pero setLoading(true) es asincrono: los dos
 * toques del doble toque podian entrar antes de que React volviera a pintar el
 * boton deshabilitado. El cerrojo tiene que ser sincrono, y eso es un ref.
 */
export interface AccionUnica {
  ejecutando: boolean
  ejecutar: () => Promise<void>
}

export function useAccionUnica(accion: () => Promise<void>): AccionUnica {
  const [ejecutando, setEjecutando] = useState(false)
  const enCurso = useRef(false)

  const ejecutar = useCallback(async () => {
    if (enCurso.current) return
    enCurso.current = true
    setEjecutando(true)
    try {
      await accion()
    } finally {
      enCurso.current = false
      setEjecutando(false)
    }
  }, [accion])

  return { ejecutando, ejecutar }
}
