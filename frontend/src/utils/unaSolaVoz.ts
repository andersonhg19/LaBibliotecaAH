/*
 * UNA SOLA VOZ POR NAVEGADOR (validación web 0.4.0, V-NUEVO-3).
 *
 * Dos pestañas de la misma cuenta (o la PWA y una pestaña de Safari) podían
 * sonar a la vez, cada una con su libro o con el mismo. Ahora, cuando una
 * empieza a sonar, avisa a las demás y esas se pausan: manda la última que se
 * tocó, como en cualquier reproductor de música.
 *
 * Con BroadcastChannel (todos los navegadores actuales). Sin él, por el evento
 * `storage` de localStorage (que solo llega a las OTRAS pestañas).
 */

export const CANAL_VOZ = 'bah-voz'
export const CLAVE_VOZ = 'bah.voz.sonando'

interface Mensaje {
  tipo: 'sonando'
  id: string
  t: number
}

export interface UnaSolaVoz {
  /** Esta pestaña acaba de empezar a sonar: las demás se callan. */
  avisar(): void
  cerrar(): void
}

type ConstructorCanal = new (nombre: string) => {
  postMessage(m: unknown): void
  close(): void
  onmessage: ((e: { data: unknown }) => void) | null
}

interface Entorno {
  BroadcastChannel?: ConstructorCanal
  localStorage?: Pick<Storage, 'setItem'>
  addEventListener?: (t: string, f: (e: StorageEvent) => void) => void
  removeEventListener?: (t: string, f: (e: StorageEvent) => void) => void
}

const esDeOtra = (datos: unknown, id: string): boolean => {
  const m = datos as Partial<Mensaje> | null
  return !!m && m.tipo === 'sonando' && typeof m.id === 'string' && m.id !== id
}

export function unaSolaVoz(alSonarOtra: () => void, entorno: Entorno = globalThis as unknown as Entorno): UnaSolaVoz {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const Canal = entorno.BroadcastChannel
  if (typeof Canal === 'function') {
    let canal: InstanceType<ConstructorCanal> | null = null
    try {
      canal = new Canal(CANAL_VOZ)
      canal.onmessage = (e) => {
        if (esDeOtra(e?.data, id)) alSonarOtra()
      }
    } catch (e) {
      console.warn('[voz] sin aviso entre pestañas', e)
    }
    return {
      avisar: () => {
        try {
          canal?.postMessage({ tipo: 'sonando', id, t: Date.now() } satisfies Mensaje)
        } catch {
          /* pestaña cerrándose */
        }
      },
      cerrar: () => canal?.close(),
    }
  }
  const alGuardar = (e: StorageEvent) => {
    if (e.key !== CLAVE_VOZ || !e.newValue) return
    try {
      if (esDeOtra(JSON.parse(e.newValue), id)) alSonarOtra()
    } catch {
      /* valor ajeno */
    }
  }
  entorno.addEventListener?.('storage', alGuardar)
  return {
    avisar: () => {
      try {
        // `t` cambia siempre: así el evento salta aunque sea la misma pestaña la que vuelve a sonar.
        entorno.localStorage?.setItem(CLAVE_VOZ, JSON.stringify({ tipo: 'sonando', id, t: Date.now() }))
      } catch {
        /* sin almacenamiento: cada pestaña a lo suyo */
      }
    },
    cerrar: () => entorno.removeEventListener?.('storage', alGuardar),
  }
}
