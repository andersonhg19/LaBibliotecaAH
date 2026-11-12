import { z } from 'zod'

/*
 * VARIABLES DE ENTORNO, VALIDADAS AL ARRANCAR (estándar 31, estilo t3-env).
 *
 * Expo incrusta las EXPO_PUBLIC_* al construir; por eso se leen una a una por
 * su nombre literal (process.env[nombre] no se sustituye). Si una viene mal
 * formada, la app falla AL ARRANCAR con un mensaje claro, no en la primera
 * petición con un "Network Error" que no dice nada.
 *
 *   EXPO_PUBLIC_API_URL  URL del gateway (en casa: https://casa.tail60fcb5.ts.net:7051). Por defecto el
 *                        gateway de QA (9920): en casa el 8920 es PRODUCCION y una prueba local no debe tocarlo.
 *   EXPO_PUBLIC_MOCK     "1" = modo demostración sin backend (libros de ejemplo en public/demo)
 */
const esquema = z.object({
  EXPO_PUBLIC_API_URL: z
    .string()
    .regex(/^https?:\/\/[^\s/]+/, 'EXPO_PUBLIC_API_URL debe ser una URL completa, p. ej. http://localhost:9920')
    .default('http://localhost:9920')
    .transform((u) => u.replace(/\/+$/, '')),
  EXPO_PUBLIC_MOCK: z
    .enum(['0', '1', 'true', 'false', ''])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
})

export type Entorno = z.infer<typeof esquema>

/** Valida un conjunto de variables (exportado para las pruebas). */
export function validarEntorno(crudo: Record<string, string | undefined>): Entorno {
  const limpio = Object.fromEntries(Object.entries(crudo).filter(([, v]) => v !== undefined && v !== ''))
  const r = esquema.safeParse(limpio)
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Configuración inválida de La Biblioteca: ${detalle}`)
  }
  return r.data
}

export const entorno: Entorno = validarEntorno({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_MOCK: process.env.EXPO_PUBLIC_MOCK,
})
