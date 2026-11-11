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

/** El mismo formato que el backend (auth ValidationUtils.FORMATO_ALIAS): se compara ya recortado y en minúsculas. */
export const FORMATO_ALIAS = /^[a-z0-9._-]{3,30}$/

export const esquemaAlias = z
  .string({ required_error: MENSAJES.requerido('El usuario') })
  .trim()
  .min(1, MENSAJES.requerido('El usuario'))
  .transform((v) => v.toLowerCase())
  .refine((v) => FORMATO_ALIAS.test(v), MENSAJES.aliasInvalido)

/* Se entra con el correo O con el usuario: aquí no se exige formato de correo. */
export const esquemaEntrar = z.object({
  usuario: z.string().trim().min(1, MENSAJES.requerido('El correo o usuario')),
  password: z.string().min(1, MENSAJES.requerido('La contraseña')).min(6, MENSAJES.claveCorta),
})

/* Contrato v1.2: el correo se guarda en minúsculas y la clave pide 10 caracteres (el servidor, además,
   rechaza las triviales con 400 claveDebil: ese mensaje se muestra tal cual). */
const correo = z
  .string()
  .trim()
  .min(1, MENSAJES.requerido('El correo'))
  .email(MENSAJES.correoInvalido)
  .transform((v) => v.toLowerCase())

export const CLAVE_MINIMA = 10

const claveNueva = z
  .string()
  .min(CLAVE_MINIMA, MENSAJES.claveDebil)
  .regex(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/, MENSAJES.claveDebil)
  .regex(/\d/, MENSAJES.claveDebil)

export const esquemaRegistro = z
  .object({
    name: texto('El nombre', 80),
    email: correo,
    alias: esquemaAlias,
    password: claveNueva,
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: MENSAJES.claveNoCoincide })

/** Una cuenta nueva creada desde Administración (el registro público está cerrado). */
export const esquemaCuentaNueva = z.object({
  name: texto('El nombre', 80),
  email: correo,
  alias: esquemaAlias,
  password: claveNueva,
})

export const esquemaDeseo = z.object({
  titulo: texto('El título', 500),
  autor: opcional(300),
  isbn: opcional(20),
  nota: opcional(2000),
})

/** Límites del contrato v1.2 (§9, «Límites de entrada»). */
export const ANIO_MIN = -3000
export const ANIO_MAX = 2100

/** Una lista separada por comas: vacía = null (contrato v1.2: null vacía el campo). */
const lista = (max: number, largo: number, campo: string, quitar?: RegExp) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const l = (v ?? '')
        .split(/[;,]/)
        .map((a) => (quitar ? a.trim().replace(quitar, '') : a.trim()))
        .filter(Boolean)
      if (l.length > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Como mucho ${max} ${campo}.` })
        return z.NEVER
      }
      if (l.some((x) => x.length > largo)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Cada uno, de ${largo} caracteres como mucho.` })
        return z.NEVER
      }
      return l.length ? l : null
    })

export const esquemaDatosLibro = z.object({
  titulo: texto('El título', 500),
  autores: lista(20, 300, 'autores'),
  anio: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? '').trim()
      if (!t) return null
      const n = Number(t)
      if (!Number.isInteger(n) || n < ANIO_MIN || n > ANIO_MAX) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJES.anioInvalido })
        return z.NEVER
      }
      return n
    }),
  editorial: opcional(300).transform((v) => v ?? null),
  sinopsis: opcional(10000).transform((v) => v ?? null),
  generos: lista(20, 100, 'géneros'),
  etiquetas: lista(50, 50, 'etiquetas', /^#/),
})

export const esquemaComentario = z.object({ texto: texto('El comentario', 10000) })

export const esquemaNota = z.object({ nota: texto('La nota', 10000) })

export const esquemaEstante = z.object({ nombre: texto('El nombre del estante', 100) })

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
