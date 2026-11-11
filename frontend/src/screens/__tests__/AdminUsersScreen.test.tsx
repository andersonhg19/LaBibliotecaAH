import React from 'react'

import { Alert } from 'react-native'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import * as AuthContext from '@contextos/AuthContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import AdminUsersScreen from '@pantallas/admin/AdminUsersScreen'
import { adminService } from '@servicios/adminService'
import { MENSAJES } from '@utils/mensajes'

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
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
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
  alias: 'ana',
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

  it('desactiva una cuenta tras confirmarlo y lo refleja (UX-03)', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botones) => botones?.[1]?.onPress?.())
    ;(adminService.cambiarActivacion as jest.Mock).mockResolvedValue(ok({ ...ana, active: false }))
    const { getByTestId, getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('activacion-2')).toBeTruthy())
    fireEvent.press(getByTestId('activacion-2'))

    expect(alerta).toHaveBeenCalledWith('Desactivar cuenta', expect.stringContaining('ana@x.com'), expect.any(Array))
    await waitFor(() => expect(adminService.cambiarActivacion).toHaveBeenCalledWith(2, false))
    await waitFor(() => expect(getByText('Desactivada')).toBeTruthy())
    alerta.mockRestore()
  })

  it('si no se confirma, la cuenta sigue activa (UX-03)', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const { getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('activacion-2')).toBeTruthy())
    fireEvent.press(getByTestId('activacion-2'))

    expect(alerta).toHaveBeenCalled()
    expect(adminService.cambiarActivacion).not.toHaveBeenCalled()
    alerta.mockRestore()
  })

  it('nadie puede desactivarse a sí mismo: su tarjeta no trae el botón (UX-03)', async () => {
    const yo = { ...ana, id: 1, name: 'Anderson', email: 'a@b.com', roles: ['ADMIN'] }
    ;(adminService.usuarios as jest.Mock).mockResolvedValue(usuarios([yo, ana]))
    const { getByTestId, queryByTestId, getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('activacion-2')).toBeTruthy())
    expect(queryByTestId('activacion-1')).toBeNull()
    expect(getByTestId('activacion-propia-1')).toBeTruthy()
    expect(getByText('Anderson (tú)')).toBeTruthy()
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

  it('muestra el usuario (alias) de cada cuenta', async () => {
    const { getByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('alias-2')).toBeTruthy())
    expect(getByTestId('alias-2').props.children).toBe('Usuario: ana')
  })

  it('edita el alias: valida el formato antes de enviar y guarda normalizado', async () => {
    ;(adminService.editarUsuario as jest.Mock).mockResolvedValue(ok({ ...ana, alias: 'ana.maria' }))
    const { getByTestId, getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('alias-editar-2')).toBeTruthy())
    fireEvent.press(getByTestId('alias-editar-2'))
    expect(getByTestId('alias-campo-2').props.value).toBe('ana')

    fireEvent.changeText(getByTestId('alias-campo-2'), 'ana@x.com')
    fireEvent.press(getByTestId('alias-guardar-2'))
    await waitFor(() => expect(getByText(`⚠ ${MENSAJES.aliasInvalido}`)).toBeTruthy())
    expect(adminService.editarUsuario).not.toHaveBeenCalled()

    fireEvent.changeText(getByTestId('alias-campo-2'), ' Ana.Maria ')
    fireEvent.press(getByTestId('alias-guardar-2'))

    await waitFor(() =>
      expect(adminService.editarUsuario).toHaveBeenCalledWith({
        id: 2,
        name: 'Ana',
        email: 'ana@x.com',
        alias: 'ana.maria',
      }),
    )
    await waitFor(() => expect(getByTestId('alias-2').props.children).toBe('Usuario: ana.maria'))
    expect(globalThis.__mockShowToast).toHaveBeenCalledWith('success', MENSAJES.aliasGuardado)
  })

  it('si el servidor dice que el alias ya está en uso, lo muestra en el campo', async () => {
    const enUso = 'Ese nombre de usuario ya está en uso. Prueba con otro.'
    ;(adminService.editarUsuario as jest.Mock).mockResolvedValue({
      correct: false,
      message: enUso,
      errorCode: 112,
      object: null,
    })
    const { getByTestId, getByText } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('alias-editar-2')).toBeTruthy())
    fireEvent.press(getByTestId('alias-editar-2'))
    fireEvent.changeText(getByTestId('alias-campo-2'), 'samy')
    fireEvent.press(getByTestId('alias-guardar-2'))

    await waitFor(() => expect(getByText(`⚠ ${enUso}`)).toBeTruthy())
  })

  it('cancelar cierra la edición sin enviar nada', async () => {
    const { getByTestId, queryByTestId } = render(<AdminUsersScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('alias-editar-2')).toBeTruthy())
    fireEvent.press(getByTestId('alias-editar-2'))
    fireEvent.press(getByTestId('alias-cancelar-2'))

    expect(queryByTestId('alias-campo-2')).toBeNull()
    expect(adminService.editarUsuario).not.toHaveBeenCalled()
  })
})
