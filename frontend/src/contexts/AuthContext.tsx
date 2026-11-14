import React, { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

import { motor } from '@contextos/VozContext'
import { TOKEN_KEY, fijarTokenEnMemoria, registrarCierreDeSesion } from '@servicios/api'
import { authService } from '@servicios/authService'

const USER_KEY = '@biblioteca_ah_usuario'

export interface UserInfo {
  userId: string
  name: string
  email: string
  /** El nombre de usuario con el que también se entra (puede faltar en sesiones guardadas antes de V3). */
  alias?: string
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
  /** `usuario` es el correo o el alias. */
  login: (usuario: string, password: string) => Promise<void>
  register: (name: string, email: string, alias: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (updates: Partial<UserInfo>) => Promise<void>
  avisoDeSesion?: string | null
  limpiarAvisoDeSesion?: () => void
  /** Guardar un token nuevo devuelto por el servidor (cambio de clave). */
  actualizarToken?: (token: string) => Promise<void>
}

/** Cada cuánto se renueva el token de 24 h. */
export const RENOVAR_CADA_MS = 4 * 60 * 60 * 1000

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
            /* Un 401 aquí es que el token ya no vale: se dice, no se entra con todo vacío. Salvo que auth-service
               acabe de confirmar que la sesión sigue viva (V-NUEVO-2): entonces fue un tropiezo, se entra. */
            const err = e as { response?: { status?: number }; sesionVigente?: boolean } | null
            if (err?.response?.status === 401 && !err.sesionVigente) {
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
      // La voz se calla con la sesión (QA LV-03); el servidor ya no aceptaría el guardado.
      motor.detener({ servidor: false })
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
    async (authData: {
      token: string
      userId: string
      name: string
      email: string
      alias?: string
      roles?: string[]
    }) => {
      const info: UserInfo = {
        userId: String(authData.userId),
        name: authData.name,
        email: authData.email,
        alias: authData.alias,
        roles: authData.roles ?? [],
      }
      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEY, authData.token),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(info)),
      ])
      // Otra cuenta en este navegador nunca hereda la voz de la anterior (QA LV-03).
      if (motor.obtener().libro) motor.detener({ servidor: false })
      setAvisoDeSesion(null)
      fijarToken(authData.token)
      setUser(info)
    },
    [fijarToken],
  )

  const login = useCallback(
    async (usuario: string, password: string) => {
      const result = await authService.login(usuario, password)
      if (!result.correct) throw new Error(result.message)
      await entrarCon(result.object)
    },
    [entrarCon],
  )

  const register = useCallback(
    async (name: string, email: string, alias: string, password: string) => {
      const result = await authService.register({ name, email, alias, password })
      if (!result.correct) {
        /* El código viaja con el error: 403 = registro público cerrado (contrato v1.2). */
        throw Object.assign(new Error(result.message), { codigo: result.errorCode })
      }
      await entrarCon(result.object)
    },
    [entrarCon],
  )

  /*
   * RENOVAR LA SESIÓN (contrato v1.2): el token dura 24 h. Al abrir la app con
   * sesión y cada pocas horas se pide uno nuevo y se guarda. Si el servidor
   * dice 401 («Tu sesión ya no es válida…»), el interceptor de api.ts cierra la
   * sesión (y la voz se calla, ver registrarCierreDeSesion). Sin red: se sigue
   * con el que hay y se reintenta en la próxima vuelta.
   */
  const conSesion = !!token
  useEffect(() => {
    if (!conSesion || loading) return
    let vivo = true
    const renovar = async () => {
      try {
        const r = await authService.renovar()
        if (!vivo || !r.correct || !r.object?.token || !tokenRef.current) return
        await AsyncStorage.setItem(TOKEN_KEY, r.object.token)
        fijarToken(r.object.token)
      } catch (e) {
        console.warn('[sesión] no se pudo renovar el token; se reintenta más tarde', e)
      }
    }
    renovar()
    const t = setInterval(renovar, RENOVAR_CADA_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [conSesion, loading, fijarToken])

  /** Un token nuevo que trae otra respuesta (p. ej. /users/save tras cambiar la clave): el viejo ya no vale. */
  const actualizarToken = useCallback(
    async (nuevo: string) => {
      await AsyncStorage.setItem(TOKEN_KEY, nuevo)
      fijarToken(nuevo)
    },
    [fijarToken],
  )

  const logout = useCallback(async () => {
    // Con el token aún válido: lo último que sonó se guarda en el servidor y la voz se calla.
    motor.detener()
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
        actualizarToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
