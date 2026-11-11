import React from 'react'

import { Text } from 'react-native'

import { act, render, waitFor } from '@testing-library/react-native'

import { AuthProvider, useAuth } from '@contextos/AuthContext'

/*
 * QA LV-03: cuando la sesión caduca, se cierra o entra otra cuenta, la voz se
 * calla y se olvida. Antes de este arreglo la voz seguía sonando sin controles
 * y la cuenta siguiente veía en el mini reproductor el libro de la anterior.
 */

const mockDetener = jest.fn()
let mockLibro: { ejemplarId: string } | null = null
jest.mock('@contextos/VozContext', () => ({
  motor: {
    detener: (...a: unknown[]) => {
      mockDetener(...a)
      mockLibro = null
    },
    obtener: () => ({ libro: mockLibro }),
  },
}))

let mockAlCaducar: (() => void) | null = null
jest.mock('@servicios/api', () => ({
  TOKEN_KEY: '@token',
  fijarTokenEnMemoria: jest.fn(),
  registrarCierreDeSesion: (fn: (() => void) | null) => {
    mockAlCaducar = fn
  },
}))

jest.mock('@servicios/authService', () => ({
  authService: {
    login: jest.fn(async (u: string) => ({
      correct: true,
      message: 'OK',
      errorCode: 0,
      object: { token: `tok-${u}`, userId: u, name: u, email: `${u}@casa`, roles: [] },
    })),
    register: jest.fn(),
    getUser: jest.fn(),
  },
}))

let auth: ReturnType<typeof useAuth>
const Sonda = () => {
  auth = useAuth()
  return <Text>{auth.user?.name ?? 'nadie'}</Text>
}

const montar = async () => {
  const r = render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  )
  await waitFor(() => expect(auth.loading).toBe(false))
  return r
}

beforeEach(() => {
  mockDetener.mockClear()
  mockLibro = null
})

describe('La voz se va con la sesión (QA LV-03)', () => {
  it('al caducar la sesión la voz se para sin intentar guardar en el servidor', async () => {
    const r = await montar()
    await act(() => auth.login('anderson', 'x'))
    expect(r.getByText('anderson')).toBeTruthy()
    mockLibro = { ejemplarId: 'e1' }
    act(() => mockAlCaducar?.())
    expect(mockDetener).toHaveBeenCalledWith({ servidor: false })
    expect(r.getByText('nadie')).toBeTruthy()
  })

  it('al cerrar sesión la voz se para (guardando antes con el token aún válido)', async () => {
    await montar()
    await act(() => auth.login('anderson', 'x'))
    await act(() => auth.logout())
    expect(mockDetener).toHaveBeenCalledWith()
  })

  it('si entra otra cuenta con algo sonando, la voz de la anterior se olvida', async () => {
    await montar()
    mockLibro = { ejemplarId: 'libro-de-otra-cuenta' }
    await act(() => auth.login('samy', 'x'))
    expect(mockDetener).toHaveBeenCalledWith({ servidor: false })
    expect(mockLibro).toBeNull()
  })
})
