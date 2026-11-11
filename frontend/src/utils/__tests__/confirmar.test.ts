import { Alert } from 'react-native'

import { confirmarAccion, confirmarBorrado } from '@utils/confirmar'

describe('confirmarAccion', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
  })

  it('no ejecuta nada hasta que el usuario acepta', () => {
    const onConfirmar = jest.fn()
    confirmarAccion({ titulo: 'Cerrar sesion', mensaje: 'Estas seguro?', textoConfirmar: 'Si, salir', onConfirmar })

    expect(onConfirmar).not.toHaveBeenCalled()
    const botones = (Alert.alert as unknown as jest.Mock).mock.calls[0][2]
    expect(botones.map((b: { text: string }) => b.text)).toEqual(['Cancelar', 'Si, salir'])

    botones[1].onPress()
    expect(onConfirmar).toHaveBeenCalled()
  })

  it('cancelar deja todo como estaba', () => {
    const onConfirmar = jest.fn()
    confirmarAccion({ titulo: 'Eliminar', mensaje: 'Seguro?', onConfirmar })
    const botones = (Alert.alert as unknown as jest.Mock).mock.calls[0][2]
    botones[0].onPress?.()
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('confirmarBorrado avisa de que no se puede deshacer', () => {
    confirmarBorrado('el movimiento "Arriendo"', jest.fn())
    const [titulo, mensaje] = (Alert.alert as unknown as jest.Mock).mock.calls[0]
    expect(titulo).toBe('Eliminar')
    expect(mensaje).toContain('el movimiento "Arriendo"')
    expect(mensaje).toContain('no se puede deshacer')
  })
})
