import React from 'react'

import { Text } from 'react-native'

import { fireEvent, render } from '@testing-library/react-native'

import Hoja from '@componentes/molecules/Hoja'
import { ThemeProvider } from '@contextos/ThemeContext'
import { ponerMarca, puntoEnTexto } from '@utils/marcaPalabra'

/*
 * F1 · la marca de la palabra que se desliza en «Ver texto», y E5 · las hojas
 * como diálogo con nombre y un velo que no es parada de Tab (UX5-05).
 */

const texto = (t: string) => ({ nodeType: 3, textContent: t, childNodes: [] }) as unknown as Node
const elemento = (...hijos: Node[]) => ({ nodeType: 1, textContent: '', childNodes: hijos }) as unknown as Node

describe('F1 · dónde cae un carácter dentro de la frase', () => {
  it('recorre los nodos de texto en orden', () => {
    const a = texto('Llegué al ')
    const b = texto('pueblo')
    const frase = elemento(a, elemento(b), texto(' '))
    expect(puntoEnTexto(frase, 3)).toEqual({ nodo: a, desplazamiento: 3 })
    expect(puntoEnTexto(frase, 12)).toEqual({ nodo: b, desplazamiento: 2 })
    expect(puntoEnTexto(frase, 99)).toBeNull()
  })
})

describe('F1 · la marca se desliza (o salta con reducir movimiento)', () => {
  const marca = () => ({ style: {} as Record<string, string> }) as unknown as HTMLElement
  it('la primera vez aparece en su sitio sin transición; después se desliza', () => {
    const m = marca()
    ponerMarca(m, { x: 10, y: 20, ancho: 40, alto: 24 }, true)
    expect(m.style.transition).toBe('none')
    expect(m.style.transform).toBe('translate(10px, 20px)')
    expect(m.style.opacity).toBe('1')
    ponerMarca(m, { x: 60, y: 20, ancho: 30, alto: 24 }, true)
    expect(m.style.transition).toMatch(/transform 160ms/)
    expect(m.style.width).toBe('30px')
  })
  it('con reducir movimiento, sin transición; sin palabra, se esconde', () => {
    const m = marca()
    ponerMarca(m, { x: 0, y: 0, ancho: 10, alto: 10 }, false)
    ponerMarca(m, { x: 50, y: 0, ancho: 10, alto: 10 }, false)
    expect(m.style.transition).toBe('none')
    ponerMarca(m, null, true)
    expect(m.style.opacity).toBe('0')
  })
})

describe('E5 · hojas accesibles', () => {
  it('el velo cierra al tocarlo pero no es un botón (no hay dos «Cerrar»)', () => {
    const cerrar = jest.fn()
    const r = render(
      <ThemeProvider>
        <Hoja visible titulo="Traer libros" onCerrar={cerrar} testID="hoja">
          <Text>Hola</Text>
        </Hoja>
      </ThemeProvider>,
    )
    expect(r.getAllByLabelText('Cerrar')).toHaveLength(1)
    const velo = r.getByTestId('hoja-velo', { includeHiddenElements: true })
    expect(velo.props.accessibilityRole).toBeUndefined()
    fireEvent(velo, 'responderRelease')
    expect(cerrar).toHaveBeenCalled()
    expect(r.getByText('Traer libros').props.nativeID).toMatch(/^hoja-titulo-/)
  })
})
