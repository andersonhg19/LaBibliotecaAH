import React from 'react'

import { fireEvent, render, waitFor } from '@testing-library/react-native'

import Pronunciacion, {
  MAX_PALABRAS,
  conEntrada,
  errorDeEntrada,
  textoRegenerando,
} from '@componentes/molecules/Pronunciacion'
import { ThemeProvider } from '@contextos/ThemeContext'
import { pronunciacionService } from '@servicios/bibliotecaService'
import type { EntradaPronunciacion } from '@tipos'

/*
 * B17 · «CÓMO SE PRONUNCIA» en la ficha: lista editable palabra → cómo decirla,
 * guardada entera con PUT, aviso de los capítulos que la casa rehace, y nada si
 * el servidor no tiene la ruta.
 */

jest.mock('@servicios/bibliotecaService')

const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })
const m = pronunciacionService as jest.Mocked<typeof pronunciacionService>
const H: EntradaPronunciacion = { de: 'Hermione', a: 'Jermáyoni' }

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => <ThemeProvider>{children}</ThemeProvider>

beforeEach(() => jest.clearAllMocks())

describe('B17 · reglas de la lista (puras)', () => {
  it('valida vacíos, largos, solo signos, repetidas sin mayúsculas y el tope', () => {
    expect(errorDeEntrada([], ' ', 'x')).toMatch(/palabra/)
    expect(errorDeEntrada([], 'x', ' ')).toMatch(/decirla/)
    expect(errorDeEntrada([], 'x'.repeat(81), 'y')).toMatch(/80/)
    expect(errorDeEntrada([], 'x', 'y'.repeat(121))).toMatch(/120/)
    expect(errorDeEntrada([], '...', 'puntos')).toMatch(/letras/)
    expect(errorDeEntrada([H], 'HERMIONE', 'otra')).toMatch(/ya está/)
    expect(errorDeEntrada([H], 'Hermione', 'Hermaioni', 'Hermione')).toBeNull() // editarla no es repetirla
    const llena = Array.from({ length: MAX_PALABRAS }, (_, i) => ({ de: `p${i}`, a: 'x' }))
    expect(errorDeEntrada(llena, 'nueva', 'x')).toMatch(/200/)
    expect(errorDeEntrada([H], ' Ron ', ' Ron ')).toBeNull()
  })

  it('añade ordenado, sustituye la editada y recorta espacios', () => {
    expect(conEntrada([H], { de: ' Ron ', a: 'Ron ' })).toEqual([H, { de: 'Ron', a: 'Ron' }])
    expect(conEntrada([H, { de: 'Ron', a: 'Ron' }], { de: 'hermione', a: 'Hermaioni' }, 'Hermione')).toEqual([
      { de: 'hermione', a: 'Hermaioni' },
      { de: 'Ron', a: 'Ron' },
    ])
    expect(conEntrada([], { de: 'Ñu', a: 'ñu' }).map((e) => e.de)).toEqual(['Ñu'])
  })

  it('dice cuántos capítulos se rehacen', () => {
    expect(textoRegenerando(0)).toBeNull()
    expect(textoRegenerando(1)).toMatch(/1 capítulo con/)
    expect(textoRegenerando(3)).toMatch(/3 capítulos/)
  })
})

describe('B17 · la sección en la ficha', () => {
  it('sin la ruta en el servidor (o con error) no se enseña', async () => {
    m.obtener.mockRejectedValue(new Error('404'))
    const r = render(<Pronunciacion ejemplarId="e1" />, { wrapper: Envoltura })
    await waitFor(() => expect(m.obtener).toHaveBeenCalled())
    expect(r.queryByTestId('pronunciacion')).toBeNull()
  })

  it('lista lo guardado, añade con PUT de la lista entera y avisa de lo que se rehace', async () => {
    m.obtener.mockResolvedValue(ok({ entradas: [H], regenerando: 0 }))
    m.guardar.mockImplementation(async (_e, entradas) => ok({ entradas, regenerando: 2 }))
    const r = render(<Pronunciacion ejemplarId="e1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('pronunciacion')).toBeTruthy())
    expect(r.getByLabelText('Hermione se dice Jermáyoni. Cambiar')).toBeTruthy()

    fireEvent.changeText(r.getByTestId('pronunciacion-de'), 'Ron')
    fireEvent.changeText(r.getByTestId('pronunciacion-a'), 'Ron')
    fireEvent.press(r.getByTestId('pronunciacion-anadir'))
    await waitFor(() => expect(m.guardar).toHaveBeenCalledWith('e1', [H, { de: 'Ron', a: 'Ron' }]))
    await waitFor(() => expect(r.getByTestId('regenerando')).toBeTruthy())
    expect(r.getByLabelText('Ron se dice Ron. Cambiar')).toBeTruthy()
  })

  it('una repetida no se manda y se dice; tocar una la edita; la papelera la quita', async () => {
    m.obtener.mockResolvedValue(ok({ entradas: [H], regenerando: 0 }))
    m.guardar.mockImplementation(async (_e, entradas) => ok({ entradas, regenerando: 0 }))
    const r = render(<Pronunciacion ejemplarId="e1" />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByTestId('pronunciacion')).toBeTruthy())

    fireEvent.changeText(r.getByTestId('pronunciacion-de'), 'hermione')
    fireEvent.changeText(r.getByTestId('pronunciacion-a'), 'otra')
    fireEvent.press(r.getByTestId('pronunciacion-anadir'))
    expect(r.getByText(/ya está en la lista/)).toBeTruthy()
    expect(m.guardar).not.toHaveBeenCalled()

    fireEvent.press(r.getByTestId('pronunciacion-Hermione'))
    fireEvent.changeText(r.getByTestId('pronunciacion-a'), 'Hermaioni')
    fireEvent.press(r.getByTestId('pronunciacion-anadir'))
    await waitFor(() => expect(m.guardar).toHaveBeenCalledWith('e1', [{ de: 'Hermione', a: 'Hermaioni' }]))

    await waitFor(() => expect(r.getByTestId('quitar-pronunciacion-Hermione')).toBeTruthy())
    fireEvent.press(r.getByTestId('quitar-pronunciacion-Hermione'))
    await waitFor(() => expect(m.guardar).toHaveBeenLastCalledWith('e1', []))
  })
})
