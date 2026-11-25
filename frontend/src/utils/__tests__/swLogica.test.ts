/*
 * LA LÓGICA DEL SERVICE WORKER (0.5.0, contrato C12): public/sw-logica.js, la misma que carga
 * public/sw.js con importScripts. Clave sin token, qué estrategia toca a cada petición,
 * rangos 206 para el <audio>, cachés por versión y copias separadas por usuario.
 */
import { claveEstado as claveEstadoWeb, nombreCacheLibro, sinToken as sinTokenWeb } from '@utils/sinConexion'

interface Rango {
  inicio: number
  fin: number
}
interface SwLogica {
  CACHE_API: string
  sinToken(u: string): string
  rutaApi(u: string): string | null
  esArchivoLibro(r: string): boolean
  estrategia(p: { url: string; metodo?: string; origen: string; modo?: string }): string | null
  huella(t: string): string
  usuarioDeAutorizacion(c: string | null): string
  claveApi(url: string, cuerpo: string, usuario: string): string
  claveEstado(origen: string, cuerpo: string): string | null
  nombreCacheApp(v: string): string
  nombreCacheLibro(id: string): string
  cachesSobrantes(nombres: string[], v: string): string[]
  rango(c: string | null, total: number): Rango | 'fuera' | null
  cabecerasParcial(r: Rango, total: number, tipo: string): Record<string, string>
  guardable(r: { status: number; type: string } | null): boolean
}

const L = require('../../../public/sw-logica.js') as SwLogica

const WEB = 'https://casa.ejemplo:7050'
const API = 'https://casa.ejemplo:7051/BIBLIOTECA-SERVICE/biblioteca/v1'
const AUDIO = `${API}/archivos/a1/audio/edge.es-ES-AlvaroNeural/cap-003.m4a`

const jwt = (payload: object) =>
  `Bearer xx.${Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.firma`

describe('C12 · clave de caché sin el token', () => {
  it('quita `t` (el token caduca; la copia no) y deja lo demás', () => {
    expect(L.sinToken(`${AUDIO}?t=abc.def`)).toBe(AUDIO)
    expect(L.sinToken(`${API}/voz/preparar-libro?ejemplarId=e1&t=tok&vozId=v`)).toBe(
      `${API}/voz/preparar-libro?ejemplarId=e1&vozId=v`,
    )
    expect(L.sinToken(AUDIO)).toBe(AUDIO)
  })

  it('la web (utils/sinConexion) calcula las mismas claves que el service worker', () => {
    for (const u of [`${AUDIO}?t=1`, `${API}/archivos/a1/frases/cap-003.json?t=x%20y`, `${API}/x?a=1&t=2&b=3`])
      expect(sinTokenWeb(u)).toBe(L.sinToken(u))
    const cuerpo = JSON.stringify({ ejemplarId: 'e1', vozId: 'edge.es-ES-AlvaroNeural', capitulo: 3, reintentar: true })
    expect(L.claveEstado(WEB, cuerpo)).toBe(claveEstadoWeb(WEB, 'e1', 'edge.es-ES-AlvaroNeural', 3))
    expect(L.nombreCacheLibro('e1')).toBe(nombreCacheLibro('e1'))
  })

  it('el estado de un capítulo: sin libro, voz o capítulo válido no hay clave', () => {
    expect(L.claveEstado(WEB, '{"ejemplarId":"e1","vozId":"v"}')).toBeNull()
    expect(L.claveEstado(WEB, '{"ejemplarId":"e1","vozId":"v","capitulo":-1}')).toBeNull()
    expect(L.claveEstado(WEB, 'no es json')).toBeNull()
  })
})

describe('C12 · qué estrategia toca a cada petición', () => {
  const e = (url: string, metodo = 'GET', modo?: string) => L.estrategia({ url, metodo, origen: WEB, modo })

  it('la app: navegación (red primero) y estáticos del propio origen (caché primero)', () => {
    expect(e(`${WEB}/biblioteca/libro/e1`, 'GET', 'navigate')).toBe('navegacion')
    expect(e(`${WEB}/_expo/static/js/web/index-1fcac599.js`)).toBe('app')
    expect(e(`${WEB}/fuentes/Literata-Regular.ttf`)).toBe('app')
    expect(e(`${WEB}/iconos/icono-512.png`)).toBe('app')
    expect(e(`${WEB}/demo/libros/x/libro.epub`)).toBeNull()
    expect(e('https://otro.sitio/_expo/static/js/x.js')).toBeNull()
  })

  it('la API: lecturas sí (con o sin red), escrituras y otras rutas no', () => {
    expect(e(`${API}/libros/get/e1`, 'POST')).toBe('api')
    expect(e(`${API}/libros/all`, 'POST')).toBe('api')
    expect(e(`${API}/progreso/get/e1`, 'POST')).toBe('api')
    expect(e(`${API}/voces/all`, 'POST')).toBe('api')
    expect(e(`${API}/voz/preparar-libro?ejemplarId=e1&vozId=v`)).toBe('api')
    expect(e(`${API}/audio/estado`, 'POST')).toBe('estado')
    expect(e(`${API}/progreso/save`, 'POST')).toBeNull()
    expect(e(`${API}/diario`, 'POST')).toBeNull()
    expect(e(`${API}/sesiones/latido`, 'POST')).toBeNull()
    expect(e(`${API}/voz/preparar-libro`, 'POST')).toBeNull()
    expect(e(`${API.replace('BIBLIOTECA', 'AUTH')}/auth/login`, 'POST')).toBeNull()
  })

  it('los archivos de un libro: audio 1x/2x, tiempos, frases, portada y EPUB', () => {
    for (const f of ['cap-003.m4a', 'cap-003-2x.m4a', 'cap-003.tiempos.json', 'cap-003.parte-001.m4a'])
      expect(e(`${API}/archivos/a1/audio/v/${f}?t=x`)).toBe('libro')
    expect(e(`${API}/archivos/a1/frases/cap-003.json?t=x`)).toBe('libro')
    expect(e(`${API}/archivos/a1/portada.jpg?t=x`)).toBe('libro')
    expect(e(`${API}/archivos/a1/libro.epub?t=x`)).toBe('libro')
    expect(e(`${API}/archivos/a1/original?t=x`)).toBeNull()
    expect(e(`${API}/archivos/a1/audio/v/cap-003.m4a`, 'HEAD')).toBeNull()
  })

  it('la portada para la pantalla de bloqueo, desde el propio origen', () => {
    expect(e(`${WEB}/__bah/portada?u=${encodeURIComponent(`${API}/archivos/a1/portada.jpg?t=x`)}`)).toBe('portada')
  })
})

