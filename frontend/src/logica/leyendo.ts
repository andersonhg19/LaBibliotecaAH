import { esSoloRegistro, nombreEstado } from '@logica/formato'
import { librosService, preparacionService } from '@servicios/bibliotecaService'
import type { EjemplarDTO, EstadoLectura, RegistroLibroDTO } from '@tipos'
import { type ProgresoSinConexion, guardarSinConexion, sincronizarSinConexion } from '@utils/sinConexion'

/*
 * 0.5.0 · «LEYENDO» MANDA (contrato C10) y LIBROS «SOLO REGISTRO» (C11).
 *
 * Regla de Anderson: un libro en «Leyendo» tiene toda su voz preparada en el
 * servidor y guardada en el dispositivo; al sacarlo de «Leyendo» se borra la
 * copia del DISPOSITIVO (la del servidor se queda). Nada de esto bloquea ni
 * enseña esperas: se pide en segundo plano y, si falla, se reintenta en la
 * siguiente sincronización (al abrir la app o al cambiar un estado).
 */

export { esSoloRegistro }

/** ¿Este libro puede tener voz preparada y copia sin conexión? */
export const tieneVoz = (l: Pick<EjemplarDTO, 'sinArchivo' | 'tipo'>): boolean =>
  l.tipo === 'LIBRO' && !esSoloRegistro(l)

/** Las tres salidas de «Leyendo» (C10.4), en el orden de la hoja. */
export interface OpcionQuitar {
  estado: Exclude<EstadoLectura, 'LEYENDO'>
  titulo: string
  detalle: string
  icono: string
}
export const OPCIONES_QUITAR: readonly OpcionQuitar[] = [
  {
    estado: 'POR_LEER',
    titulo: 'Lo dejo para después',
    detalle: 'Vuelve a «Por leer»; cuando lo retomes, sigue donde ibas.',
    icono: 'bookmark',
  },
  {
    estado: 'ABANDONADO',
    titulo: 'Lo abandoné',
    detalle: 'Pasa a «Abandonado». Siempre puedes darle otra oportunidad.',
    icono: 'close',
  },
  { estado: 'LEIDO', titulo: 'Ya lo terminé', detalle: 'Pasa a «Leído», a tu lista de lecturas.', icono: 'check' },
]

/** «Leído», «Por leer»… en minúscula para ir dentro de una frase («pasó a leído»). */
export const estadoEnFrase = (e: EstadoLectura): string => nombreEstado(e).toLowerCase()

/** Texto corto de la copia sin conexión para la tarjeta o la ficha; null = no se enseña nada. */
export function textoSinConexion(p: ProgresoSinConexion | null | undefined): string | null {
  if (!p) return null
  if (p.estado === 'completo') return 'Sin conexión ✓'
  if (p.estado === 'descargando') return p.total > 0 ? `Guardando ${p.guardados}/${p.total}` : 'Guardando…'
  return null
}

/** Lo mismo, dicho entero para el lector de pantalla. */
export function etiquetaSinConexion(p: ProgresoSinConexion | null | undefined): string | null {
  if (!p) return null
  if (p.estado === 'completo') return 'Disponible para escuchar sin conexión'
  if (p.estado === 'descargando')
    return p.total > 0
      ? `Guardando para escuchar sin conexión: ${p.guardados} de ${p.total} capítulos`
      : 'Guardando para escuchar sin conexión'
  return null
}

/** «850 KB», «12,4 MB», «1,2 GB». */
export function tamanoLegible(bytes: number | null | undefined): string {
  const b = Math.max(0, bytes ?? 0)
  const coma = (n: number) => n.toFixed(1).replace('.', ',').replace(/,0$/, '')
  if (b < 1048576) return `${Math.max(b > 0 ? 1 : 0, Math.round(b / 1024))} KB`
  if (b < 1073741824) return `${coma(b / 1048576)} MB`
  return `${coma(b / 1073741824)} GB`
}

/** El capítulo desde el que preparar la voz: el del progreso del usuario (0 si no hay). */
export const capituloDeProgreso = (p?: { capitulo?: number | null } | null): number =>
  Math.max(0, Math.floor(Number(p?.capitulo ?? 0) || 0))

/** Lanza algo en segundo plano: no se espera, no lanza, y si falla solo lo dice en la consola. */
function segundoPlano(que: string, f: () => unknown): void {
  Promise.resolve()
    .then(f)
    .catch((e) => console.warn(`[leyendo] ${que}`, e))
}

/**
 * Un libro ENTRA en «Leyendo» (a mano, al deshacer o al empezar a escuchar):
 * se pide al taller su voz entera empezando por donde vas (C10.2/C10.3) y se
 * empieza la copia del dispositivo (C12). Sin esperar a nada.
 */
export function alEntrarEnLeyendo(
  libro: Pick<EjemplarDTO, 'id' | 'sinArchivo' | 'tipo'>,
  vozId: string | null | undefined,
  desdeCapitulo?: number,
): void {
  if (!tieneVoz(libro)) return
  if (vozId) segundoPlano('preparar', () => preparacionService.preparar(libro.id, vozId, desdeCapitulo))
  segundoPlano('guardar sin conexión', () => guardarSinConexion(libro.id))
}

