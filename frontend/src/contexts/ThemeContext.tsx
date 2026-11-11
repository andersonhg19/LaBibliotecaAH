import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'

import { useColorScheme } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { ThemeColors, darkColors, lightColors } from '@tema/colors'

const THEME_KEY = '@biblioteca_ah_tema'

/*
 * Dos ambientes: "Biblioteca de noche" y "Sala de lectura de día" (la misma
 * librería, con luz de ventana y madera clara). Por defecto se sigue al
 * sistema (prefers-color-scheme): de día con el iPhone en claro, de noche en
 * oscuro. En Ajustes se puede fijar uno; se guarda en el dispositivo: cada uno
 * lee con la luz que tiene.
 *
 * `isDark`, `colors`, `setOscuro` y `toggleTheme` se mantienen tal cual: el
 * lector y el reproductor los usan.
 */
export type ModoTema = 'noche' | 'dia' | 'sistema'

interface ThemeContextType {
  colors: ThemeColors
  isDark: boolean
  /** Lo elegido en Ajustes (o "sistema"). */
  modo: ModoTema
  setModo: (m: ModoTema) => void
  toggleTheme: () => void
  setOscuro: (oscuro: boolean) => void
}

const ThemeContext = createContext<ThemeContextType>({
  colors: darkColors,
  isDark: true,
  modo: 'sistema',
  setModo: () => {},
  toggleTheme: () => {},
  setOscuro: () => {},
})

export const useTheme = () => useContext(ThemeContext)

/** Lo guardado → modo. Lo desconocido (o nada) sigue al sistema. */
export const leerModo = (guardado: string | null | undefined): ModoTema =>
  guardado === 'noche' || guardado === 'dia' || guardado === 'sistema' ? guardado : 'sistema'

/** ¿Noche? Si el modo es "sistema", manda el esquema del dispositivo; sin dato, la noche de la casa. */
export const esNoche = (modo: ModoTema, esquema: string | null | undefined): boolean =>
  modo === 'sistema' ? esquema !== 'light' : modo === 'noche'

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const esquema = useColorScheme()
  const [modo, setModoEstado] = useState<ModoTema>('sistema')

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => setModoEstado(leerModo(saved)))
      .catch(() => {})
  }, [])

  const setModo = useCallback((m: ModoTema) => {
    setModoEstado(m)
    AsyncStorage.setItem(THEME_KEY, m).catch(() => {})
  }, [])

  const isDark = esNoche(modo, esquema)
  const setOscuro = useCallback((oscuro: boolean) => setModo(oscuro ? 'noche' : 'dia'), [setModo])
  const toggleTheme = useCallback(() => setOscuro(!isDark), [isDark, setOscuro])

  const colors = isDark ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ colors, isDark, modo, setModo, toggleTheme, setOscuro }}>
      {children}
    </ThemeContext.Provider>
  )
}