describe('C12 · rangos para el <audio> (206 desde la caché)', () => {
  it('bytes=a-b, a-, -n y fuera de rango', () => {
    expect(L.rango('bytes=0-1', 1000)).toEqual({ inicio: 0, fin: 1 })
    expect(L.rango('bytes=100-', 1000)).toEqual({ inicio: 100, fin: 999 })
    expect(L.rango('bytes=900-5000', 1000)).toEqual({ inicio: 900, fin: 999 })
    expect(L.rango('bytes=-100', 1000)).toEqual({ inicio: 900, fin: 999 })
    expect(L.rango('bytes=1000-', 1000)).toBe('fuera')
    expect(L.rango('bytes=5-2', 1000)).toBe('fuera')
    expect(L.rango(null, 1000)).toBeNull()
    expect(L.rango('items=0-1', 1000)).toBeNull()
  })

  it('cabeceras 206 coherentes', () => {
    expect(L.cabecerasParcial({ inicio: 100, fin: 199 }, 1000, 'audio/mp4')).toEqual({
      'Content-Type': 'audio/mp4',
      'Content-Length': '100',
      'Content-Range': 'bytes 100-199/1000',
      'Accept-Ranges': 'bytes',
    })
  })

  it('solo se guardan respuestas 200 legibles: nunca opacas (CORS mal puesto) ni parciales', () => {
    expect(L.guardable({ status: 200, type: 'cors' })).toBe(true)
    expect(L.guardable({ status: 200, type: 'basic' })).toBe(true)
    expect(L.guardable({ status: 0, type: 'opaque' })).toBe(false)
    expect(L.guardable({ status: 206, type: 'cors' })).toBe(false)
    expect(L.guardable({ status: 404, type: 'cors' })).toBe(false)
    expect(L.guardable(null)).toBe(false)
  })
})

describe('C12 · cachés por versión y por usuario', () => {
  it('al activar una versión nueva sobran solo las cachés de app viejas (nunca libros ni la API)', () => {
    const nombres = ['bah-app-aaa', 'bah-app-bbb', 'bah-api', 'bah-libro-e1', 'otra']
    expect(L.cachesSobrantes(nombres, 'bbb')).toEqual(['bah-app-aaa'])
    expect(L.nombreCacheApp('bbb')).toBe('bah-app-bbb')
  })

  it('la copia de una lectura es de quien la pidió: dos cuentas no comparten respuestas', () => {
    const ua = L.usuarioDeAutorizacion(jwt({ sub: '1' }))
    const ub = L.usuarioDeAutorizacion(jwt({ userId: 2 }))
    expect([ua, ub]).toEqual(['1', '2'])
    expect(L.usuarioDeAutorizacion(null)).toBe('anonimo')
    expect(L.usuarioDeAutorizacion('Bearer roto')).toBe('anonimo')
    const url = `${API}/libros/get/e1`
    expect(L.claveApi(url, '', ua)).not.toBe(L.claveApi(url, '', ub))
  })

  it('el cuerpo cuenta (canónico: el orden de las claves y `reintentar` no)', () => {
    const url = `${API}/libros/all`
    const a = L.claveApi(url, '{"pestana":"LEYENDO","texto":""}', '1')
    expect(L.claveApi(url, '{"texto":"","pestana":"LEYENDO"}', '1')).toBe(a)
    expect(L.claveApi(url, '{"pestana":"TODO","texto":""}', '1')).not.toBe(a)
    expect(L.claveApi(`${url}?t=tok`, '{"pestana":"LEYENDO","texto":""}', '1')).toBe(a)
    expect(L.huella('x')).toMatch(/^[0-9a-f]{8}$/)
  })
})
