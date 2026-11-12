import React, { useState } from 'react'

import { View } from 'react-native'

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { NativeStackScreenProps, createNativeStackNavigator } from '@react-navigation/native-stack'

import Spinner from '@componentes/atoms/Spinner'
import ErrorBoundary from '@componentes/organisms/ErrorBoundary'
import MiniReproductor from '@componentes/reproductor/MiniReproductor'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { Rutas, irAlInicio, linking } from '@navegacion/linking'
import AdminAuditScreen from '@pantallas/admin/AdminAuditScreen'
import AdminModulesScreen from '@pantallas/admin/AdminModulesScreen'
import AdminRolesScreen from '@pantallas/admin/AdminRolesScreen'
import AdminUsersScreen from '@pantallas/admin/AdminUsersScreen'
import AjustesScreen from '@pantallas/ajustes/AjustesScreen'
import LoginScreen from '@pantallas/auth/LoginScreen'
import RegisterScreen from '@pantallas/auth/RegisterScreen'
import BibliotecaScreen from '@pantallas/biblioteca/BibliotecaScreen'
import DocumentosScreen from '@pantallas/biblioteca/DocumentosScreen'
import HojaScreen from '@pantallas/hoja/HojaScreen'
import LectorScreen from '@pantallas/lector/LectorScreen'
import LibroScreen from '@pantallas/libro/LibroScreen'
import NotasScreen from '@pantallas/notas/NotasScreen'
import ReproductorScreen from '@pantallas/reproductor/ReproductorScreen'
import { fuentes } from '@tema'
import { web } from '@tema/web'

/*
 * Cada pantalla va dentro de su propio límite de errores: si una falla al
 * pintarse, sale una tarjeta con "Volver" y "Reintentar" en esa sala, en vez de
 * dejar la biblioteca en blanco. El envoltorio se crea UNA vez por pantalla.
 */
type PantallaProps = NativeStackScreenProps<Rutas>
/* eslint-disable @typescript-eslint/no-explicit-any -- cada pantalla tipa su propia ruta; aquí se registran todas juntas */
type CualquierPantalla = React.ComponentType<any>
/* eslint-enable @typescript-eslint/no-explicit-any */
const envueltas = new WeakMap<CualquierPantalla, CualquierPantalla>()
const pantalla = (c: CualquierPantalla): CualquierPantalla => {
  const ya = envueltas.get(c)
  if (ya) return ya
  const Pantalla = c
  const nombre = Pantalla.displayName || Pantalla.name || 'Pantalla'
  const Envuelta: React.FC<PantallaProps> = (props) => (
    <ErrorBoundary nombre={nombre} onVolverAlInicio={() => irAlInicio(props.navigation)}>
      <Pantalla {...props} />
    </ErrorBoundary>
  )
  Envuelta.displayName = `ConLimite(${nombre})`
  envueltas.set(c, Envuelta)
  return Envuelta
}

const Pila = createNativeStackNavigator<Rutas>()
export const navegacion = createNavigationContainerRef<Rutas>()

const TITULOS: Partial<Record<keyof Rutas, string>> = {
  Entrar: 'Entrar',
  Registro: 'Registro',
  Biblioteca: 'Mi biblioteca',
  Libro: 'Ficha del libro',
  Leer: 'Leyendo',
  Escuchar: 'Escuchando',
  Hoja: 'Hoja de cálculo',
  Documentos: 'Mis documentos',
  Notas: 'Mis notas',
  Ajustes: 'Ajustes',
  AdminUsers: 'Usuarios',
  AdminRoles: 'Roles',
  AdminModules: 'Módulos y permisos',
  AdminAudit: 'Auditoría',
}

/** Salas en las que no se pinta el mini reproductor (tienen sus propios controles). */
const SIN_MINI = new Set<string>(['Escuchar', 'Hoja', 'Entrar', 'Registro'])

const AppNavigator: React.FC = () => {
  const { colors, isDark } = useTheme()
  const { isAuthenticated, loading } = useAuth()
  const [ruta, setRuta] = useState<string | undefined>(undefined)

  if (loading) return <Spinner fullScreen />

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NavigationContainer
        ref={navegacion}
        linking={linking}
        onReady={() => setRuta(navegacion.getCurrentRoute()?.name)}
        onStateChange={() => setRuta(navegacion.getCurrentRoute()?.name)}
        documentTitle={{
          formatter: (_o, r) => `${(r?.name && TITULOS[r.name as keyof Rutas]) || 'La Biblioteca'} · La Biblioteca AH`,
        }}
        fallback={<Spinner fullScreen />}
        theme={{
          dark: isDark,
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.danger,
          },
          fonts: {
            regular: { fontFamily: fuentes.ui, fontWeight: '400' },
            medium: { fontFamily: fuentes.uiMedia, fontWeight: '500' },
            bold: { fontFamily: fuentes.uiNegrita, fontWeight: '700' },
            heavy: { fontFamily: fuentes.uiNegrita, fontWeight: '800' },
          },
        }}
      >
        <Pila.Navigator
          screenOptions={{
            headerShown: false,
            // En el iPhone (app instalada, viewport-fit=cover) la pantalla empieza bajo la hora y la muesca:
            // cada sala baja lo que ocupa la barra de estado. El lector lo maneja él mismo (barra a sangre).
            contentStyle: [{ backgroundColor: colors.background }, web({ paddingTop: 'env(safe-area-inset-top)' })],
            animation: 'fade',
          }}
        >
          {isAuthenticated ? (
            <>
              <Pila.Screen name="Biblioteca" component={pantalla(BibliotecaScreen)} />
              <Pila.Screen name="Libro" component={pantalla(LibroScreen)} />
              <Pila.Screen
                name="Leer"
                component={pantalla(LectorScreen)}
                options={{ contentStyle: { backgroundColor: colors.background } }}
              />
              <Pila.Screen name="Escuchar" component={pantalla(ReproductorScreen)} />
              <Pila.Screen name="Hoja" component={pantalla(HojaScreen)} />
              <Pila.Screen name="Documentos" component={pantalla(DocumentosScreen)} />
              <Pila.Screen name="Notas" component={pantalla(NotasScreen)} />
              <Pila.Screen name="Ajustes" component={pantalla(AjustesScreen)} />
              {/* La administración vive dentro de la casa (UX-14): cada pantalla pinta su
                  Sala y su Encabezado (atrás de 44 px), no la cabecera genérica. */}
              <Pila.Group>
                <Pila.Screen name="AdminUsers" component={pantalla(AdminUsersScreen)} options={{ title: 'Usuarios' }} />
                <Pila.Screen name="AdminRoles" component={pantalla(AdminRolesScreen)} options={{ title: 'Roles' }} />
                <Pila.Screen
                  name="AdminModules"
                  component={pantalla(AdminModulesScreen)}
                  options={{ title: 'Módulos y permisos' }}
                />
                <Pila.Screen
                  name="AdminAudit"
                  component={pantalla(AdminAuditScreen)}
                  options={{ title: 'Auditoría' }}
                />
              </Pila.Group>
            </>
          ) : (
            <>
              <Pila.Screen name="Entrar" component={pantalla(LoginScreen)} />
              <Pila.Screen name="Registro" component={pantalla(RegisterScreen)} />
            </>
          )}
        </Pila.Navigator>
      </NavigationContainer>
      {isAuthenticated && !SIN_MINI.has(ruta ?? '') ? (
        <MiniReproductor onAbrir={(id) => navegacion.isReady() && navegacion.navigate('Escuchar', { id })} />
      ) : null}
    </View>
  )
}

export default AppNavigator
