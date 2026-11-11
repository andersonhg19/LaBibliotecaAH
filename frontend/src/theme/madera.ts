/*
 * TEXTURAS PROCEDURALES: madera, cuero, papel, latón, guardas y luz.
 *
 * Nada de imágenes con derechos ni pesadas: todo sale de gradientes CSS y de
 * ruido SVG (feTurbulence) incrustado como data URI. Pesa unos cientos de
 * bytes y se ve igual en el iPhone, en Android y en el PC.
 *
 * LA COSTURA (UX-05). La veta se repetía con una línea recta cada 400 px. El
 * ruido ya pedía `stitchTiles`, pero la región del filtro por defecto es un
 * 10 % más grande que el rectángulo (de -10 % a 120 %): el empalme se calculaba
 * para un mosaico de 480 px y luego se recortaba a 400. Con la región ajustada
 * al rectángulo (`x=0 y=0 width=100% height=100%`) el borde derecho empalma con
 * el izquierdo y el de abajo con el de arriba. `REGION` lo fija en TODAS las
 * texturas, y la prueba LaMaderaNoTieneCostura lo exige.
 *
 * Se usan solo en la web (la app es web). En las pruebas (que corren como
 * nativo) estos valores no se aplican: los componentes caen en el color plano.
 */
import { paleta } from '@tema/colors'

/** La región del filtro, igual al rectángulo: sin ella el mosaico no empalma. */
export const REGION = "x='0' y='0' width='100%' height='100%'"

const svg = (cuerpo: string, w = 400, h = 400) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${cuerpo}</svg>`,
  )}")`

const ruido = (
  frecuencia: string,
  matriz: string,
  { tipo = 'fractalNoise', octavas = 4, semilla = 7 }: { tipo?: string; octavas?: number; semilla?: number } = {},
) =>
  `<filter id='f' ${REGION}><feTurbulence stitchTiles='stitch' type='${tipo}' baseFrequency='${frecuencia}' numOctaves='${octavas}' seed='${semilla}'/>` +
  `<feColorMatrix values='${matriz}'/></filter><rect width='100%' height='100%' filter='url(#f)'/>`

/** Veta de madera: ruido estirado en horizontal (fibras largas). */
export const vetaHorizontal = svg(ruido('0.004 0.09', '0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0 0.03  0 0 0 0.55 0'))

/** Veta vertical (los costados y el fondo del mueble). */
export const vetaVertical = svg(
  ruido('0.08 0.005', '0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0.6 0', { semilla: 3 }),
)

/** Veta vertical muy tenue para la pared clara del tema de día. */
export const vetaClara = svg(
  ruido('0.06 0.004', '0 0 0 0 0.45  0 0 0 0 0.28  0 0 0 0 0.12  0 0 0 0.16 0', { semilla: 13 }),
)

