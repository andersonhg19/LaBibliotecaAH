import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { ThemeProvider } from '@contextos/ThemeContext'
import AdminAuditScreen from '@pantallas/admin/AdminAuditScreen'
import { adminService } from '@servicios/adminService'

jest.mock('@servicios/adminService')
/*
 * Aqui el efecto se vuelve a lanzar cuando CAMBIA el callback, y no solo al
 * montar como en el resto de las pantallas. Es lo que hace el useFocusEffect
 * de verdad, y esta pantalla depende de ello: al cambiar la ventana de tiempo
 * cambia la funcion de carga, y sin eso la lista se quedaria con los datos del
 * periodo anterior. El callback es estable entre renders salvo por ese cambio,
 * asi que no hay bucle.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => unknown) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const limpieza = cb()
      return typeof limpieza === 'function' ? limpieza : undefined
    }, [cb])
  },
}))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => <ThemeProvider>{children}</ThemeProvider>

const lineas = [
  {
    id: 1,
    actorUserId: 1,
    actorEmail: 'jefe@x.com',
    entityType: 'User',
    entityId: 2,
    action: 'ROLES_ASSIGNED',
    details: '[USER] -> [USER, ADMIN]',
    occurredAt: '2026-09-01T10:00:00',
  },
  {
    id: 2,
    actorUserId: 2,
    actorEmail: 'ana@x.com',
    entityType: 'User',
    entityId: 2,
    action: 'LOGIN',
    details: 'Entro con los roles [USER]',
    occurredAt: '2026-09-01T09:00:00',
  },
]

const ok = (lista: unknown[]) => ({
  correct: true,
  message: 'OK',
  errorCode: 0,
  object: { page: 0, size: 100, totalPage: 1, list: lista },
})

describe('AdminAuditScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(adminService.auditoria as jest.Mock).mockResolvedValue(ok(lineas))
  })

  it('traduce las acciones a algo que se entiende leyendo', async () => {
    const { getByText } = render(<AdminAuditScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('Cambio los roles de alguien')).toBeTruthy())
    expect(getByText('Entro')).toBeTruthy()
    expect(getByText('jefe@x.com')).toBeTruthy()
    expect(getByText('[USER] -> [USER, ADMIN]')).toBeTruthy()
  })

  it('pide una ventana de tiempo: nunca la tabla entera', async () => {
    render(<AdminAuditScreen />, { wrapper: Wrapper })

    await waitFor(() =>
      expect(adminService.auditoria).toHaveBeenCalledWith(expect.objectContaining({ ultimosDias: 30 })),
    )
  })

  it('cambiar de ventana vuelve a consultar', async () => {
    const { getByTestId } = render(<AdminAuditScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByTestId('ventana-7')).toBeTruthy())
    fireEvent.press(getByTestId('ventana-7'))

    await waitFor(() =>
      expect(adminService.auditoria).toHaveBeenCalledWith(expect.objectContaining({ ultimosDias: 7 })),
    )
  })

  it('un periodo sin nada lo dice, en vez de dejar la pantalla en blanco', async () => {
    ;(adminService.auditoria as jest.Mock).mockResolvedValue(ok([]))
    const { getByText } = render(<AdminAuditScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('Nada que contar')).toBeTruthy())
  })

  it('y un fallo tambien se ve', async () => {
    ;(adminService.auditoria as jest.Mock).mockResolvedValue({
      correct: false,
      message: 'No autorizado',
      errorCode: 403,
      object: null,
    })
    const { getByText } = render(<AdminAuditScreen />, { wrapper: Wrapper })

    await waitFor(() => expect(getByText('No autorizado')).toBeTruthy())
  })
})
