/*
 * Las piezas del reproductor 0.4.0: tarjeta de capítulo (F4), sello (F10),
 * muescas de 44 px (E10), portada según el alto (UX5-01) y el modo cine (F8).
 */
import React from 'react'

import { act, render } from '@testing-library/react-native'

import { muescasQueCaben } from '@componentes/reproductor/ControlesVoz'
import { partirPorPalabra } from '@componentes/reproductor/ModoCine'
import { TEXTOS_SELLO, textoSello } from '@componentes/reproductor/SelloGuardado'
import TarjetaCapitulo, { AVISO_MS, anuncioDeCapitulo } from '@componentes/reproductor/TarjetaCapitulo'
import { ThemeProvider } from '@contextos/ThemeContext'
import { anchoDePortada } from '@pantallas/reproductor/ReproductorScreen'
import type { CapituloResumen } from '@tipos'

const CAPS: CapituloResumen[] = [
  { indice: 0, titulo: 'Primero', minutos: 2 },
  { indice: 1, titulo: 'Apartado', minutos: 3, enVoz: false },
  { indice: 2, titulo: 'Tercero', minutos: 9 },
]
const base = {
  capitulo: 0,
  posicion: 90,
  duracion: 100,
  velocidad: 1,
  fase: 'reproduciendo' as const,
  temporizador: null,
  finDelLibro: false,
}

describe('Tarjeta de capítulo (F4)', () => {
  it('anuncia el siguiente con voz en los últimos 20 s, a la velocidad elegida', () => {
    expect(anuncioDeCapitulo(base, CAPS)).toBe('Siguiente: «Tercero» · 9 min')
    expect(anuncioDeCapitulo({ ...base, velocidad: 3, posicion: 50 }, CAPS)).toBe('Siguiente: «Tercero» · 3 min')
    expect(anuncioDeCapitulo({ ...base, posicion: 50 }, CAPS)).toBeNull()
    expect(anuncioDeCapitulo({ ...base, fase: 'pausado' }, CAPS)).toBeNull()
    expect(anuncioDeCapitulo({ ...base, temporizador: { tipo: 'capitulo' } }, CAPS)).toBeNull()
    expect(anuncioDeCapitulo({ ...base, capitulo: 2 }, CAPS)).toBeNull()
  })

  it('el aviso «Ahora: …» aparece al cambiar y se va solo aunque cambie la fase', () => {
    jest.useFakeTimers()
    try {
      const fn = jest.fn()
      const r = render(
        <ThemeProvider>
          <TarjetaCapitulo v={{ ...base, posicion: 0 }} capitulos={CAPS} onVolverAEmpezar={fn} />
        </ThemeProvider>,
      )
      expect(r.queryByTestId('tarjeta-capitulo')).toBeNull()
      r.rerender(
        <ThemeProvider>
          <TarjetaCapitulo
            v={{ ...base, capitulo: 2, posicion: 0, fase: 'cargando' }}
            capitulos={CAPS}
            onVolverAEmpezar={fn}
          />
        </ThemeProvider>,
      )
      expect(r.getByText('Ahora: «Tercero»')).toBeTruthy()
      r.rerender(
        <ThemeProvider>
          <TarjetaCapitulo v={{ ...base, capitulo: 2, posicion: 1 }} capitulos={CAPS} onVolverAEmpezar={fn} />
        </ThemeProvider>,
      )
      act(() => {
        jest.advanceTimersByTime(AVISO_MS + 500)
      })
      expect(r.queryByText('Ahora: «Tercero»')).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('al acabar el libro ofrece «Volver a empezar»', () => {
    const fn = jest.fn()
    const r = render(
      <ThemeProvider>
        <TarjetaCapitulo v={{ ...base, fase: 'pausado', finDelLibro: true }} capitulos={CAPS} onVolverAEmpezar={fn} />
      </ThemeProvider>,
    )
    expect(r.getByText('Has terminado el libro')).toBeTruthy()
    expect(r.getByTestId('volver-a-empezar')).toBeTruthy()
  })
})

describe('Sello de guardado (F10)', () => {
  it('dice guardado con la hora o pendiente; nada si no se guardó aún', () => {
    expect(textoSello(null)).toBeNull()
    expect(textoSello({ estado: 'pendiente', en: 0 })).toBe(TEXTOS_SELLO.pendiente)
    expect(textoSello({ estado: 'ok', en: Date.parse('2026-11-14T15:42:00Z') })).toMatch(/^Guardado en casa · /)
  })
})

describe('Muescas y portada (E10, UX5-01)', () => {
  it('caben 7 muescas de 44 px; si no, se quitan 4x y luego 1,5x (0,5x siempre)', () => {
    expect(muescasQueCaben(320)).toHaveLength(7)
    expect(muescasQueCaben(290)).toEqual([0.5, 1, 1.5, 2, 3, 5])
    expect(muescasQueCaben(250)).toEqual([0.5, 1, 2, 3, 5])
    expect(muescasQueCaben(0)).toHaveLength(7) // aún sin medir
  })

  it('la portada se ajusta al alto y nunca baja de 80 px', () => {
    expect(anchoDePortada(375, 667, false)).toBeLessThanOrEqual(160)
    expect(anchoDePortada(390, 844, false)).toBeGreaterThan(anchoDePortada(375, 667, false))
    expect(anchoDePortada(844, 390, true)).toBeLessThanOrEqual(200)
    expect(anchoDePortada(320, 400, false)).toBe(80)
    expect(anchoDePortada(1440, 900, false)).toBeLessThanOrEqual(260)
  })
})

describe('Modo cine (F8)', () => {
  it('parte la frase por la palabra que suena', () => {
    expect(partirPorPalabra('Hola mundo bonito', [5, 10])).toEqual(['Hola ', 'mundo', ' bonito'])
    expect(partirPorPalabra('Hola', null)).toEqual(['Hola', '', ''])
    expect(partirPorPalabra('Hola', [2, 99])).toEqual(['Hola', '', ''])
  })
})
