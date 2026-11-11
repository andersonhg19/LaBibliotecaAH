import { API_URL, BIBLIOTECA_PREFIJO, MODO_DEMO } from '@config'
import { tokenActual } from '@servicios/api'

/*
 * URL DE LOS BINARIOS (contratos §9, excepción documentada).
 *
 * El <audio> y el lector piden los archivos solos, sin poder mandar cabeceras.
 * Por eso los binarios van por GET y llevan el token en `?t=`.
 *
 * Las rutas que devuelve el servidor (url1x, url2x, urlTiempos) pueden venir
 * absolutas, con el prefijo del gateway o solo como `/v1/...`: aquí se
 * normalizan todas a una URL completa con su token.
 */

const conToken = (url: string, token: string | null = tokenActual()): string => {
  if (!token || MODO_DEMO) return url
  if (/[?&]t=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`
}

/** Convierte cualquier ruta de binario que dé el servidor en una URL absoluta con token. */
export const urlBinaria = (ruta: string | null | undefined, token: string | null = tokenActual()): string | null => {
  if (!ruta) return null
  if (/^(https?:|blob:|data:)/i.test(ruta)) return conToken(ruta, token)
  if (MODO_DEMO && ruta.startsWith('/demo/')) return ruta
  let absoluta: string
  if (ruta.startsWith('/BIBLIOTECA-SERVICE/')) absoluta = `${API_URL}${ruta}`
  else if (ruta.startsWith('/biblioteca/v1/')) absoluta = `${API_URL}/BIBLIOTECA-SERVICE${ruta}`
  else if (ruta.startsWith('/v1/')) absoluta = `${API_URL}/BIBLIOTECA-SERVICE/biblioteca${ruta}`
  else absoluta = `${API_URL}${BIBLIOTECA_PREFIJO}/${ruta.replace(/^\/+/, '')}`
  return conToken(absoluta, token)
}

const base = (archivoId: string) => `${API_URL}${BIBLIOTECA_PREFIJO}/archivos/${encodeURIComponent(archivoId)}`

/** El EPUB normalizado (con un id por frase) que abre el lector. */
export const urlLibro = (archivoId: string): string =>
  MODO_DEMO ? `/demo/libros/${archivoId}/libro.epub` : conToken(`${base(archivoId)}/libro.epub`)

/** La portada (si `tienePortada`). */
export const urlPortada = (archivoId: string): string =>
  MODO_DEMO ? `/demo/libros/${archivoId}/portada.svg` : conToken(`${base(archivoId)}/portada.jpg`)

/** El archivo tal como se subió. */
export const urlOriginal = (archivoId: string): string =>
  MODO_DEMO ? `/demo/libros/${archivoId}/libro.epub` : conToken(`${base(archivoId)}/original`)

/** La muestra de una voz (10 s). */
export const urlMuestraVoz = (vozId: string): string =>
  MODO_DEMO
    ? '/demo/voces/muestra.wav'
    : conToken(`${API_URL}${BIBLIOTECA_PREFIJO}/voces/${encodeURIComponent(vozId)}/muestra.mp3`)

/** Índice de capítulo con tres dígitos, como en los nombres de archivo (cap-007). */
export const nnn = (n: number) => String(n).padStart(3, '0')
