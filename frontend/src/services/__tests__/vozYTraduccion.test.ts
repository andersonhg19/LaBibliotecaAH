import api from '@servicios/api'
import { audioService, cuerpoEstadoAudio, traduccionService } from '@servicios/bibliotecaService'

jest.mock('@servicios/api', () => ({
  __esModule: true,
  default: { post: jest.fn(async () => ({ data: { correct: true, message: 'OK', errorCode: 0, object: null } })) },
}))
const post = api.post as jest.Mock
const B = '/BIBLIOTECA-SERVICE/biblioteca/v1'

beforeEach(() => post.mockClear())

describe('Contrato v1.2 de /audio/estado', () => {
  it('el reintento explícito de un capítulo en ERROR manda `reintentar: true` (y solo entonces)', async () => {
    await audioService.estado({ ejemplarId: 'e1', vozId: 'v', capitulo: 2 }, { reintentar: true })
    expect(post).toHaveBeenLastCalledWith(`${B}/audio/estado`, {
      ejemplarId: 'e1',
      vozId: 'v',
      capitulo: 2,
      reintentar: true,
    })
    await audioService.estado({ ejemplarId: 'e1', vozId: 'v', capitulo: 2 })
    expect(post).toHaveBeenLastCalledWith(`${B}/audio/estado`, { ejemplarId: 'e1', vozId: 'v', capitulo: 2 })
    expect(cuerpoEstadoAudio({ ejemplarId: 'e', vozId: 'v', capitulo: 0 })).not.toHaveProperty('reintentar')
  })
})

describe('Traducción', () => {
  it('traducir manda texto, origen y destino', async () => {
    await traduccionService.traducir({ texto: 'Hello', destino: 'es' })
    expect(post).toHaveBeenLastCalledWith(`${B}/traducir`, { texto: 'Hello', origen: 'auto', destino: 'es' })
  })
  it('no manda más de 5000 caracteres', async () => {
    await traduccionService.traducir({ texto: 'a'.repeat(6000) })
    expect(post.mock.calls[0][1].texto).toHaveLength(5000)
  })
  it('el capítulo se pide por ejemplar y número', async () => {
    await traduccionService.capitulo({ ejemplarId: 'e1', capitulo: 3 })
    expect(post).toHaveBeenLastCalledWith(`${B}/traducir/capitulo`, { ejemplarId: 'e1', capitulo: 3, destino: 'es' })
  })
  it('si el servidor aún no tiene la ruta (404) se dice con un mensaje claro, sin romper', async () => {
    post.mockRejectedValueOnce({ response: { status: 404 } })
    const r = await traduccionService.traducir({ texto: 'Hello' })
    expect(r.correct).toBe(false)
    expect(r.message).toMatch(/todavía no está disponible/)
  })
})
