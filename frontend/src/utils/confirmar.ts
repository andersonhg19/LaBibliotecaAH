import { Alert, Platform } from 'react-native'

/*
 * El mismo dialogo que ya usaba el cierre de sesion de Ajustes, extraido para
 * que las acciones destructivas no se inventen cada una el suyo (o, peor, no
 * pregunten nada: borrar movimiento, categoria, programado y presupuesto se
 * ejecutaban al primer toque, sin vuelta atras).
 */
export interface OpcionesConfirmacion {
  titulo: string
  mensaje: string
  textoConfirmar?: string
  onConfirmar: () => void
}

export const confirmarAccion = ({
  titulo,
  mensaje,
  textoConfirmar = 'Si, continuar',
  onConfirmar,
}: OpcionesConfirmacion): void => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${titulo}\n\n${mensaje}`)) {
      onConfirmar()
    }
    return
  }

  Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel' },
    { text: textoConfirmar, style: 'destructive', onPress: onConfirmar },
  ])
}

/** Atajo para el caso mas comun: borrar algo con nombre. */
export const confirmarBorrado = (queSeBorra: string, onConfirmar: () => void): void =>
  confirmarAccion({
    titulo: 'Eliminar',
    mensaje: `Seguro que quieres eliminar ${queSeBorra}? Esta accion no se puede deshacer.`,
    textoConfirmar: 'Si, eliminar',
    onConfirmar,
  })
