import { entorno } from '@config/entorno'

export const API_URL: string = entorno.EXPO_PUBLIC_API_URL
export const MODO_DEMO: boolean = entorno.EXPO_PUBLIC_MOCK

/** Prefijos del gateway (contratos §9). */
export const AUTH_PREFIJO = '/AUTH-SERVICE/biblioteca/v1'
export const BIBLIOTECA_PREFIJO = '/BIBLIOTECA-SERVICE/biblioteca/v1'

/** Voz por defecto (decisión D3 de Anderson). */
export const VOZ_POR_DEFECTO = 'edge.es-ES-AlvaroNeural'

/** Zona horaria de la casa (estándar 12). */
export const ZONA_HORARIA = 'America/Bogota'
