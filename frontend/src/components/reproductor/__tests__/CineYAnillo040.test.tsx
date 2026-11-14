import React from 'react'

import { Platform } from 'react-native'

import { render } from '@testing-library/react-native'

import { BotonLaton } from '@componentes/reproductor/ControlesVoz'
import { accionDeTecla } from '@componentes/reproductor/ModoCine'

/*
 * Validación web 0.4.0:
 *  · V-NUEVO-8 (F8): en el modo cine el Espacio con el foco en un botón lo
 *    atiende ese botón; si no, se alternaba dos veces o, con el foco en
 *    «Salir», se cerraba el modo cine en vez de pausar.
 *  · V-NUEVO-9: el anillo de preparación se anuncia «Preparado al N %».
 */

describe('V-NUEVO-8 · el teclado del modo cine', () => {
  const boton = { closest: (s: string) => (s.includes('[role="button"]') ? {} : null) }
  const fondo = { closest: () => null }

  it('Espacio fuera de un botón = ▶/⏸; flechas = frase anterior/siguiente', () => {
    expect(accionDeTecla(' ', fondo as unknown as EventTarget)).toBe('onAlternar')
    expect(accionDeTecla(' ', null)).toBe('onAlternar')
    expect(accionDeTecla('ArrowLeft', boton as unknown as EventTarget)).toBe('onFraseAnterior')
    expect(accionDeTecla('ArrowRight', fondo as unknown as EventTarget)).toBe('onFraseSiguiente')
    expect(accionDeTecla('a', fondo as unknown as EventTarget)).toBeNull()
  })

  it('Espacio con el foco en un botón (▶ o «Salir»): lo hace el botón, no el atajo (sin doble cambio)', () => {
    expect(accionDeTecla(' ', boton as unknown as EventTarget)).toBeNull()
  })
})

describe('V-NUEVO-9 · el anillo de preparación se anuncia', () => {
  const antes = Platform.OS
  afterEach(() => {
    Platform.OS = antes
  })

  it('en la web es una barra de progreso con «Preparado al N %» y el ▶ lo dice en su nombre', () => {
    Platform.OS = 'web'
    const r = render(
      <BotonLaton sonando={false} ocupado enError={false} onPress={() => {}} progreso={0.33} testID="boton-play" />,
    )
    const anillo = r.UNSAFE_root.findAll((n: { props?: { role?: string } }) => n.props?.role === 'progressbar')[0]
    expect(anillo.props['aria-valuetext']).toBe('Preparado al 33 %')
    expect(anillo.props['aria-valuenow']).toBe(33)
    expect(anillo.props['aria-hidden']).toBeUndefined()
    expect(r.getByTestId('boton-play').props.accessibilityLabel).toBe('Reproducir (preparado al 33 %)')
  })

  it('sin progreso conocido no hay barra y el nombre es el de siempre', () => {
    Platform.OS = 'web'
    const r = render(
      <BotonLaton sonando={false} ocupado={false} enError={false} onPress={() => {}} testID="boton-play" />,
    )
    expect(r.UNSAFE_root.findAll((n: { props?: { role?: string } }) => n.props?.role === 'progressbar')).toHaveLength(0)
    expect(r.getByTestId('boton-play').props.accessibilityLabel).toBe('Reproducir')
  })
})
