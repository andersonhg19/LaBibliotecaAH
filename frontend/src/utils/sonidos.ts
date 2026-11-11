/*
 * SONIDOS DE LA BIBLIOTECA, sintetizados (plan §10.4).
 *
 * Nada de archivos de audio: el roce del papel y la madera son ruido filtrado
 * con una envolvente, generado al vuelo con WebAudio. Pesa cero bytes y no
 * tiene derechos de nadie.
 *
 * Importante para el iPhone: estos sonidos van por un AudioContext propio y
 * NUNCA por el <audio> de la voz (ver utils/motorAudio): mezclar ambos haría
 * que iOS dejara de reproducir la voz con la pantalla bloqueada.
 */

let activo = true
let ctx: AudioContext | null = null

export const activarSonidos = (si: boolean) => {
  activo = si
}
export const sonidosActivos = () => activo

const contexto = (): AudioContext | null => {
  if (!activo) return null
  try {
    const w =
      typeof window !== 'undefined'
        ? (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        : undefined
    const AC: typeof AudioContext | undefined = w ? w.AudioContext || w.webkitAudioContext : undefined
    if (!AC) return null
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

/** Un golpe de ruido filtrado: la base de todos los sonidos de papel y madera. */
function ruido(opc: {
  duracion: number
  frecuencia: number
  q?: number
  tipo?: BiquadFilterType
  volumen?: number
  ataque?: number
  barrido?: number
}) {
  const c = contexto()
  if (!c) return
  try {
    const { duracion, frecuencia, q = 0.8, tipo = 'bandpass', volumen = 0.25, ataque = 0.01, barrido } = opc
    const n = Math.max(1, Math.floor(c.sampleRate * duracion))
    const buf = c.createBuffer(1, n, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 1.5
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = tipo
    f.frequency.value = frecuencia
    f.Q.value = q
    if (barrido) f.frequency.exponentialRampToValueAtTime(barrido, c.currentTime + duracion)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, c.currentTime)
    g.gain.exponentialRampToValueAtTime(volumen, c.currentTime + ataque)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duracion)
    src.connect(f).connect(g).connect(c.destination)
    src.start()
    src.stop(c.currentTime + duracion + 0.02)
  } catch {
    // Un sonido que falla no puede romper nada.
  }
}

/** Pasar la página: un "fsss" de papel que sube de tono. */
export const pasarPagina = () =>
  ruido({ duracion: 0.28, frecuencia: 1800, barrido: 5200, q: 0.6, volumen: 0.14, ataque: 0.04 })

/** Sacar un libro del estante: roce de madera, grave y largo. */
export const roceMadera = () =>
  ruido({ duracion: 0.45, frecuencia: 420, barrido: 900, q: 1.2, volumen: 0.2, ataque: 0.08 })

/** Soltar un libro en su sitio: golpe sordo de madera. */
export function golpeMadera() {
  ruido({ duracion: 0.12, frecuencia: 180, tipo: 'lowpass', q: 4, volumen: 0.5, ataque: 0.004 })
  ruido({ duracion: 0.08, frecuencia: 900, q: 3, volumen: 0.08, ataque: 0.002 })
}

/** Abrir la tapa: cuero que cede y una bocanada de papel. */
export function abrirTapa() {
  ruido({ duracion: 0.35, frecuencia: 260, barrido: 140, q: 2, volumen: 0.18, ataque: 0.03 })
  setTimeout(() => ruido({ duracion: 0.3, frecuencia: 2500, barrido: 4000, q: 0.5, volumen: 0.07, ataque: 0.05 }), 120)
}
