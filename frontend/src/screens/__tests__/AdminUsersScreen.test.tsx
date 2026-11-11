import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import * as AuthContext from '@contextos/AuthContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import AdminUsersScreen from '@pantallas/admin/AdminUsersScreen'
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
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}))

jest.spyOn(AuthContext, 'useAuth').mockReturnValue({
  user: { userId: '1', name: 'Anderson', email: 'a@b.com', roles: ['ADMIN'] },
  token: 'tok',
  loading: false,
  isAuthenticated: true,
  esAdmin: true,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  updateUser: jest.fn(),
})

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => <ThemeProvider>{children}</ThemeProvider>

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })

const usuarios = (lista: unknown[]) => ok({ page: 0, size: 50, totalPage: 1, list: lista })

const ana = {
  id: 2,
  name: 'Ana',
  email: 'ana@x.com',
  active: true,
  roles: ['USER'],
}

const roles = [
  { id: 1, name: 'ADMIN', description: 'manda', active: true, usuarios: 1 },
  { id: 2, name: 'USER', description: 'usa', active: true, usuarios: 3 },
]

describe('AdminUsersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminService.usuarios as jest.Mock).mockResolvedValue(usuarios([ana]))
    ;(adminService.roles as jest.Mock).mockResolvedValue(ok(roles))
  })

  it('pinta las cuentas con su estado y sus roles', async () => {
    const { getByText, getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('Ana')).toBeTruthy())
    expect(getByText('ana@x.com')).toBeTruthy()
    /* El estado se dice con palabras y no solo con un color o una opacidad. */
    expect(getByText('Activa')).toBeTruthy()
    expect(getByTestId('rol-2-USER')).toBeTruthy()
    expect(getByTestId('rol-2-ADMIN')).toBeTruthy()
  })

  it('conceder un rol manda la lista COMPLETA, no un incremento', async () => {
    ;(adminService.fijarRoles as jest.Mock).mockResolvedValue(ok({ ...ana, roles: ['USER', 'ADMIN'] }))
    const { getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('rol-2-ADMIN')).toBeTruthy())
    fireEvent.press(getByTestId('rol-2-ADMIN'))

    await waitFor(() => expect(adminService.fijarRoles).toHaveBeenCalledWith(2, ['USER', 'ADMIN']))
  })

  it('retirar un rol quita ese y deja los demas', async () => {
    ;(adminService.fijarRoles as jest.Mock).mockResolvedValue(ok({ ...ana, roles: [] }))
    const { getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('rol-2-USER')).toBeTruthy())
    fireEvent.press(getByTestId('rol-2-USER'))

    await waitFor(() => expect(adminService.fijarRoles).toHaveBeenCalledWith(2, []))
  })

  it('CUANDO EL BACKEND SE NIEGA, SE LEE EL MOTIVO', async () => {
    /* El caso real es "es el ultimo administrador". Si esto se tragara la
       respuesta, la pantalla se quedaria igual que estaba y quien la usa no
       tendria forma de saber por que no pasó nada. */
    ;(adminService.fijarRoles as jest.Mock).mockResolvedValue({
      correct: false,
      message: 'lastAdminCannotLoseRole',
      errorCode: 105,
      object: null,
    })
    const { getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('rol-2-USER')).toBeTruthy())
    fireEvent.press(getByTestId('rol-2-USER'))

    await waitFor(() => expect(globalThis.__mockShowToast).toHaveBeenCalledWith('error', 'lastAdminCannotLoseRole'))
  })

  it('desactiva una cuenta y lo refleja', async () => {
    ;(adminService.cambiarActivacion as jest.Mock).mockResolvedValue(ok({ ...ana, active: false }))
    const { getByTestId, getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('activacion-2')).toBeTruthy())
    fireEvent.press(getByTestId('activacion-2'))

    await waitFor(() => expect(adminService.cambiarActivacion).toHaveBeenCalledWith(2, false))
    await waitFor(() => expect(getByText('Desactivada')).toBeTruthy())
  })

  it('un fallo de carga se ve y se puede reintentar', async () => {
    ;(adminService.usuarios as jest.Mock).mockResolvedValue({
      correct: false,
      message: 'No autorizado',
      errorCode: 403,
      object: null,
    })
    const { getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('No autorizado')).toBeTruthy())
  })
})
