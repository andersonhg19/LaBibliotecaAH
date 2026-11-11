import { Alert, Platform } from 'react-native'

/*
 * CONFIRMAR UNA ACCIÓN. La misma llamada de siempre (`confirmarAccion({...})`),
 * pero en la web ya no sale el `window.confirm` gris del navegador en medio de
 * la madera (QA diseño 4): la pinta la HOJA DE CONFIRMACIÓN de la casa
 * (components/organisms/HojaConfirmacion), que se registra aquí al montar la
 * app. Sin hoja montada (pruebas, arranque) se usa el diálogo del sistema.
 */
export interface OpcionesConfirmacion {
  titulo: string
  mensaje: string
  textoConfirmar?: string
  onConfirmar: () => void
  /** Si la acción borra o retira algo (botón burdeos). Si no se dice, se deduce del texto del botón. */
  destructiva?: boolean
}

export type PedidoConfirmacion = Required<Omit<OpcionesConfirmacion, 'destructiva'>> & { destructiva: boolean }

type Anfitrion = (p: PedidoConfirmacion) => void
let anfitrion: Anfitrion | null = null

/** La hoja de la casa se ofrece para confirmar; devuelve cómo retirarse. */
export function registrarConfirmacion(f: Anfitrion): () => void {
  anfitrion = f
  return () => {
    if (anfitrion === f) anfitrion = null
  }
}

const DESTRUCTIVAS = /retirar|borrar|eliminar|desactivar|quitar|vaciar/i

/** Lo que se le pide a la hoja: con el texto del botón por defecto y si es destructiva. */
export function pedidoDe(o: OpcionesConfirmacion): PedidoConfirmacion {
  const textoConfirmar = o.textoConfirmar ?? 'Sí, continuar'
  return {
    titulo: o.titulo,
    mensaje: o.mensaje,
    textoConfirmar,
    onConfirmar: o.onConfirmar,
    destructiva: o.destructiva ?? DESTRUCTIVAS.test(`${textoConfirmar} ${o.titulo}`),
  }
}

export const confirmarAccion = (opciones: OpcionesConfirmacion): void => {
  const p = pedidoDe(opciones)
  if (anfitrion) {
    anfitrion(p)
    return
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${p.titulo}\n\n${p.mensaje}`)) {
      p.onConfirmar()
    }
    return
  }

  Alert.alert(p.titulo, p.mensaje, [
    { text: 'Cancelar', style: 'cancel' },
    { text: p.textoConfirmar, style: p.destructiva ? 'destructive' : 'default', onPress: p.onConfirmar },
  ])
}

/** Atajo para el caso más común: borrar algo con nombre. */
export const confirmarBorrado = (queSeBorra: string, onConfirmar: () => void): void =>
  confirmarAccion({
    titulo: 'Eliminar',
    mensaje: `¿Seguro que quieres eliminar ${queSeBorra}? Esta acción no se puede deshacer.`,
    textoConfirmar: 'Sí, eliminar',
    onConfirmar,
  })
