import { z } from 'zod'

import { MENSAJES } from '@utils/mensajes'

/*
 * ESQUEMAS DE LOS FORMULARIOS (estándar 32). Una pantalla no valida a mano:
 * pasa sus datos por el esquema y pinta los errores por campo que devuelve
 * `validar`. Los textos salen del catálogo de mensajes.
 */

const texto = (campo: string, max: number) =>
  z
    .string({ required_error: MENSAJES.requerido(campo) })
    .trim()
    .min(1, MENSAJES.requerido(campo))
    .max(max, MENSAJES.textoLargo(max))

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, MENSAJES.textoLargo(max))
    .optional()
    .transform((v) => (v ? v : undefined))

export const esquemaEntrar = z.object({
  email: z.string().trim().min(1, MENSAJES.requerido('El correo')).email(MENSAJES.correoInvalido),
  password: z.string().min(1, MENSAJES.requerido('La contraseña')).min(6, MENSAJES.claveCorta),
})

export const esquemaRegistro = z
  .object({
    name: texto('El nombre', 80),
    email: z.string().trim().min(1, MENSAJES.requerido('El correo')).email(MENSAJES.correoInvalido),
    password: z
      .string()
      .min(8, MENSAJES.claveDebil)
      .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, MENSAJES.claveDebil)
      .regex(/\d/, MENSAJES.claveDebil),
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: MENSAJES.claveNoCoincide })

export const esquemaDeseo = z.object({
  titulo: texto('El título', 300),
  autor: opcional(200),
  isbn: opcional(20),
  nota: opcional(1000),
})

const anioMax = new Date().getFullYear() + 1

export const esquemaDatosLibro = z.object({
  titulo: texto('El título', 300),
  autores: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(/[;,]/)
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  anio: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? '').trim()
      if (!t) return null
      const n = Number(t)
      if (!Number.isInteger(n) || n < 1 || n > anioMax) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJES.anioInvalido })
        return z.NEVER
      }
      return n
    }),
  editorial: opcional(200).transform((v) => v ?? null),
  sinopsis: opcional(5000).transform((v) => v ?? null),
  generos: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    ),
  etiquetas: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((a) => a.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
})

export const esquemaComentario = z.object({ texto: texto('El comentario', 4000) })

export const esquemaNota = z.object({ nota: texto('La nota', 4000) })

export const esquemaEstante = z.object({ nombre: texto('El nombre del estante', 80) })

export type Errores<T> = Partial<Record<keyof T & string, string>>

export type Validacion<S extends z.ZodTypeAny> =
  | { ok: true; datos: z.output<S>; errores: Record<string, never> }
  | { ok: false; datos: null; errores: Errores<z.input<S>> }

/** Pasa los datos por el esquema y devuelve los datos limpios o el primer error de cada campo. */
export function validar<S extends z.ZodTypeAny>(esquema: S, datos: unknown): Validacion<S> {
  const r = esquema.safeParse(datos)
  if (r.success) return { ok: true, datos: r.data, errores: {} }
  const errores: Record<string, string> = {}
  for (const i of r.error.issues) {
    const campo = String(i.path[0] ?? '_')
    if (!errores[campo]) errores[campo] = i.message
  }
  return { ok: false, datos: null, errores: errores as Errores<z.input<S>> }
}
