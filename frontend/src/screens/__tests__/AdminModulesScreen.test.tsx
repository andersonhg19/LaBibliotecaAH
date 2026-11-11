import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { ThemeProvider } from '@contextos/ThemeContext'
import AdminModulesScreen from '@pantallas/admin/AdminModulesScreen'
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

const modulos = [
  {
    id: 1,
    code: 'finanzas',
    name: 'Finanzas',
    icon: 'wallet',
    sortOrder: 1,
    active: true,
    pages: [
      { id: 10, code: 'panel', name: 'Panel', route: 'Dashboard', inMenu: true, sortOrder: 1, active: true },
      {
        id: 11,
        code: 'categorias',
        name: 'Categorias',
        route: 'CategoriesList',
        inMenu: false,
        sortOrder: 2,
        active: true,
      },
    ],
  },
]

const roles = [
  { id: 1, name: 'ADMIN', active: true, usuarios: 1 },
  { id: 2, name: 'USER', active: true, usuarios: 3 },
]

const permisosDeUser = [
  {
    pageId: 10,
    moduleCode: 'finanzas',
    pageCode: 'panel',
    pageName: 'Panel',
    canRead: true,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  },
]

describe('AdminModulesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminService.modulos as jest.Mock).mockResolvedValue(ok(modulos))
    ;(adminService.roles as jest.Mock).mockResolvedValue(ok(roles))
    ;(adminService.permisosDeRol as jest.Mock).mockResolvedValue(ok(permisosDeUser))
  })

  it('pinta los modulos con sus paginas y cuatro acciones por pagina', async () => {
    const { getByText, getByTestId } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('Finanzas')).toBeTruthy())
    expect(getByText('Panel')).toBeTruthy()
    /* Cuatro y no una: "puede entrar" y "puede borrar" no son la misma
       pregunta. */
    expect(getByTestId('permiso-10-canRead')).toBeTruthy()
    expect(getByTestId('permiso-10-canCreate')).toBeTruthy()
    expect(getByTestId('permiso-10-canUpdate')).toBeTruthy()
    expect(getByTestId('permiso-10-canDelete')).toBeTruthy()
  })

  it('distingue lo que sale en el menu de lo que solo se alcanza desde dentro', async () => {
    const { getByText } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('En el menu')).toBeTruthy())
    expect(getByText('Solo desde dentro')).toBeTruthy()
  })

  it('conceder una accion manda las cuatro banderas, no solo la que cambio', async () => {
    ;(adminService.guardarPermiso as jest.Mock).mockResolvedValue(ok(permisosDeUser[0]))
    const { getByTestId } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('permiso-10-canCreate')).toBeTruthy())
    fireEvent.press(getByTestId('permiso-10-canCreate'))

    await waitFor(() =>
      expect(adminService.guardarPermiso).toHaveBeenCalledWith({
        roleName: 'ADMIN',
        pageId: 10,
        canRead: true,
        canCreate: true,
        canUpdate: false,
        canDelete: false,
      }),
    )
  })

  it('una pagina sin fila parte de no poder nada', async () => {
    /* "No existir es no poder": la pagina 11 no tiene permiso, asi que al
       marcar Ver se manda solo esa en true. */
    ;(adminService.guardarPermiso as jest.Mock).mockResolvedValue(ok(permisosDeUser[0]))
    const { getByTestId } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('permiso-11-canRead')).toBeTruthy())
    fireEvent.press(getByTestId('permiso-11-canRead'))

    await waitFor(() =>
      expect(adminService.guardarPermiso).toHaveBeenCalledWith({
        roleName: 'ADMIN',
        pageId: 11,
        canRead: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
      }),
    )
  })

  it('cambiar de rol vuelve a pedir sus permisos', async () => {
    const { getByTestId } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('elegir-rol-USER')).toBeTruthy())
    fireEvent.press(getByTestId('elegir-rol-USER'))

    await waitFor(() => expect(adminService.permisosDeRol).toHaveBeenCalledWith('USER'))
  })

  it('cuando el backend se niega, se lee el motivo', async () => {
    ;(adminService.guardarPermiso as jest.Mock).mockResolvedValue({
      correct: false,
      message: 'adminKeepsAdminModule',
      errorCode: 111,
      object: null,
    })
    const { getByTestId } = render(<AdminModulesScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('permiso-10-canRead')).toBeTruthy())
    fireEvent.press(getByTestId('permiso-10-canRead'))

    await waitFor(() => expect(globalThis.__mockShowToast).toHaveBeenCalledWith('error', 'adminKeepsAdminModule'))
  })
})