/** Grano fino de cuero o tela (portadas generadas, lomos). */
export const granoCuero = svg(
  ruido('0.9', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0', { tipo: 'turbulence', octavas: 2, semilla: 11 }),
  200,
  200,
)

/** Papel: fibras muy suaves para las fichas y las hojas. */
export const fibraPapel = svg(
  ruido('0.65', '0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.08 0', { octavas: 3, semilla: 5 }),
  300,
  300,
)

/** Latón cepillado: rayas finas horizontales. */
export const cepilladoLaton = svg(
  ruido('0.002 0.6', '0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.8  0 0 0 0.12 0', { octavas: 2, semilla: 21 }),
  200,
  200,
)

/*
 * GUARDAS MARMOLADAS (UX-26): el reverso de la tapa ya no son lunares. Ruido
 * fractal alargado que se pasa por una "tabla de colores" (feComponentTransfer):
 * cada nivel del ruido cae en un tono de la paleta (nogal, burdeos, cedro, miel,
 * pergamino), y salen las vetas onduladas del papel de aguas de los libros
 * antiguos. Una sola imagen de ~1 KB.
 */
const tabla = (tonos: string[], canal: 0 | 1 | 2) =>
  tonos.map((t) => (parseInt(t.slice(1 + canal * 2, 3 + canal * 2), 16) / 255).toFixed(2)).join(' ')
const TONOS_GUARDA = [
  paleta.nogal,
  paleta.burdeos,
  paleta.cedro,
  paleta.miel,
  paleta.pergamino,
  paleta.miel,
  paleta.cedro,
  paleta.burdeos,
  paleta.nogal,
  paleta.cueroVerde,
  paleta.nogal,
]
export const guardaMarmolada = svg(
  `<filter id='m' ${REGION}><feTurbulence stitchTiles='stitch' type='fractalNoise' baseFrequency='0.006 0.028' numOctaves='4' seed='9'/>` +
    `<feColorMatrix type='matrix' values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1'/>` +
    `<feComponentTransfer><feFuncR type='table' tableValues='${tabla(TONOS_GUARDA, 0)}'/><feFuncG type='table' tableValues='${tabla(TONOS_GUARDA, 1)}'/><feFuncB type='table' tableValues='${tabla(TONOS_GUARDA, 2)}'/></feComponentTransfer>` +
    `</filter><rect width='100%' height='100%' filter='url(#m)'/>`,
  320,
  480,
)

/** El fondo del mueble (detrás de los libros): madera con veta vertical, iluminada al centro. */
export const fondoMueble = (oscuro: boolean) =>
  oscuro
    ? `${vetaVertical}, linear-gradient(90deg, #1A0E07 0%, ${paleta.robleOscuro} 18%, #3A2416 50%, ${paleta.robleOscuro} 82%, #1A0E07 100%)`
    : `${vetaVertical}, linear-gradient(90deg, #8A5A30 0%, #B07A45 22%, #C08A52 50%, #B07A45 78%, #8A5A30 100%)`

/** La tabla del estante: canto iluminado arriba, frente con veta, sombra abajo. */
export const tablaEstante = (oscuro: boolean) =>
  `${vetaHorizontal}, linear-gradient(180deg, ${oscuro ? '#B5814A' : '#E0B57E'} 0%, ${oscuro ? '#8B5A2B' : '#C08A52'} 18%, ${oscuro ? '#6E4524' : '#A87440'} 45%, ${oscuro ? paleta.nogal : '#7E5230'} 100%)`

/** Los costados del mueble (montantes): veta vertical, canto biselado. */
export const montante = (oscuro: boolean) =>
  `${vetaVertical}, linear-gradient(90deg, ${oscuro ? '#2A170C' : '#7E5230'} 0%, ${oscuro ? '#8B5A2B' : '#D49A5E'} 22%, ${oscuro ? '#6E4524' : '#B98149'} 55%, ${oscuro ? '#4A2E1C' : '#9A6935'} 85%, ${oscuro ? '#1E110A' : '#6E4524'} 100%)`

/** La cornisa: moldura con dentellones, canto de luz y sombra debajo. */
export const cornisa = (oscuro: boolean) =>
  `${vetaHorizontal}, repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 14px, rgba(0,0,0,0.28) 14px 18px), linear-gradient(180deg, ${oscuro ? '#C08A52' : '#EBC48F'} 0%, ${oscuro ? '#8B5A2B' : '#C99560'} 16%, ${oscuro ? '#5A3820' : '#A87440'} 52%, ${oscuro ? '#3A2416' : '#86582F'} 100%)`

/** Latón pulido (placas, sujetalibros, tornillos). */
export const laton = `${cepilladoLaton}, linear-gradient(180deg, #F3DC97 0%, #D9B95A 38%, #B8902C 70%, #8C6A1C 100%)`

/** Luz cálida de lámpara de biblioteca, desde arriba. */
export const luzLampara = (oscuro: boolean) =>
  oscuro
    ? 'radial-gradient(ellipse 70% 55% at 50% -8%, rgba(255,196,120,0.30) 0%, rgba(255,170,90,0.10) 45%, rgba(0,0,0,0) 72%)'
    : 'radial-gradient(ellipse 70% 55% at 50% -8%, rgba(255,236,190,0.65) 0%, rgba(255,220,160,0.18) 45%, rgba(0,0,0,0) 72%)'

/** El haz de la lámpara de banquero sobre las baldas de arriba. */
export const hazLampara = (oscuro: boolean) =>
  oscuro
    ? 'radial-gradient(ellipse 60% 85% at 50% 0%, rgba(255,205,130,0.34) 0%, rgba(255,180,100,0.14) 40%, rgba(0,0,0,0) 75%)'
    : 'linear-gradient(118deg, rgba(255,250,235,0) 18%, rgba(255,248,226,0.45) 34%, rgba(255,248,226,0.12) 46%, rgba(255,250,235,0) 58%)'

/*
 * EL FONDO DE CADA SALA: pared de madera con la luz cálida de la lámpara arriba
 * y una viñeta abajo; de día (UX-16), pared marfil con veta clara muy tenue y un
 * haz de ventana en diagonal: la misma casa, otra hora.
 */
export const fondoSala = (oscuro: boolean) =>
  oscuro
    ? `${luzLampara(true)}, radial-gradient(ellipse at 50% 120%, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%), ${vetaVertical}, linear-gradient(180deg, #2A190E 0%, #1C1009 100%)`
    : `${hazLampara(false)}, radial-gradient(ellipse at 50% 120%, rgba(110,69,36,0.16), rgba(0,0,0,0) 60%), ${vetaClara}, ${fibraPapel}, linear-gradient(180deg, ${paleta.marfil} 0%, #F1E6CC 100%)`

/** Cuero de una portada generada, a partir de su color base. */
export const cuero = (base: string) =>
  `${granoCuero}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.16), rgba(0,0,0,0) 55%), radial-gradient(ellipse at 80% 100%, rgba(0,0,0,0.45), rgba(0,0,0,0) 60%), linear-gradient(135deg, ${base}, ${base})`

/**
 * Lomo: luz de cilindro, sombra en los cantos, grano encima. La franja central
 * (donde va el título) NO se aclara: el dorado tiene que leerse a 4,5:1 sobre
 * el cuero tal cual (UX-27); el brillo va a los lados.
 */
export const lomo = (base: string, tumbado = false) =>
  `${granoCuero}, linear-gradient(${tumbado ? 180 : 90}deg, rgba(0,0,0,0.45) 0%, rgba(255,255,255,0.12) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(255,255,255,0.06) 82%, rgba(0,0,0,0.50) 100%), linear-gradient(0deg, ${base}, ${base})`

/** Archivador (documentos): metal pintado verde cuero. */
export const archivador = (oscuro: boolean) =>
  `${granoCuero}, linear-gradient(180deg, ${oscuro ? '#3C5A48' : '#46664F'} 0%, ${paleta.cueroVerde} 100%)`
