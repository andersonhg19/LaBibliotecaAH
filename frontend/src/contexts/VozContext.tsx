import { useSyncExternalStore } from 'react'

import { Platform } from 'react-native'

import { urlBinaria } from '@servicios/archivos'
import { audioService, progresoService } from '@servicios/bibliotecaService'
import { enviarLatido } from '@servicios/sesionesService'
import type { PartesCapitulo, TiemposCapitulo } from '@tipos'
import { crearCinta } from '@utils/cinta'
import { MotorAudio, uuid } from '@utils/motorAudio'
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
  pedirEstado: (d, o) => audioService.estado(d, o),
  cargarTiempos: async (url) => {
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as TiemposCapitulo
  },
  cargarPartes: async (url) => {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return null
    return (await r.json()) as PartesCapitulo
  },
  guardarServidor: (p) => progresoService.guardar(p),
  guardarLocal: (p) => guardarProgresoLocal(p),
  resolverUrl: (ruta) => urlBinaria(ruta),
  // iPhone/iPad: los capítulos seguidos en un solo flujo (sin «fin» que suspenda la página bloqueada).
  cinta: (el) => crearCinta(el),
  dispositivo: esteDispositivo,
  ahora: () => Date.now(),
  // 0.4.0 (C4): cada minuto sonando, y al pausar, se cuenta la escucha para las estadísticas.
  latido: (d, o) => enviarLatido(o?.alSalir ? { ...d, alSalir: true } : d),
  nuevoId: uuid,
  alVolverLaRed: (fn) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {}
    window.addEventListener('online', fn)
    return () => window.removeEventListener('online', fn)
  },
})

/*
 * Al cerrar la pestaña, lo último que se oyó se sube al servidor (y el latido de la sesión con lo escuchado: el
 * servidor pide el token en la cabecera: va con fetch keepalive y Authorization, no con sendBeacon, que no la lleva).
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    motor.guardar(true)
    motor.latir(false, true)
  })
  document.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    motor.guardar(true)
    motor.latir(false, true)
  })
}

export const useVoz = () => useSyncExternalStore(motor.suscribir, motor.obtener, motor.obtener)
