import React, { useEffect } from 'react'

import {
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { Literata_400Regular } from '@expo-google-fonts/literata'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'

import Spinner from '@componentes/atoms/Spinner'
import ErrorBoundary from '@componentes/organisms/ErrorBoundary'
import HojaConfirmacion from '@componentes/organisms/HojaConfirmacion'
import { ToastContainer } from '@componentes/organisms/ToastContainer'
import { AuthProvider } from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider, useTheme } from '@contextos/ThemeContext'
import { ToastProvider } from '@contextos/ToastContext'
import AppNavigator from '@navegacion/AppNavigator'
import { ponerEstilosGlobales } from '@tema/estilosGlobales'

const Barra: React.FC = () => {
  const { isDark, colors } = useTheme()
  useEffect(() => ponerEstilosGlobales(colors.background), [colors.background])
  return <StatusBar style={isDark ? 'light' : 'dark'} />
}

export default function App() {
  /* Las fuentes de la casa. Si tardan, se espera un instante; si fallan, se
     sigue con las del sistema (mejor leer en Georgia que no leer). */
  const [cargadas, error] = useFonts({
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Literata_400Regular,
  })

  return (
    <ThemeProvider>
      <ErrorBoundary nombre="App">
        <PreferenciasProvider>
          <AuthProvider>
            <ToastProvider>
              <Barra />
              {cargadas || error ? <AppNavigator /> : <Spinner fullScreen />}
              <ToastContainer />
              <HojaConfirmacion />
            </ToastProvider>
          </AuthProvider>
        </PreferenciasProvider>
      </ErrorBoundary>
    </ThemeProvider>
  )
}
