import { motor } from '@contextos/VozContext'
import { capituloDeFrase } from '@logica/tiempos'
import { urlPortada } from '@servicios/archivos'
import type { EjemplarDetalleDTO, ProgresoDTO } from '@tipos'
import { vecinoConVoz } from '@utils/motorAudio'

const TILDES: Record<string, string> = { Alvaro: 'Álvaro', Salome: 'Salomé', Tomas: 'Tomás', Ramon: 'Ramón' }

/** "edge.es-ES-AlvaroNeural" → "Álvaro" (para "Preparando la voz de Álvaro…"). */
export function nombreDeVoz(vozId: string): string {
  const m = /-([A-Za-z]+?)(?:Multilingual)?Neural$/.exec(vozId)
  const n = m?.[1] ?? vozId.split(/[.-]/).pop() ?? vozId
  return TILDES[n] ?? n
}

/** Desde dónde empieza (o retoma) la voz un libro. */
export interface InicioDeEscucha {
  capitulo: number
  posicion: number
  fraseId: string | null
  vozId: string
}

/**
 * Desde dónde sonará el libro: la posición de audio si lo último fue la voz, la
 * frase en la que ibas leyendo o, sin progreso (o con él en un capítulo que no se
 * oye), el PRIMER capítulo con voz, no la dedicatoria apartada (V-NUEVO-6). El
 * reproductor lo enseña antes de empezar.
 */
export function inicioDeEscucha(
  libro: EjemplarDetalleDTO,
  o: { vozId: string; desdeFrase?: string | null; progreso?: ProgresoDTO | null },
): InicioDeEscucha {
  const p = o.progreso ?? libro.progreso
  const caps = libro.capitulos ?? []
  const primero = caps.length ? vecinoConVoz(caps, caps[0].indice - 1, 1) : -1
  let capitulo = p ? (p.capitulo ?? 0) : Math.max(0, primero)
  let posicion = 0
  let fraseId: string | null = o.desdeFrase ?? null
  const vozId = o.vozId || p?.vozId || o.vozId
  if (fraseId) capitulo = Math.max(0, capituloDeFrase(fraseId))
  else if (p?.modo === 'VOZ' && p.posicionAudioSeg != null && (p.vozId ?? vozId) === vozId)
    posicion = p.posicionAudioSeg
  else if (p?.fraseId) {
    fraseId = p.fraseId
    capitulo = Math.max(0, capituloDeFrase(p.fraseId))
  }
  // Lo guardado cae en un capítulo que no se oye (apartado de la voz o sin palabras): se empieza en el siguiente
  // con voz. Elegido a mano (desdeFrase), sí suena.
  const c = caps.find((x) => x.indice === capitulo)
  if (!o.desdeFrase && c && (c.enVoz === false || (c.minutosVoz ?? c.minutos) === 0)) {
    const sig = vecinoConVoz(caps, capitulo, 1)
    if (sig >= 0) return { capitulo: sig, posicion: 0, fraseId: null, vozId }
  }
  return { capitulo, posicion, fraseId, vozId }
}

/**
 * Empieza a escuchar un libro. Llamar DENTRO del toque del usuario (iOS).
 * Retoma desde el progreso del servidor (ver inicioDeEscucha).
 */
export function escucharLibro(
  libro: EjemplarDetalleDTO,
  o: { vozId: string; velocidad: number; desdeFrase?: string | null; progreso?: ProgresoDTO | null },
) {
  const p = o.progreso ?? libro.progreso
  const { capitulo, posicion, fraseId, vozId } = inicioDeEscucha(libro, o)
  motor.abrir(
    {
      ejemplarId: libro.id,
      titulo: libro.titulo,
      autores: libro.autores,
      portadaUrl:
        libro.tienePortada && libro.archivoId
          ? new URL(urlPortada(libro.archivoId), globalThis.location?.href ?? 'http://localhost/').href
          : null,
      capitulos: libro.capitulos,
    },
    {
      capitulo,
      posicion,
      fraseId,
      vozId,
      nombreVoz: nombreDeVoz(vozId),
      velocidad: p?.velocidad && !o.desdeFrase ? p.velocidad : o.velocidad,
    },
  )
}
