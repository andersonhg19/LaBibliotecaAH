import { useEffect, useRef } from 'react'

/*
 * UNA BARRA ESCONDIDA NO SE PUEDE ALCANZAR CON EL TABULADOR (UX5-04).
 *
 * En el lector, las barras de arriba y abajo se esconden fuera de pantalla
 * (transform + opacidad) y el Tab seguía entrando en sus seis botones: el foco
 * desaparecía. `inert` las saca del orden de foco y del árbol accesible de una
 * vez. react-native-web no deja pasar la prop `inert`, así que se pone el
 * atributo en el nodo del DOM. En nativo (y en las pruebas) no hace nada.
 */
type NodoDom = { setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void }

export function ponerInerte(nodo: unknown, inerte: boolean): void {
  const el = nodo as NodoDom | null
  if (!el || typeof el.setAttribute !== 'function' || typeof el.removeAttribute !== 'function') return
  if (inerte) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

/** La ref para la vista que se vuelve inerte mientras `inerte` sea true. */
export function useInerte<T = unknown>(inerte: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    ponerInerte(ref.current, inerte)
  }, [inerte])
  return ref
}
