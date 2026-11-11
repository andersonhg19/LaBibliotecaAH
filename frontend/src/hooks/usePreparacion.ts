import { useEffect, useRef } from 'react'

import { seEstaPreparando } from '@logica/formato'
import { librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO } from '@tipos'

const CADA_MS = 4000

/*
 * Los libros recién subidos llegan "preparando…" (el taller los convierte a
 * EPUB). Mientras haya alguno así a la vista, se pregunta por cada uno cada
 * 4 s y se avisa cuando cambia, para que la portada pase sola a "lista".
 */
export function usePreparacion(libros: EjemplarDTO[], alCambiar: (l: EjemplarDTO) => void) {
  const alCambiarRef = useRef(alCambiar)
  useEffect(() => {
    alCambiarRef.current = alCambiar
  }, [alCambiar])
  const pendientes = libros.filter(seEstaPreparando).map((l) => l.id)
  const clave = pendientes.join('|')

  useEffect(() => {
    if (!clave) return
    const ids = clave.split('|')
    let vivo = true
    const t = setInterval(async () => {
      for (const id of ids) {
        try {
          const r = await librosService.detalle(id)
          if (vivo && r.correct && r.object && !seEstaPreparando(r.object)) alCambiarRef.current(r.object)
        } catch (e) {
          console.warn('[preparacion] no se pudo consultar', id, e)
        }
      }
    }, CADA_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [clave])
}
