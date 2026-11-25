import { apiParaLaPagina, PUERTO_API_NOMBRE_PROPIO } from '@config/entorno'

const CASA = 'https://casa.ejemplo.ts.net:7051'

describe('apiParaLaPagina: la API que corresponde al nombre por el que se abrió la web', () => {
  it('abierta por el nombre de siempre, usa la API configurada', () => {
    expect(apiParaLaPagina(CASA, { protocol: 'https:', hostname: 'casa.ejemplo.ts.net' })).toBe(CASA)
  })

  it('abierta por su nombre propio, usa la API del mismo nombre en el puerto propio', () => {
    expect(apiParaLaPagina(CASA, { protocol: 'https:', hostname: 'biblioteca.ejemplo.ts.net' })).toBe(
      `https://biblioteca.ejemplo.ts.net:${PUERTO_API_NOMBRE_PROPIO}`,
    )
  })

  it('un nombre que no es el de la biblioteca no cambia nada', () => {
    expect(apiParaLaPagina(CASA, { protocol: 'https:', hostname: 'otra.ejemplo.ts.net' })).toBe(CASA)
  })

  it('en desarrollo (http, localhost) y sin ventana se queda con la configurada', () => {
    expect(apiParaLaPagina('http://localhost:9920', { protocol: 'http:', hostname: 'localhost' })).toBe(
      'http://localhost:9920',
    )
    expect(apiParaLaPagina(CASA, null)).toBe(CASA)
    expect(apiParaLaPagina(CASA, undefined)).toBe(CASA)
  })

  it('una URL configurada ilegible no rompe: se devuelve tal cual', () => {
    expect(apiParaLaPagina('no-es-url', { protocol: 'https:', hostname: 'biblioteca.ejemplo.ts.net' })).toBe(
      'no-es-url',
    )
  })
})
