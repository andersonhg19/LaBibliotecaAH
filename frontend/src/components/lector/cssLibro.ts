import { GeometriaHoja, MESA, cssHojas } from '@componentes/lector/hojas'
import { CSS_TRADUCCION } from '@componentes/lector/traduccion'
import type { Preferencias } from '@contextos/PreferenciasContext'
import { FUENTES_LECTOR, formatoFuente } from '@tema/fuentes'
import { PAPELES } from '@tema/papel'

/** Por debajo de este ancho de pantalla, la columna es estrecha (móvil en vertical). */
export const ANCHO_ESTRECHO = 600

const origen = () => (typeof location !== 'undefined' ? location.origin : '')

/*
 * EL CSS QUE SE INYECTA DENTRO DEL LIBRO.
 *
 * Sin ríos de espacios: partición silábica (`hyphens:auto`, con
 * `-webkit-hyphens` para Safari y el `lang` del libro en el documento) y
 * `text-wrap:pretty` donde el navegador lo soporte. En columnas estrechas
 * (móvil), además, alineación a la izquierda: en 30 caracteres por línea la
 * justificación abre huecos aunque se partan palabras (como hacen Apple Books
 * y Kindle en el teléfono). En el PC, justificado.
 */
export function cssDelLibro(p: Preferencias, o: { estrecho?: boolean; hojas?: GeometriaHoja | null } = {}): string {
  const papel = PAPELES[p.temaPapel]
  const f = FUENTES_LECTOR.find((x) => x.clave === p.fuente) ?? FUENTES_LECTOR[0]
  const caras = FUENTES_LECTOR.map(
    (x) =>
      `@font-face{font-family:'${x.nombre}';src:url('${origen()}/fuentes/${x.archivo}') format('${formatoFuente(x.archivo)}');font-style:normal;font-display:swap}
@font-face{font-family:'${x.nombre}';src:url('${origen()}/fuentes/${x.cursiva}') format('${formatoFuente(x.cursiva)}');font-style:italic;font-display:swap}`,
  ).join('\n')
  const alineacion = o.estrecho ? 'left' : 'justify'
  return `${caras}
html{background:${papel.fondo}!important;color:${papel.tinta}!important;color-scheme:${p.temaPapel === 'noche' ? 'dark' : 'light'}}
body{font-family:${f.css}!important;font-size:${p.tamano}%!important;color:${papel.tinta}!important;background:transparent!important;font-variant-numeric:lining-nums}
p,li,blockquote,dd,div{line-height:${p.interlineado}!important;-webkit-hyphens:auto!important;-ms-hyphens:auto;hyphens:auto!important;hyphenate-limit-chars:6 3 2;-webkit-hyphenate-limit-before:3;-webkit-hyphenate-limit-after:2;widows:2;orphans:2;overflow-wrap:break-word}
p{text-align:${alineacion}!important;text-wrap:pretty}
h1,h2,h3{font-family:${f.css};font-weight:600;color:${papel.tinta};text-wrap:balance;-webkit-hyphens:manual;hyphens:manual}
a:link,a:visited{color:${papel.enlace}}
::selection{background:${papel.seleccion}}
.bah-f{border-radius:3px;transition:background-color 180ms ease}
.bah-voz{background-color:${p.temaPapel === 'noche' ? 'rgba(217,163,91,0.32)' : 'rgba(217,163,91,0.42)'};box-decoration-break:clone;-webkit-box-decoration-break:clone}
::highlight(bah-palabra){background-color:${p.temaPapel === 'noche' ? 'rgba(201,162,39,0.6)' : 'rgba(201,162,39,0.55)'};color:inherit}
img{max-width:100%;height:auto}
${CSS_TRADUCCION}${o.hojas ? cssHojas(o.hojas, papel, MESA[p.temaPapel], p.temaPapel === 'noche') : ''}`
}
