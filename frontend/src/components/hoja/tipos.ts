import { z } from 'zod'

/*
 * hoja.json (contrato v1.6): lo que el taller saca de una hoja de cálculo
 * (XLSX, XLS, ODS, CSV). El texto de cada celda YA viene formateado (es-CO):
 * el visor no calcula nada, solo pinta. Se valida al cargarlo: un archivo de
 * otra versión o roto da un mensaje claro en vez de una rejilla en blanco.
 */

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

export const esquemaEstilo = z
  .object({
    negrita: z.boolean().optional(),
    cursiva: z.boolean().optional(),
    subrayado: z.boolean().optional(),
    alinear: z.enum(['izquierda', 'centro', 'derecha']).optional(),
    vertical: z.enum(['arriba', 'centro', 'abajo']).optional(),
    fondo: color.optional(),
    color: color.optional(),
    ajustar: z.boolean().optional(),
  })
  .passthrough()

const entero = z.number().int().nonnegative()

/** [fila, columna, texto, tipo, estilo] */
export const esquemaCelda = z.tuple([entero, entero, z.string(), z.enum(['t', 'n', 'f', 'b', 'e']), entero])

export const esquemaHoja = z.object({
  nombre: z.string(),
  filas: entero,
  columnas: entero,
  filasOriginal: entero,
  columnasOriginal: entero,
  recortada: z.boolean(),
  fijas: z.object({ filas: entero, columnas: entero }),
  anchos: z.array(z.number().nonnegative()),
  altos: z.array(z.tuple([entero, z.number().nonnegative()])),
  celdas: z.array(esquemaCelda),
  combinadas: z.array(z.tuple([entero, entero, entero, entero])),
  estilos: z.array(esquemaEstilo),
})

export const esquemaLibroHojas = z.object({
  versionFormato: z.literal(1),
  recortado: z.boolean(),
  hojas: z.array(esquemaHoja).min(1),
})

export type EstiloCelda = z.infer<typeof esquemaEstilo>
export type TipoCelda = z.infer<typeof esquemaCelda>[3]
export type CeldaCruda = z.infer<typeof esquemaCelda>
export type HojaDeCalculo = z.infer<typeof esquemaHoja>
export type LibroDeHojas = z.infer<typeof esquemaLibroHojas>

export const MENSAJE_HOJA_INVALIDA =
  'La hoja de cálculo llegó en un formato que esta versión de la app no entiende. Recarga la página o vuelve a subir el archivo.'

/** Valida el JSON descargado. Devuelve el libro o un mensaje para la persona. */
export function leerLibroDeHojas(datos: unknown): { libro: LibroDeHojas } | { error: string } {
  const r = esquemaLibroHojas.safeParse(datos)
  if (!r.success) {
    console.warn('[hoja] hoja.json no válido', r.error.issues.slice(0, 3))
    return { error: MENSAJE_HOJA_INVALIDA }
  }
  return { libro: r.data }
}
