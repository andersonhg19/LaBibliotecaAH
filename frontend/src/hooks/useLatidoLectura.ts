import { useCallback, useEffect, useRef } from 'react'

import { Platform } from 'react-native'

import { MAX_SEGUNDOS_LATIDO, enviarLatido, nuevaSesionId } from '@servicios/sesionesService'
import type { LatidoDTO } from '@tipos'
import { esteDispositivo } from '@utils/progresoLocal'

/*
 * EL LATIDO DEL LECTOR (contrato C4). Cuenta el tiempo de LECTURA de verdad:
 *
 *   · cada 60 s, si la página está a la vista y hubo actividad (pasar página,
 *     tocar, teclear, desplazar) en los últimos 2 minutos, se manda un latido
 *     con los segundos transcurridos desde el anterior;
 *   · al ocultar la pestaña, cerrar o salir del lector, un último latido por
 *     keepalive con lo que faltaba;
 *   · el tiempo con la pestaña oculta o sin tocar nada no se cuenta.
 *
 * La lógica vive en `Latidor` (sin React ni temporizadores: se prueba sola) y
 * `useLatidoLectura` solo la conecta a la página.
 */

export const CADA_LATIDO_MS = 60_000
/** Sin tocar nada en este rato, ya no se está leyendo (el móvil quedó en la mesa). */
export const INACTIVIDAD_MS = 120_000

export interface PosicionLectura {
  capitulo: number
  posicion: number
}

interface DepsLatidor {
  ejemplarId: string
  enviar: (d: LatidoDTO & { alSalir?: boolean }) => unknown
  ahora: () => number
  posicion: () => PosicionLectura | null
  dispositivo?: string
  sesionId?: string
}

export class Latidor {
  readonly sesionId: string
  private ultimoLatido: number
  private ultimaActividad: number
  constructor(private d: DepsLatidor) {
    this.sesionId = d.sesionId ?? nuevaSesionId()
    this.ultimoLatido = d.ahora()
    this.ultimaActividad = d.ahora()
  }
  /** Pasar página, tocar, teclear… */
  actividad() {
    this.ultimaActividad = this.d.ahora()
  }
  /** La página vuelve a verse: lo de mientras estaba oculta no cuenta. */
  reanudar() {
    const t = this.d.ahora()
    this.ultimoLatido = t
    this.ultimaActividad = t
  }
  private activo(t: number) {
    return t - this.ultimaActividad <= INACTIVIDAD_MS
  }
  /**
   * Cada minuto. Devuelve los segundos que se mandaron (0 si no se mandó).
   * Si no hubo actividad, el reloj avanza igual: ese rato no se suma después.
   */
  tic(visible: boolean, alSalir = false): number {
    const t = this.d.ahora()
    const segundos = Math.min(MAX_SEGUNDOS_LATIDO, Math.round((t - this.ultimoLatido) / 1000))
    // Sin actividad reciente, solo cuenta hasta 2 min después del último toque.
    const contables = this.activo(t)
      ? segundos
      : Math.max(0, Math.min(segundos, Math.round((this.ultimaActividad + INACTIVIDAD_MS - this.ultimoLatido) / 1000)))
    this.ultimoLatido = t
    const pos = this.d.posicion()
    if (!visible && !alSalir) return 0
    if (contables <= 0 || !pos) return 0
    this.d.enviar({
      ejemplarId: this.d.ejemplarId,
      modo: 'LECTURA',
      sesionId: this.sesionId,
      capitulo: pos.capitulo,
      posicion: pos.posicion,
      segundos: contables,
      ...(this.d.dispositivo ? { dispositivo: this.d.dispositivo } : {}),
      ...(alSalir ? { alSalir: true } : {}),
    })
    return contables
  }
}

const esWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined'
const visible = () => !esWeb || document.visibilityState !== 'hidden'

/**
 * Conecta el latido al lector abierto. `posicion` se lee en cada latido (un
 * getter estable: la ref del lector), así el hook no se reinicia al pasar
 * página. Devuelve `actividad()` para avisar de lo que la página no ve (el
 * cambio de ubicación de foliate dentro de su iframe).
 */
export function useLatidoLectura(
  ejemplarId: string | null,
  posicion: () => PosicionLectura | null,
): { actividad: () => void } {
  const latidor = useRef<Latidor | null>(null)
  const pos = useRef(posicion)
  pos.current = posicion

  useEffect(() => {
    if (!ejemplarId) return
    const l = new Latidor({
      ejemplarId,
      enviar: enviarLatido,
      ahora: () => Date.now(),
      posicion: () => pos.current(),
      dispositivo: esteDispositivo(),
    })
    latidor.current = l
    const reloj = setInterval(() => l.tic(visible()), CADA_LATIDO_MS)
    if (!esWeb) {
      return () => {
        clearInterval(reloj)
        l.tic(true, true)
        latidor.current = null
      }
    }
    const toque = () => l.actividad()
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') l.tic(false, true)
      else l.reanudar()
    }
    const alSalir = () => l.tic(false, true)
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    eventos.forEach((e) => window.addEventListener(e, toque, { passive: true }))
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('pagehide', alSalir)
    return () => {
      clearInterval(reloj)
      eventos.forEach((e) => window.removeEventListener(e, toque))
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pagehide', alSalir)
      // Salir del lector (volver a la ficha): lo último que se leyó.
      if (visible()) l.tic(true, true)
      latidor.current = null
    }
  }, [ejemplarId])

  const actividad = useCallback(() => latidor.current?.actividad(), [])
  return { actividad }
}
