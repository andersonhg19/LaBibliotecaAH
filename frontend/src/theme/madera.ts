/*
 * TEXTURAS PROCEDURALES: madera, cuero, papel y luz de lámpara.
 *
 * Nada de imágenes con derechos: todo sale de gradientes CSS y de ruido SVG
 * (feTurbulence) incrustado como data URI. Pesa unos cientos de bytes y se ve
 * igual en el iPhone, en Android y en el PC.
 *
 * Se usan solo en la web (la app es web). En las pruebas (que corren como
 * nativo) estos valores no se aplican: los componentes caen en el color plano.
 */
import { paleta } from '@tema/colors'

const svg = (cuerpo: string, w = 400, h = 400) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${cuerpo}</svg>`,
  )}")`

/** Veta de madera: ruido estirado en horizontal (fibras largas). */
export const vetaHorizontal = svg(
  `<filter id='f'><feTurbulence stitchTiles='stitch' type='fractalNoise' baseFrequency='0.004 0.09' numOctaves='4' seed='7'/>` +
    `<feColorMatrix values='0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0 0.03  0 0 0 0.55 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#f)'/>`,
)

/** Veta vertical (los costados y el fondo del mueble). */
export const vetaVertical = svg(
  `<filter id='f'><feTurbulence stitchTiles='stitch' type='fractalNoise' baseFrequency='0.08 0.005' numOctaves='4' seed='3'/>` +
    `<feColorMatrix values='0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0.6 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#f)'/>`,
)

/** Grano fino de cuero o tela (portadas generadas, lomos). */
export const granoCuero = svg(
  `<filter id='f'><feTurbulence stitchTiles='stitch' type='turbulence' baseFrequency='0.9' numOctaves='2' seed='11'/>` +
    `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#f)'/>`,
  200,
  200,
)

/** Papel: fibras muy suaves para el lector y las fichas. */
export const fibraPapel = svg(
  `<filter id='f'><feTurbulence stitchTiles='stitch' type='fractalNoise' baseFrequency='0.65' numOctaves='3' seed='5'/>` +
    `<feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.08 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#f)'/>`,
  300,
  300,
)

/** El fondo del mueble (detrás de los libros): madera oscura con veta vertical y sombra interior. */
export const fondoMueble = (oscuro: boolean) =>
  oscuro
    ? `${vetaVertical}, linear-gradient(90deg, #1A0E07 0%, ${paleta.robleOscuro} 18%, #352013 50%, ${paleta.robleOscuro} 82%, #1A0E07 100%)`
    : `${vetaVertical}, linear-gradient(90deg, #5C3A1E 0%, ${paleta.roble} 20%, #9A6935 50%, ${paleta.roble} 80%, #5C3A1E 100%)`

/** La tabla del estante: canto iluminado arriba, frente con veta, sombra abajo. */
export const tablaEstante = (oscuro: boolean) =>
  `${vetaHorizontal}, linear-gradient(180deg, ${oscuro ? '#9A6A3C' : '#C08A52'} 0%, ${oscuro ? '#6E4524' : '#A0703E'} 22%, ${oscuro ? paleta.nogal : '#7E5230'} 100%)`

/** Luz cálida de lámpara de biblioteca, desde arriba. */
export const luzLampara = (oscuro: boolean) =>
  oscuro
    ? 'radial-gradient(ellipse 70% 55% at 50% -8%, rgba(255,196,120,0.30) 0%, rgba(255,170,90,0.10) 45%, rgba(0,0,0,0) 72%)'
    : 'radial-gradient(ellipse 70% 55% at 50% -8%, rgba(255,236,190,0.65) 0%, rgba(255,220,160,0.18) 45%, rgba(0,0,0,0) 72%)'

/** El fondo general de la app: madera de pared + lámpara + viñeta. */
export const fondoSala = (oscuro: boolean) =>
  oscuro
    ? `${luzLampara(true)}, radial-gradient(ellipse at 50% 120%, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%), ${vetaVertical}, linear-gradient(180deg, #2A190E 0%, #1C1009 100%)`
    : `${luzLampara(false)}, ${fibraPapel}, linear-gradient(180deg, ${paleta.marfil} 0%, ${paleta.pergamino} 100%)`

/** Cuero de una portada generada, a partir de su color base. */
export const cuero = (base: string) =>
  `${granoCuero}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.16), rgba(0,0,0,0) 55%), radial-gradient(ellipse at 80% 100%, rgba(0,0,0,0.45), rgba(0,0,0,0) 60%), linear-gradient(135deg, ${base}, ${base})`

/** Lomo: luz en el centro (cilindro), sombra en los cantos, grano encima. */
export const lomo = (base: string) =>
  `${granoCuero}, linear-gradient(90deg, rgba(0,0,0,0.45) 0%, rgba(255,255,255,0.10) 28%, rgba(255,255,255,0.18) 45%, rgba(0,0,0,0.05) 70%, rgba(0,0,0,0.50) 100%), linear-gradient(0deg, ${base}, ${base})`

/** Archivador (documentos): metal pintado verde cuero. */
export const archivador = (oscuro: boolean) =>
  `${granoCuero}, linear-gradient(180deg, ${oscuro ? '#3C5A48' : '#46664F'} 0%, ${paleta.cueroVerde} 100%)`
