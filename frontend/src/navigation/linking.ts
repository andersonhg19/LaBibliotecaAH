import { Platform } from 'react-native'

import { LinkingOptions, NavigationProp, ParamListBase, getPathFromState as porDefecto } from '@react-navigation/native'

/*
 * RUTAS LEGIBLES EN LA WEB (heredado de Oh Churus): cada sala tiene su URL,
 * el botón atrás del navegador vuelve a la anterior y recargar te deja donde
 * estabas. /libro/ej-123, /leer/ej-123, /escuchar/ej-123…
 */
export type Rutas = {
  Entrar: undefined
  Registro: undefined
  Biblioteca: undefined
  Libro: { id: string }
  Leer: { id: string; frase?: string; cfi?: string }
  Escuchar: { id: string }
  Documentos: undefined
  Notas: undefined
  Ajustes: undefined
  AdminUsers: undefined
  AdminRoles: undefined
  AdminModules: undefined
  AdminAudit: undefined
}

export const RUTAS: LinkingOptions<Rutas>['config'] = {
  initialRouteName: 'Biblioteca',
  screens: {
    Entrar: 'entrar',
    Registro: 'registro',
    Biblioteca: 'biblioteca',
    Libro: 'libro/:id',
    Leer: 'leer/:id',
    Escuchar: 'escuchar/:id',
    Documentos: 'documentos',
    Notas: 'notas',
    Ajustes: 'ajustes',
    AdminUsers: 'ajustes/admin/usuarios',
    AdminRoles: 'ajustes/admin/roles',
    AdminModules: 'ajustes/admin/modulos',
    AdminAudit: 'ajustes/admin/auditoria',
  },
}

type Estado = { routes?: { params?: Record<string, unknown>; state?: Estado }[] }

const esPrimitivo = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)

/** Quita de un estado de navegación los parámetros que no caben en una URL. */
export const sinParametrosObjeto = <T extends Estado>(state: T): T => {
  if (!state || !Array.isArray(state.routes)) return state
  return {
    ...state,
    routes: state.routes.map((r) => {
      const params = r.params
        ? Object.fromEntries(Object.entries(r.params).filter(([, v]) => v !== undefined && esPrimitivo(v)))
        : undefined
      return {
        ...r,
        params: params && Object.keys(params).length > 0 ? params : undefined,
        state: r.state ? sinParametrosObjeto(r.state) : r.state,
      }
    }),
  }
}

export const linking: LinkingOptions<Rutas> = {
  enabled: Platform.OS === 'web',
  prefixes: [],
  config: RUTAS,
  getPathFromState: (state, options) => porDefecto(sinParametrosObjeto(state as Estado) as typeof state, options),
}

type Nav = Pick<NavigationProp<ParamListBase>, 'navigate' | 'canGoBack' | 'goBack'>

/** Volver a la biblioteca desde cualquier sala. */
export const irAlInicio = (navigation: Nav | undefined | null) => {
  if (!navigation) return
  try {
    navigation.navigate('Biblioteca')
  } catch (e) {
    console.error('[irAlInicio] no se pudo volver a la biblioteca', e)
  }
}

/** Volver: a la sala anterior si la hay; si se entró directo por la URL, a la biblioteca. */
export const volverOInicio = (navigation: Nav | undefined | null) => {
  if (navigation?.canGoBack?.()) navigation.goBack()
  else irAlInicio(navigation)
}
