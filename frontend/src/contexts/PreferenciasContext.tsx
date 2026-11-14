import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { VOZ_POR_DEFECTO } from '@config'
import { normalizarVelocidad } from '@logica/velocidad'
import { type ClaveFuenteLector, FUENTES_LECTOR } from '@tema/fuentes'
import { activarSonidos } from '@utils/sonidos'

/*
 * PREFERENCIAS DE ESTE DISPOSITIVO: la voz y la velocidad con que se empieza,
 * los sonidos (página, madera) y cómo se ve el papel del lector.
 *
 * Viven en el dispositivo (AsyncStorage) y no en el servidor porque son de
 * cómo se lee AQUÍ: en el iPhone con la letra grande y en el PC con dos
 * columnas. Lo que tiene que viajar entre dispositivos —dónde vas, tus notas—
 * sí va al servidor.
 */

export type TemaPapel = 'marfil' | 'pergamino' | 'noche'
/**
 * Cómo se lee: 'paginado' pasar páginas (una), 'continuo' HOJAS (desplazamiento vertical,
 * hojas de papel una debajo de otra) y 'libro' el libro abierto a dos páginas (PC).
 */
export type ModoLector = 'paginado' | 'continuo' | 'libro'

export interface Preferencias {
  vozId: string
  velocidad: number
  sonidos: boolean
  temaPapel: TemaPapel
  fuente: ClaveFuenteLector
  /** Tamaño de letra del lector en %, 80..200. */
  tamano: number
  /** Margen lateral del lector en %, 0..20. */
  margen: number
  interlineado: number
  modo: ModoLector
  /** Si la persona eligió el modo en este dispositivo; si no, se elige según la ventana (logica de modoLectura). */
  modoElegido?: boolean
  /** Si eligió el papel; si no, el papel sigue al ambiente (Marfil de día, Noche de noche: UX5-14). */
  papelElegido?: boolean
}

export const PREFERENCIAS_INICIALES: Preferencias = {
  vozId: VOZ_POR_DEFECTO,
  velocidad: 1,
  sonidos: true,
  temaPapel: 'noche',
  fuente: 'literata',
  tamano: 110,
  margen: 6,
  interlineado: 1.55,
  modo: 'paginado',
}

const CLAVE = '@biblioteca_ah_preferencias'

interface Ctx {
  prefs: Preferencias
  cambiar: (p: Partial<Preferencias>) => void
  cargadas: boolean
}

const PreferenciasContext = createContext<Ctx>({ prefs: PREFERENCIAS_INICIALES, cambiar: () => {}, cargadas: false })

export const usePreferencias = () => useContext(PreferenciasContext)

export const leerPreferencias = (json: string | null): Preferencias => {
  if (!json) return PREFERENCIAS_INICIALES
  try {
    const g = JSON.parse(json)
    const r = { ...PREFERENCIAS_INICIALES, ...(g && typeof g === 'object' ? g : {}) }
    r.velocidad = normalizarVelocidad(Number(r.velocidad))
    r.tamano = Math.min(200, Math.max(80, Number(r.tamano) || 110))
    r.margen = Math.min(20, Math.max(0, Number(r.margen) || 0))
    if (!['marfil', 'pergamino', 'noche'].includes(r.temaPapel)) r.temaPapel = 'noche'
    if (!['paginado', 'continuo', 'libro'].includes(r.modo)) r.modo = 'paginado'
    r.modoElegido = r.modoElegido === true
    if (!FUENTES_LECTOR.some((f) => f.clave === r.fuente)) r.fuente = 'literata'
    /* UX5-14: un papel que no sea Noche se eligió a mano; Noche era el de fábrica y se guardaba sin elegirlo. */
    r.papelElegido = r.papelElegido === true || (!!g?.temaPapel && r.temaPapel !== 'noche')
    return r
  } catch {
    return PREFERENCIAS_INICIALES
  }
}

export const PreferenciasProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<Preferencias>(PREFERENCIAS_INICIALES)
  const [cargadas, setCargadas] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((g) => setPrefs(leerPreferencias(g ?? null)))
      .catch(() => {})
      .finally(() => setCargadas(true))
  }, [])

  useEffect(() => {
    activarSonidos(prefs.sonidos)
  }, [prefs.sonidos])

  const cambiar = useCallback((p: Partial<Preferencias>) => {
    setPrefs((prev) => {
      const sig = { ...prev, ...p }
      AsyncStorage.setItem(CLAVE, JSON.stringify(sig)).catch(() => {})
      return sig
    })
  }, [])

  return <PreferenciasContext.Provider value={{ prefs, cambiar, cargadas }}>{children}</PreferenciasContext.Provider>
}

/** El papel con el que se abre el lector: el elegido o, si no, el del ambiente (UX5-14). */
export const papelEfectivo = (p: Preferencias, ambienteOscuro: boolean): TemaPapel =>
  p.papelElegido ? p.temaPapel : ambienteOscuro ? 'noche' : 'marfil'
