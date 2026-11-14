import AsyncStorage from '@react-native-async-storage/async-storage'

import { esWeb, reducirMovimiento } from '@tema/web'

/*
 * CONFETI DE PAPEL AL TERMINAR UN LIBRO (F5, propuesta #6 de la auditoría UX).
 * Unos 26 recortes de papel, latón, miel y burdeos caen girando desde la tapa
 * (1,4 s, WAAPI, solo transform y opacidad) y se van. UNA vez por libro (se
 * apunta en el dispositivo). Con «Reducir movimiento» no cae nada: la pantalla
 * enseña solo la placa de «Terminado».
 */

export const PIEZAS = 26
const COLORES = ['#F3E9D2', '#C9A227', '#6B1F2A', '#D9A35B', '#FBF7EE']
const DURACION_MS = 1400
const clave = (ejemplarId: string) => `@biblioteca_ah_terminado_${ejemplarId}`

/** ¿Ya se celebró este libro en este dispositivo? */
export async function yaCelebrado(ejemplarId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(clave(ejemplarId))) === '1'
  } catch {
    return false
  }
}

async function marcarCelebrado(ejemplarId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(clave(ejemplarId), '1')
  } catch {
    /* sin almacenamiento: como mucho se celebra dos veces */
  }
}

/** Una pieza: hacia dónde cae (px), cuánto gira y su color. Pura, para probarla. */
export function trayectoria(i: number, azar: () => number = Math.random) {
  const lado = (azar() - 0.5) * 2
  return {
    dx: Math.round(lado * 170),
    sube: Math.round(40 + azar() * 70),
    cae: Math.round(260 + azar() * 260),
    giro: Math.round((azar() - 0.5) * 900),
    color: COLORES[i % COLORES.length],
    ancho: 6 + Math.round(azar() * 5),
    alto: 9 + Math.round(azar() * 7),
    retraso: Math.round(azar() * 160),
  }
}

/**
 * Lanza el confeti desde el elemento `desde` (la tapa) o desde arriba al
 * centro. `primera`: es la primera vez en este dispositivo (se enseña la
 * placa); `confeti`: si de verdad cayó (no sin web ni con reducir movimiento).
 */
export async function celebrarFin(
  ejemplarId: string,
  desde?: unknown,
): Promise<{ primera: boolean; confeti: boolean }> {
  if (await yaCelebrado(ejemplarId)) return { primera: false, confeti: false }
  await marcarCelebrado(ejemplarId)
  if (!esWeb || typeof document === 'undefined' || reducirMovimiento()) return { primera: true, confeti: false }
  const r = (desde as { getBoundingClientRect?: () => DOMRect } | null)?.getBoundingClientRect?.()
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2
  const y = r ? r.top + r.height * 0.3 : window.innerHeight * 0.25
  const capa = document.createElement('div')
  capa.setAttribute('aria-hidden', 'true')
  capa.setAttribute('data-bah', 'confeti')
  Object.assign(capa.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '9999',
    overflow: 'hidden',
  })
  document.body.appendChild(capa)
  const animaciones: Promise<unknown>[] = []
  for (let i = 0; i < PIEZAS; i++) {
    const t = trayectoria(i)
    const p = document.createElement('i')
    Object.assign(p.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${t.ancho}px`,
      height: `${t.alto}px`,
      background: t.color,
      borderRadius: '1px',
      boxShadow: '0 1px 2px rgba(0,0,0,.25)',
    })
    capa.appendChild(p)
    const a = p.animate?.(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${t.dx * 0.5}px, ${-t.sube}px) rotate(${t.giro * 0.3}deg)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${t.dx}px, ${t.cae}px) rotate(${t.giro}deg)`, opacity: 0 },
      ],
      { duration: DURACION_MS, delay: t.retraso, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' },
    )
    if (a) animaciones.push((a as Animation).finished.catch(() => undefined))
  }
  const quitar = () => capa.remove()
  if (animaciones.length) Promise.all(animaciones).then(quitar, quitar)
  else setTimeout(quitar, DURACION_MS + 200)
  return { primera: true, confeti: true }
}
