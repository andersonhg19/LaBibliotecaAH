import React from 'react'

import { render, waitFor } from '@testing-library/react-native'

import { PreferenciasProvider } from '@contextos/PreferenciasContext'
import { ThemeProvider } from '@contextos/ThemeContext'
import { diaLegible, fechaCasa, periodo, rellenarDias, textoRacha } from '@logica/estadisticas'
import EstadisticasScreen, { DIAS_PERIODO } from '@pantallas/estadisticas/EstadisticasScreen'
import { librosService } from '@servicios/bibliotecaService'
import { obtenerResumen } from '@servicios/sesionesService'

/* F12 · estadísticas: minutos por día y racha (contrato C4, GET /sesiones/resumen). */

jest.mock('@servicios/bibliotecaService')
jest.mock('@servicios/sesionesService', () => ({ obtenerResumen: jest.fn() }))
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true }),
}))
const mResumen = obtenerResumen as jest.Mock
const ok = <T,>(object: T) => ({ correct: true, message: 'OK', errorCode: 0, object })

const Envoltura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <PreferenciasProvider>{children}</PreferenciasProvider>
  </ThemeProvider>
)

describe('lógica', () => {
  it('el periodo va en la hora de la casa (Bogotá, UTC−5)', () => {
    // 14 nov 02:00 UTC = 13 nov 21:00 en Bogotá
    const ahora = new Date('2026-11-14T02:00:00Z')
    expect(fechaCasa(ahora)).toBe('2026-11-13')
    expect(periodo(30, ahora)).toEqual({ desde: '2026-10-15', hasta: '2026-11-13' })
  })
  it('rellena los días sin lectura con 0 y en orden', () => {
    const d = rellenarDias([{ fecha: '2026-11-03', minutos: 12.4 }], '2026-11-01', '2026-11-04')
    expect(d).toEqual([
      { fecha: '2026-11-01', minutos: 0 },
      { fecha: '2026-11-02', minutos: 0 },
      { fecha: '2026-11-03', minutos: 12 },
      { fecha: '2026-11-04', minutos: 0 },
    ])
  })
  it('textos', () => {
    expect(diaLegible('2026-11-03')).toBe('mar 3 nov')
    expect(textoRacha(0)).toBe('Sin racha todavía')
    expect(textoRacha(1)).toBe('1 día')
    expect(textoRacha(7)).toBe('7 días seguidos')
  })
})

describe('pantalla', () => {
  beforeEach(() => jest.clearAllMocks())
  it('racha, minutos, una barra por día y los libros con más tiempo', async () => {
    const { desde, hasta } = periodo(DIAS_PERIODO)
    mResumen.mockResolvedValue(
      ok({
        minutosLectura: 90,
        minutosVoz: 30,
        dias: [{ fecha: hasta, minutos: 45 }],
        rachaActual: 4,
        rachaMaxima: 9,
        libros: [{ ejemplarId: 'e1', minutos: 70 }],
      }),
    )
    ;(librosService.detalle as jest.Mock).mockResolvedValue(ok({ titulo: 'El faro' }))
    const r = render(<EstadisticasScreen />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('4')).toBeTruthy())
    expect(mResumen).toHaveBeenCalledWith(desde, hasta)
    expect(r.getByText('Tu mejor racha: 9 días seguidos')).toBeTruthy()
    expect(r.getByText('2 h')).toBeTruthy()
    expect(r.getByText('1 h 30 min leyendo · 30 min escuchando')).toBeTruthy()
    expect(r.getByTestId('grafico-dias').props.children).toHaveLength(DIAS_PERIODO)
    expect(r.getByText('El faro')).toBeTruthy()
    expect(r.getByText(new RegExp(`Tu mejor día: ${diaLegible(hasta)}, 45 min`))).toBeTruthy()
  })
  it('con un servidor sin la ruta (404) dice que llegará pronto', async () => {
    mResumen.mockRejectedValue({ response: { status: 404 } })
    const r = render(<EstadisticasScreen />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('Pronto')).toBeTruthy())
  })
  it('sin lecturas: lo explica', async () => {
    mResumen.mockResolvedValue(
      ok({ minutosLectura: 0, minutosVoz: 0, dias: [], rachaActual: 0, rachaMaxima: 0, libros: [] }),
    )
    const r = render(<EstadisticasScreen />, { wrapper: Envoltura })
    await waitFor(() => expect(r.getByText('Aún no hay lecturas')).toBeTruthy())
  })
})
