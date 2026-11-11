import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { ThemeProvider } from '@contextos/ThemeContext'
import AdminRolesScreen from '@pantallas/admin/AdminRolesScreen'
import { adminService } from '@servicios/adminService'

jest.mock('@servicios/adminService')
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => unknown) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const limpieza = cb()
      return typeof limpieza === 'function' ? limpieza : undefined
      // eslint-disable-next-line react-hooks/exhaustive-deps -- imita useFocusEffect: una vez al montar
    }, [])
  },
}))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => <ThemeProvider>{children}</ThemeProvider>

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })

const roles = [
  { id: 1, name: 'ADMIN', description: 'manda', active: true, usuarios: 1 },
  { id: 2, name: 'USER', description: 'usa', active: true, usuarios: 3 },
  { id: 3, name: 'CONTABLE', description: 'mira cifras', active: true, usuarios: 0 },
  { id: 4, name: 'AUDITOR', description: 'revisa', active: true, usuarios: 2 },
]

describe('AdminRolesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminService.roles as jest.Mock).mockResolvedValue(ok(roles))
  })

  it('dice cuanta gente lleva cada rol, en singular y en plural', async () => {
    const { getByText } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('ADMIN')).toBeTruthy())
    expect(getByText('Lo tiene 1 persona')).toBeTruthy()
    expect(getByText('Lo tienen 3 personas')).toBeTruthy()
    expect(getByText('No lo tiene nadie')).toBeTruthy()
  })

  it('LOS ROLES DEL SISTEMA NO SE RETIRAN, y se explica por que', async () => {
    /* Deshabilitar el boton sin decir nada deja al usuario probando otra vez.
       El motivo importa: hay reglas de seguridad escritas contra esos nombres. */
    const { queryByTestId, getAllByText } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(queryByTestId('retirar-CONTABLE')).toBeTruthy())
    expect(queryByTestId('retirar-ADMIN')).toBeNull()
    expect(queryByTestId('retirar-USER')).toBeNull()
    expect(getAllByText(/rol del sistema/i).length).toBe(2)
  })

  it('un rol que alguien lleva puesto tampoco se retira desde aqui', async () => {
    const { queryByTestId, getByText } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('AUDITOR')).toBeTruthy())
    expect(queryByTestId('retirar-AUDITOR')).toBeNull()
    expect(getByText(/primero quitaselo a quien lo tenga/i)).toBeTruthy()
  })

  it('retira el que no lleva nadie', async () => {
    ;(adminService.desactivarRol as jest.Mock).mockResolvedValue(ok({ ...roles[2], active: false }))
    const { getByTestId } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('retirar-CONTABLE')).toBeTruthy())
    fireEvent.press(getByTestId('retirar-CONTABLE'))

    await waitFor(() => expect(adminService.desactivarRol).toHaveBeenCalledWith(3))
  })

  it('el nombre del rol nuevo se guarda en mayusculas', async () => {
    ;(adminService.guardarRol as jest.Mock).mockResolvedValue(
      ok({ id: 9, name: 'TESORERO', active: true, usuarios: 0 }),
    )
    const { getByTestId, getByLabelText } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('crear-rol')).toBeTruthy())
    fireEvent.changeText(getByLabelText(/Nombre del rol nuevo/i), 'tesorero')
    fireEvent.press(getByTestId('crear-rol'))

    await waitFor(() =>
      expect(adminService.guardarRol).toHaveBeenCalledWith(expect.objectContaining({ name: 'TESORERO' })),
    )
  })

  it('un rol sin nombre no se crea', async () => {
    const { getByTestId } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('crear-rol')).toBeTruthy())
    fireEvent.press(getByTestId('crear-rol'))

    expect(adminService.guardarRol).not.toHaveBeenCalled()
    expect(globalThis.__mockShowToast).toHaveBeenCalledWith('warning', expect.any(String))
  })

  it('si el backend se niega, se lee el motivo', async () => {
    ;(adminService.guardarRol as jest.Mock).mockResolvedValue({
      correct: false,
      message: 'roleAlreadyExists',
      errorCode: 107,
      object: null,
    })
    const { getByTestId, getByLabelText } = render(<AdminRolesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('crear-rol')).toBeTruthy())
    fireEvent.changeText(getByLabelText(/Nombre del rol nuevo/i), 'ADMIN')
    fireEvent.press(getByTestId('crear-rol'))

    await waitFor(() => expect(globalThis.__mockShowToast).toHaveBeenCalledWith('error', 'roleAlreadyExists'))
  })
})
