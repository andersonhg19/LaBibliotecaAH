import AsyncStorage from '@react-native-async-storage/async-storage'

import { nombreDispositivo } from '@logica/progreso'
import type { ProgresoDTO } from '@tipos'

/*
 * El respaldo LOCAL del progreso: se escribe cada 5 s. La memoria de verdad es
 * el servidor (cada 15 s y al pausar); esto solo cubre el caso de cerrar la
 * pestaña o perder la conexión antes de que llegue la siguiente subida.
 */
const clave = (ejemplarId: string) => `@biblioteca_ah_progreso_${ejemplarId}`

export async function leerProgresoLocal(ejemplarId: string): Promise<ProgresoDTO | null> {
  try {
    const g = await AsyncStorage.getItem(clave(ejemplarId))
    if (!g) return null
    const p = JSON.parse(g)
    return p && p.ejemplarId === ejemplarId ? p : null
  } catch {
    return null
  }
}

export async function guardarProgresoLocal(p: ProgresoDTO): Promise<void> {
  try {
    await AsyncStorage.setItem(clave(p.ejemplarId), JSON.stringify(p))
  } catch {
    /* sin almacenamiento: queda solo el servidor */
  }
}

let dispositivoCache: string | null = null
/** "iPhone", "Android", "PC"… (sale en "Seguiste en … hasta …"). */
export const esteDispositivo = (): string => {
  if (dispositivoCache) return dispositivoCache
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  dispositivoCache = nombreDispositivo(ua)
  return dispositivoCache
}