/** Tope de libros en «Leyendo» que se piden para sincronizar (de sobra para una persona). */
const TOPE_LEYENDO = 200

/** De una lista de «Leyendo», los que llevan copia en el dispositivo. */
export const conCopia = (leyendo: readonly EjemplarDTO[]): EjemplarDTO[] => leyendo.filter(tieneVoz)

/**
 * Ajusta las copias del dispositivo a la lista de «Leyendo» (C10.3): baja lo que
 * falte y borra lo que ya no está. Con `leyendo` se usa esa lista (debe ser
 * COMPLETA: lo que no esté se borra); sin ella se pide al servidor. Si el
 * servidor no contesta bien, NO se sincroniza (una lista vacía por un fallo
 * de red borraría todas las copias).
 */
export function sincronizarLeyendo(leyendo?: readonly EjemplarDTO[]): void {
  segundoPlano('sincronizar', async () => {
    let lista = leyendo
    if (!lista) {
      const r = await librosService.todos({ pestana: 'LEYENDO', orden: 'ULTIMO_ABIERTO', page: 0, size: TOPE_LEYENDO })
      if (!r?.correct || !r.object) return
      lista = r.object.list
    }
    await sincronizarSinConexion(conCopia(lista).map((l) => ({ id: l.id })))
  })
}

/*
 * C11 · «APUNTAR UN LIBRO QUE YA LEÍ»: el formulario y su validación (pura).
 */
export interface CamposRegistro {
  titulo: string
  autores: string
  estado: EstadoLectura
  /** Como lo escribe la persona: «20/11/2026» o «2026-11-20»; vacío = no se sabe. */
  fechaFin: string
  calificacion: number | null
  nota: string
}

export const REGISTRO_INICIAL: CamposRegistro = {
  titulo: '',
  autores: '',
  estado: 'LEIDO',
  fechaFin: '',
  calificacion: null,
  nota: '',
}

/** Los estados con los que se puede apuntar (C11): por defecto Leído. */
export const ESTADOS_REGISTRO: readonly EstadoLectura[] = ['LEIDO', 'POR_LEER', 'ABANDONADO']

/**
 * Lee una fecha escrita a mano. Devuelve el instante ISO (el día a las 00:00 UTC, como lo pide el
 * contrato C11: así «hoy» nunca es «futuro» para el servidor), null si está vacía, o un error.
 */
export function leerFecha(texto: string, hoy: Date = new Date()): { iso: string | null } | { error: string } {
  const t = texto.trim()
  if (!t) return { iso: null }
  let d: number, m: number, a: number
  const dma = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  const amd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (dma) [d, m, a] = [Number(dma[1]), Number(dma[2]), Number(dma[3])]
  else if (amd) [a, m, d] = [Number(amd[1]), Number(amd[2]), Number(amd[3])]
  else return { error: 'Escribe la fecha como 20/11/2026.' }
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d)
    return { error: 'Esa fecha no existe.' }
  if (a < 1900) return { error: 'La fecha es demasiado antigua.' }
  const finDeHoy = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)
  if (f.getTime() > finDeHoy) return { error: 'La fecha no puede ser futura.' }
  return { iso: f.toISOString().replace('.000Z', 'Z') }
}

/** Los autores separados por comas o «y», sin vacíos ni repetidos. */
export const leerAutores = (texto: string): string[] =>
  Array.from(
    new Set(
      texto
        .split(/,|;|\s+y\s+/)
        .map((x) => x.trim().replace(/\s+/g, ' '))
        .filter(Boolean),
    ),
  )

export type ErroresRegistro = Partial<Record<keyof CamposRegistro, string>>

/** Valida el formulario y lo convierte en el cuerpo de `POST /v1/libros/registro`. */
export function validarRegistro(
  c: CamposRegistro,
  hoy: Date = new Date(),
): { ok: true; datos: RegistroLibroDTO; errores: ErroresRegistro } | { ok: false; errores: ErroresRegistro } {
  const errores: ErroresRegistro = {}
  const titulo = c.titulo.trim().replace(/\s+/g, ' ')
  if (!titulo) errores.titulo = 'El título es obligatorio'
  else if (titulo.length > 500) errores.titulo = 'El título no puede pasar de 500 caracteres'
  const autores = leerAutores(c.autores)
  if (autores.length > 20) errores.autores = 'Como mucho 20 autores'
  else if (autores.some((a) => a.length > 300)) errores.autores = 'Un autor no puede pasar de 300 caracteres'
  const nota = c.nota.trim()
  if (nota.length > 2000) errores.nota = 'La nota no puede pasar de 2000 caracteres'
  /* La fecha de fin solo vale para un libro leído (C11: el servidor la rechaza en otro estado). */
  const conFecha = c.estado === 'LEIDO'
  const fecha = conFecha ? leerFecha(c.fechaFin, hoy) : { iso: null }
  if ('error' in fecha) errores.fechaFin = fecha.error
  if (Object.keys(errores).length || 'error' in fecha) return { ok: false, errores }
  return {
    ok: true,
    errores,
    datos: {
      titulo,
      autores,
      estado: c.estado,
      fechaFin: fecha.iso,
      calificacion: c.calificacion,
      nota: nota || null,
    },
  }
}
