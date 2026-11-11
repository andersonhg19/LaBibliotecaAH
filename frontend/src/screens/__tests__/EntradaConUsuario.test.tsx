import React from 'react'

import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

import * as Auth from '@contextos/AuthContext'
import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import LoginScreen from '@pantallas/auth/LoginScreen'
import RegisterScreen from '@pantallas/auth/RegisterScreen'
import { adminService } from '@servicios/adminService'
import api from '@servicios/api'
import { authService } from '@servicios/authService'
import { MENSAJES } from '@utils/mensajes'
import { esquemaAlias, esquemaEntrar, esquemaRegistro, validar } from '@validaciones/index'

/*
 * ENTRAR CON CORREO O USUARIO (auth V3). La casilla de la entrada acepta las
 * dos cosas sin exigir formato de correo, y el registro pide el usuario con
 * las mismas reglas que el servidor.
 */

jest.mock('@servicios/api', () => {
  const real = jest.requireActual('@servicios/api')
  return {
    __esModule: true,
    ...real,
    default: { post: jest.fn(async () => ({ data: { correct: true, message: 'OK', errorCode: 0, object: null } })) },
  }
})

const post = api.post as jest.Mock
const nav = { navigate: jest.fn() } as never

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

const sinSesion = (extra: Partial<ReturnType<typeof Auth.useAuth>>) =>
  jest.spyOn(Auth, 'useAuth').mockReturnValue({
    user: null,
    token: null,
    loading: false,
    isAuthenticated: false,
    esAdmin: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    updateUser: jest.fn(),
    ...extra,
  })

beforeEach(() => {
  jest.restoreAllMocks()
  post.mockClear()
})

describe('El esquema del alias (mismas reglas que el servidor)', () => {
  it.each(['anderson', 'samy.h', 'a_b-c', '123', 'abcdefghijklmnopqrstuvwxyz1234'])('"%s" vale', (alias) => {
    expect(esquemaAlias.safeParse(alias).success).toBe(true)
  })

  it.each(['ab', 'abcdefghijklmnopqrstuvwxyz12345', 'ana@x.com', 'la lectora', 'andrés', 'ana!'])(
    '"%s" no vale y dice por qué',
    (alias) => {
      const r = esquemaAlias.safeParse(alias)
      expect(r.success).toBe(false)
      expect(r.error?.issues[0]?.message).toBe(MENSAJES.aliasInvalido)
    },
  )

  it('se recorta y se pasa a minúsculas, como lo guarda el servidor', () => {
    expect(esquemaAlias.parse('  Anderson ')).toBe('anderson')
  })

  it('vacío: obligatorio', () => {
    expect(esquemaAlias.safeParse('   ').error?.issues[0]?.message).toBe(MENSAJES.requerido('El usuario'))
  })
})

describe('La entrada', () => {
  it('no exige formato de correo: un usuario vale', () => {
    expect(validar(esquemaEntrar, { usuario: ' anderson ', password: 'clave-de-prueba' })).toEqual({
      ok: true,
      datos: { usuario: 'anderson', password: 'clave-de-prueba' },
      errores: {},
    })
  })

  it('vacío: pide el correo o el usuario', () => {
    expect(validar(esquemaEntrar, { usuario: '  ', password: 'clave-de-prueba' }).errores).toEqual({
      usuario: MENSAJES.requerido('El correo o usuario'),
    })
  })

  it('la casilla se llama "Correo o usuario", no capitaliza y se autocompleta como username', async () => {
    const login = jest.fn(async () => undefined)
    sinSesion({ login })
    const r = render(<LoginScreen navigation={nav} route={{ key: 'e', name: 'Entrar' }} />, { wrapper: Envoltura })

    expect(r.getByText('Correo o usuario')).toBeTruthy()
    const casilla = r.getByTestId('entrar-correo')
    expect(casilla.props.autoComplete).toBe('username')
    expect(casilla.props.autoCapitalize).toBe('none')
    expect(casilla.props.keyboardType).toBe('default')

    fireEvent.changeText(casilla, '  anderson ')
    fireEvent.changeText(r.getByTestId('entrar-clave'), 'clave-de-prueba')
    await act(async () => fireEvent.press(r.getByTestId('entrar-boton')))

    expect(login).toHaveBeenCalledWith('anderson', 'clave-de-prueba')
  })

  it('el servicio manda "usuario" (y ya no "email") al servidor', async () => {
    await authService.login('anderson', 'clave-de-prueba')

    expect(post).toHaveBeenCalledWith('/AUTH-SERVICE/biblioteca/v1/auth/login', {
      usuario: 'anderson',
      password: 'clave-de-prueba',
    })
  })
})

describe('El registro', () => {
  const datos = {
    name: 'Lectora',
    email: 'lectora@casa.co',
    alias: ' Lectora.AH ',
    password: 'Clave12345',
    confirmar: 'Clave12345',
  }

  it('el esquema exige el usuario y lo deja normalizado', () => {
    const v = validar(esquemaRegistro, datos)
    expect(v.ok && v.datos.alias).toBe('lectora.ah')
    expect(validar(esquemaRegistro, { ...datos, alias: 'con@arroba' }).errores).toEqual({
      alias: MENSAJES.aliasInvalido,
    })
  })

  it('la pantalla pide el usuario con su ayuda y lo envía', async () => {
    const register = jest.fn(async () => undefined)
    sinSesion({ register })
    const r = render(<RegisterScreen navigation={nav} route={{ key: 'r', name: 'Registro' }} />, {
      wrapper: Envoltura,
    })

    expect(r.getByText(MENSAJES.aliasAyuda)).toBeTruthy()
    expect(r.getByTestId('registro-alias').props.autoCapitalize).toBe('none')

    fireEvent.changeText(r.getByTestId('registro-nombre'), datos.name)
    fireEvent.changeText(r.getByTestId('registro-correo'), datos.email)
    fireEvent.changeText(r.getByTestId('registro-alias'), 'mal usuario')
    fireEvent.changeText(r.getByTestId('registro-clave'), datos.password)
    fireEvent.changeText(r.getByTestId('registro-confirmar'), datos.confirmar)
    await act(async () => fireEvent.press(r.getByTestId('registro-boton')))

    await waitFor(() => expect(r.getByText(`⚠ ${MENSAJES.aliasInvalido}`)).toBeTruthy())
    expect(register).not.toHaveBeenCalled()

    fireEvent.changeText(r.getByTestId('registro-alias'), datos.alias)
    await act(async () => fireEvent.press(r.getByTestId('registro-boton')))

    expect(register).toHaveBeenCalledWith('Lectora', 'lectora@casa.co', 'lectora.ah', 'Clave12345')
  })

  it('el servicio de registro manda el alias', async () => {
    await authService.register({ name: 'L', email: 'l@c.co', alias: 'lectora', password: 'Clave12345' })

    expect(post).toHaveBeenCalledWith('/AUTH-SERVICE/biblioteca/v1/auth/register', {
      name: 'L',
      email: 'l@c.co',
      alias: 'lectora',
      password: 'Clave12345',
    })
  })
})

describe('La administración edita el usuario', () => {
  it('manda id, nombre, correo y alias a users/save', async () => {
    await adminService.editarUsuario({ id: 4, name: 'Samy', email: 'samy@casa', alias: 'samy.h' })

    expect(post).toHaveBeenCalledWith('/AUTH-SERVICE/biblioteca/v1/admin/users/save', {
      id: 4,
      name: 'Samy',
      email: 'samy@casa',
      alias: 'samy.h',
    })
  })
})
