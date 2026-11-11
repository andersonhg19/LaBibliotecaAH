import React, { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { ThemeColors, darkColors, lightColors } from '@tema/colors'

const THEME_KEY = '@biblioteca_ah_tema'

/*
 * Dos ambientes: "Biblioteca de noche" (por defecto) y "Sala de lectura de día".
 * Se guarda en el dispositivo: cada uno lee con la luz que tiene.
 */
interface ThemeContextType {
  colors: ThemeColors
  isDark: boolean
  toggleTheme: () => void
  setOscuro: (oscuro: boolean) => void
}

const ThemeContext = createContext<ThemeContextType>({
  colors: darkColors,
  isDark: true,
  toggleTheme: () => {},
  setOscuro: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((saved) => {
        if (saved !== null && saved !== undefined) setIsDark(saved !== 'dia')
      })
      .catch(() => {})
  }, [])

  const setOscuro = useCallback((oscuro: boolean) => {
    setIsDark(oscuro)
    AsyncStorage.setItem(THEME_KEY, oscuro ? 'noche' : 'dia').catch(() => {})
  }, [])

  const toggleTheme = useCallback(() => setOscuro(!isDark), [isDark, setOscuro])

  const colors = isDark ? darkColors : lightColors

  return <ThemeContext.Provider value={{ colors, isDark, toggleTheme, setOscuro }}>{children}</ThemeContext.Provider>
}
