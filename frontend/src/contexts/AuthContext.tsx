import React, { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { TOKEN_KEY, fijarTokenEnMemoria, registrarCierreDeSesion } from '@servicios/api'
import { authService } from '@servicios/authService'

const USER_KEY = '@biblioteca_ah_usuario'

export interface UserInfo {
  userId: string
  name: string
  email: string
  /**
   * Los roles firmados en el token. Sirven PARA PINTAR, nunca para decidir:
   * quien decide es el servidor, que los lee del token. Ausente = ninguno.
   */
  roles?: string[]
}

interface AuthContextType {
  user: UserInfo | null
  token: string | null
  loading: boolean
  isAuthenticated: boolean
  esAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (updates: Partial<UserInfo>) => Promise<void>
  avisoDeSesion?: string | null
  limpiarAvisoDeSesion?: () => void
}

export const AVISO_SESION_EXPIRADA = 'Tu sesión expiró. Vuelve a entrar para seguir leyendo.'

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  isAuthenticated: false,
  esAdmin: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  updateUser: async () => {},
  avisoDeSesion: null,
  limpiarAvisoDeSesion: () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [avisoDeSesion, setAvisoDeSesion] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  const fijarToken = useCallback((t: string | null) => {
    tokenRef.current = t
    fijarTokenEnMemoria(t)
    setToken(t)
  }, [])

  /* Restaurar la sesión guardada: abrir la biblioteca no debe pedir contraseña cada vez. */
  useEffect(() => {
    const cargar = async () => {
      try {
        const [guardado, usuario] = await Promise.all([AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(USER_KEY)])
        if (guardado && usuario) {
          const parsed = JSON.parse(usuario)
          fijarToken(guardado)
          setUser({ roles: [], ...parsed })
          try {
            await authService.getUser(parsed.userId)
          } catch (e) {
            /* Un 401 aquí es que el token ya no vale: se dice, no se entra con todo vacío. */
            if ((e as { response?: { status?: number } } | null)?.response?.status === 401) {
              await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)])
              setAvisoDeSesion(AVISO_SESION_EXPIRADA)
              fijarToken(null)
              setUser(null)
            }
            // Sin red o backend caído: se entra con lo guardado.
          }
        }
      } catch {
        // Almacenamiento ilegible: se pide entrar de nuevo.
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [fijarToken])

  useEffect(() => {
    registrarCierreDeSesion(() => {
      if (!tokenRef.current) return
      AsyncStorage.removeItem(TOKEN_KEY).catch(() => {})
      AsyncStorage.removeItem(USER_KEY).catch(() => {})
      setAvisoDeSesion(AVISO_SESION_EXPIRADA)
      fijarToken(null)
      setUser(null)
    })
    return () => registrarCierreDeSesion(null)
  }, [fijarToken])

  const limpiarAvisoDeSesion = useCallback(() => setAvisoDeSesion(null), [])

  const entrarCon = useCallback(
    async (authData: { token: string; userId: string; name: string; email: string; roles?: string[] }) => {
      const info: UserInfo = {
        userId: String(authData.userId),
        name: authData.name,
        email: authData.email,
        roles: authData.roles ?? [],
      }
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, authData.token),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(info)),
      ])
      setAvisoDeSesion(null)
      fijarToken(authData.token)
      setUser(info)
    },
    [fijarToken],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authService.login(email, password)
      if (!result.correct) throw new Error(result.message)
      await entrarCon(result.object)
    },
    [entrarCon],
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await authService.register({ name, email, password })
      if (!result.correct) throw new Error(result.message)
      await entrarCon(result.object)
    },
    [entrarCon],
  )

  const logout = useCallback(async () => {
    await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)])
    fijarToken(null)
    setUser(null)
  }, [fijarToken])

  const updateUser = useCallback(async (updates: Partial<UserInfo>) => {
    setUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...updates }
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)).catch(() => {})
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        esAdmin: !!user?.roles?.includes('ADMIN'),
        login,
        register,
        logout,
        updateUser,
        avisoDeSesion,
        limpiarAvisoDeSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
