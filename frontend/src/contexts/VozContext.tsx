import { useSyncExternalStore } from 'react'

import { Platform } from 'react-native'

import { urlBinaria } from '@servicios/archivos'
import { audioService, progresoService } from '@servicios/bibliotecaService'
import type { TiemposCapitulo } from '@tipos'
import { MotorAudio } from '@utils/motorAudio'
import { esteDispositivo, guardarProgresoLocal } from '@utils/progresoLocal'

/*
 * La voz de la sesión: UN motor y UN <audio> para toda la app (ver
 * utils/motorAudio). No es un Provider con estado propio a propósito: el
 * motor vive fuera de React para que cambiar de pantalla no lo desmonte, y
 * los componentes se suscriben con useSyncExternalStore.
 */

const crearAudio = (): HTMLAudioElement | null => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null
  const el = document.createElement('audio')
  el.setAttribute('aria-hidden', 'true')
  el.style.display = 'none'
  document.body?.appendChild(el)
  return el
}

export const motor = new MotorAudio({
  crearAudio,
  pedirEstado: (d) => audioService.estado(d),
  cargarTiempos: async (url) => {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as TiemposCapitulo
  },
  guardarServidor: (p) => progresoService.guardar(p),
  guardarLocal: (p) => guardarProgresoLocal(p),
  resolverUrl: (ruta) => urlBinaria(ruta),
  dispositivo: esteDispositivo,
  ahora: () => Date.now(),
})

/* Al cerrar la pestaña, lo último que se oyó se sube al servidor. */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => motor.guardar(true))
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'hidden') motor.guardar(true)
  })
}

export const useVoz = () => useSyncExternalStore(motor.suscribir, motor.obtener, motor.obtener)
