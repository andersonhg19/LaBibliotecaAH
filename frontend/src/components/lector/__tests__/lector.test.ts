import fs from 'fs'
import path from 'path'

import { capituloDeNota, capituloDeSeccion, debeReanclarEn, indiceDeCita } from '@componentes/lector/anclas'
import { cssDelLibro } from '@componentes/lector/cssLibro'
import { ALTO_BARRA_LECTOR, LECTOR_PAPEL } from '@componentes/lector/disenoLector'
import { minutosRestantes, paginaImpresa, textoFolio, textoQuedan } from '@componentes/lector/folio'
import { accionDelToque, debeOcultarBarra, esMovimientoDelUsuario, puntoSobreCajas } from '@componentes/lector/gestos'
import { elegirCorte, geometriaHoja, pasoDeCapitulo } from '@componentes/lector/hojas'
import { posicionMenu } from '@componentes/lector/menuSeleccion'
import { modoEfectivo, opcionesDeModo, ventanaBajaYAncha } from '@componentes/lector/modoLectura'
import { ofrecerTraduccion, textoTraducido } from '@componentes/lector/traduccion'
import { leerPreferencias } from '@contextos/PreferenciasContext'
import { teclaMueveDeslizador } from '@utils/teclas'

/*
 * Regresiones del QA del lector (documentación/pruebas/qa-lector-voz.md y
 * qa-ux-diseno.md). Lo que depende del DOM de foliate se comprueba aquí en sus
 * decisiones puras; el recorrido real, en el navegador sin cabeza.
 */

describe('QA LV-01: las notas solo se re-anclan en su capítulo y en su sitio', () => {
  it('una nota del capítulo 4 no se pinta en el capítulo 1 aunque el texto coincida', () => {
    const nota = { capitulo: 3, fraseInicio: 'c003-s00012' }
    expect(debeReanclarEn(nota, 0)).toBe(false)
    expect(debeReanclarEn(nota, 3)).toBe(true)
    expect(debeReanclarEn(nota, null)).toBe(false)
  })

  it('el capítulo sale de la nota o de su frase; el de la sección, del archivo', () => {
    expect(capituloDeNota({ capitulo: null, fraseInicio: 'c007-s00001' })).toBe(7)
    expect(capituloDeNota({ capitulo: 2, fraseInicio: 'c007-s00001' })).toBe(2)
    expect(capituloDeNota({ capitulo: null, fraseInicio: null })).toBeNull()
    expect(capituloDeSeccion('OEBPS/texto/cap-004.xhtml')).toBe(4)
    expect(capituloDeSeccion('portada.xhtml')).toBeNull()
    // Sin capítulo en ninguno de los dos lados se deja probar (libros de fuera).
    expect(debeReanclarEn({ capitulo: null, fraseInicio: null }, null)).toBe(true)
  })

  it('con la cita repetida elige la aparición cuyo contexto coincide, no la primera', () => {
    const texto = 'Al alba. Las olas rompían contra el muelle. Más tarde, en el faro, Las olas rompían contra la roca.'
    const cita = 'Las olas rompían'
    const segunda = texto.lastIndexOf(cita)
    expect(indiceDeCita(texto, cita, 'Más tarde, en el faro, ', ' contra la roca.')).toBe(segunda)
    expect(indiceDeCita(texto, cita, 'Al alba. ', ' contra el muelle')).toBe(texto.indexOf(cita))
  })

  it('si guardó contexto y ninguna aparición lo comparte, no se ancla (mejor huérfana que mal puesta)', () => {
    const texto = 'Cada noche contaba las barcas desde la ventana.'
    expect(
      indiceDeCita(texto, 'Cada noche contaba las barcas', 'El viejo farero, sin falta: ', ' que volvían al puerto'),
    ).toBe(-1)
    expect(indiceDeCita(texto, 'Cada noche contaba las barcas')).toBe(0)
    expect(indiceDeCita(texto, 'no está')).toBe(-1)
  })
})

describe('QA LV-05: tocar una nota no pasa la página', () => {
  const base = { ancho: 400, sobreAnotacion: false, sobreEnlace: false, haySeleccion: false }
  it('en los bordes pasa página y en el centro muestra la barra', () => {
    expect(accionDelToque({ ...base, x: 20 })).toBe('anterior')
    expect(accionDelToque({ ...base, x: 380 })).toBe('siguiente')
    expect(accionDelToque({ ...base, x: 200 })).toBe('centro')
  })
  it('sobre un resaltado en el borde solo abre la nota', () => {
    expect(accionDelToque({ ...base, x: 20, sobreAnotacion: true })).toBe('nada')
    expect(accionDelToque({ ...base, x: 380, sobreAnotacion: true })).toBe('nada')
  })
  it('un enlace o una selección tampoco pasan página', () => {
    expect(accionDelToque({ ...base, x: 380, sobreEnlace: true })).toBe('nada')
    expect(accionDelToque({ ...base, x: 20, haySeleccion: true })).toBe('nada')
  })
})

describe('QA LV-05: el segundo renglón de un resaltado junto al margen también es la nota', () => {
  // Dos renglones de 18 px con 10 px de interlineado entre ellos, pegados al margen izquierdo.
  const cajas = [
    { left: 24, top: 100, right: 380, bottom: 118 },
    { left: 24, top: 128, right: 200, bottom: 146 },
  ]
  it('dentro de cualquiera de las cajas', () => {
    expect(puntoSobreCajas(30, 137, cajas)).toBe(true)
    expect(puntoSobreCajas(370, 110, cajas)).toBe(true)
  })
  it('con holgura en el hueco entre renglones y en el borde del margen', () => {
    expect(puntoSobreCajas(30, 122, cajas)).toBe(true)
    expect(puntoSobreCajas(21, 137, cajas)).toBe(true)
  })
  it('lejos de la nota no cuenta (ese toque sí pasa página)', () => {
    expect(puntoSobreCajas(8, 137, cajas)).toBe(false)
    expect(puntoSobreCajas(260, 137, cajas)).toBe(false)
    expect(puntoSobreCajas(30, 170, cajas)).toBe(false)
    expect(puntoSobreCajas(30, 137, [{ left: 0, top: 0, right: 0, bottom: 0 }])).toBe(false)
  })
})

describe('QA RW-02: un toque quieto en el teléfono no esconde la barra', () => {
  const aqui = { cfi: 'epubcfi(/6/4!/4/2/1:0)', fraccion: 0.25 }
  it('el «snap» de foliate sin cambio de lugar no cuenta como pasar página', () => {
    expect(debeOcultarBarra('snap', true, aqui, { ...aqui })).toBe(false)
  })
  it('pasar de verdad (snap o page a otro lugar) sí la esconde', () => {
    expect(debeOcultarBarra('snap', true, aqui, { cfi: 'epubcfi(/6/4!/4/8/1:0)', fraccion: 0.27 })).toBe(true)
    expect(debeOcultarBarra('page', true, aqui, { cfi: 'epubcfi(/6/4!/4/8/1:0)', fraccion: 0.27 })).toBe(true)
    expect(debeOcultarBarra('scroll', true, { cfi: null, fraccion: 0.25 }, { cfi: null, fraccion: 0.3 })).toBe(true)
  })
  it('lo que mueve el libro solo (abrir, voz, índice) no la toca', () => {
    expect(debeOcultarBarra('snap', false, aqui, { cfi: 'x', fraccion: 0.9 })).toBe(false)
    expect(debeOcultarBarra('navigation', true, aqui, { cfi: 'x', fraccion: 0.9 })).toBe(false)
  })
  it('sin lugar anterior, un pase de página de la persona la esconde', () => {
    expect(debeOcultarBarra('page', true, null, aqui)).toBe(true)
  })
})

describe('QA LV-P6: el deslizador solo salta con las teclas que lo mueven', () => {
  it('flechas, Inicio, Fin, RePág y AvPág sí; Tab, Mayús o letras no', () => {
    for (const t of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
      expect(teclaMueveDeslizador(t)).toBe(true)
    for (const t of ['Tab', 'Shift', 'Enter', 'a', ' ']) expect(teclaMueveDeslizador(t)).toBe(false)
  })
})

describe('QA LV-08 y LV-04: quién movió la página', () => {
  it('«Página siguiente» en continuo (motivo null) cuenta como gesto si viene de un botón o tecla', () => {
    expect(esMovimientoDelUsuario(null, 1000, 0, 2000)).toBe(true)
    expect(esMovimientoDelUsuario(null, 3000, 0, 2000)).toBe(false)
  })
  it('pasar página, desplazarse o seleccionar es de la persona; abrir o seguir a la voz, no', () => {
    expect(esMovimientoDelUsuario('page', 1000, 0, 0)).toBe(true)
    expect(esMovimientoDelUsuario('scroll', 1000, 0, 0)).toBe(true)
    expect(esMovimientoDelUsuario('navigation', 1000, 0, 0)).toBe(false)
    expect(esMovimientoDelUsuario('anchor', 1000, 0, 0)).toBe(false)
    // Mientras el libro se coloca solo (abrir, voz), un 'scroll' no es de la persona.
    expect(esMovimientoDelUsuario('scroll', 1000, 1500, 0)).toBe(false)
  })
})

describe('QA LV-10 / UX-02: la barra no tapa la primera línea', () => {
  it('el margen de arriba del libro es al menos el alto de la barra', () => {
    expect(LECTOR_PAPEL.margenMovil).toBeGreaterThanOrEqual(ALTO_BARRA_LECTOR)
    expect(LECTOR_PAPEL.margenPC).toBeGreaterThanOrEqual(ALTO_BARRA_LECTOR)
  })
  it('el lector usa ese margen (y no los 40 px de antes)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'LectorFoliate.web.tsx'), 'utf8')
    expect(fuente).toMatch(
      /setAttribute\('margin', `\$\{dos \? LECTOR_PAPEL\.margenPC : LECTOR_PAPEL\.margenMovil\}px`\)/,
    )
    expect(fuente).not.toMatch(/setAttribute\('margin', '40px'\)/)
  })
  it('la barra de la pantalla mide lo que dice el token', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'screens/lector/LectorScreen.tsx'), 'utf8')
    expect(fuente).toMatch(/height: ALTO_BARRA_LECTOR/)
  })
})

describe('El folio de papel: «p. 34 de 210 · quedan 12 min»', () => {
  it('pagina como un libro impreso, estable aunque cambie la letra', () => {
    expect(paginaImpresa(0, 300, 0.6)).toEqual({ pagina: 1, paginas: 150 })
    expect(paginaImpresa(150, 300, 0.6)).toEqual({ pagina: 76, paginas: 150 })
    expect(paginaImpresa(299, 300, 0.6)?.pagina).toBeLessThanOrEqual(150)
    expect(paginaImpresa(10, 0, 0.6)).toBeNull()
  })
  it('lo que queda del capítulo', () => {
    expect(minutosRestantes(20, 0.4)).toBe(12)
    expect(minutosRestantes(null, 0.4)).toBeNull()
    expect(textoQuedan(12)).toBe('quedan 12 min')
    expect(textoQuedan(130)).toBe('quedan 2 h 10 min')
    expect(textoQuedan(0)).toBe('último minuto del capítulo')
  })
  it('una columna lo dice todo junto; el libro abierto, una página a cada lado', () => {
    expect(textoFolio({ pagina: 34, paginas: 210 }, 12, 1)).toEqual(['p. 34 de 210 · quedan 12 min'])
    expect(textoFolio({ pagina: 34, paginas: 210 }, 12, 2)).toEqual(['34', '35 de 210 · quedan 12 min'])
    expect(textoFolio(null, null, 1)).toEqual([''])
  })
})

describe('«Ver en español»: solo si el libro no está en español', () => {
  it('se ofrece para inglés y para idioma desconocido, no para español', () => {
    expect(ofrecerTraduccion('en')).toBe(true)
    expect(ofrecerTraduccion('en-US')).toBe(true)
    expect(ofrecerTraduccion(null, 'en')).toBe(true)
    expect(ofrecerTraduccion('es')).toBe(false)
    expect(ofrecerTraduccion('es-CO')).toBe(false)
    // QA RW-06: si no se sabe el idioma, se ofrece.
    expect(ofrecerTraduccion(null, null)).toBe(true)
    expect(ofrecerTraduccion('', undefined)).toBe(true)
    expect(ofrecerTraduccion(null, 'spa')).toBe(false)
  })
  it('un párrafo se traduce con sus frases en orden, manteniendo los ids', () => {
    const frases = { 'c000-s00001': 'Era de noche.', 'c000-s00002': 'Llovía.' }
    expect(textoTraducido(['c000-s00001', 'c000-s00002'], frases)).toBe('Era de noche. Llovía.')
    expect(textoTraducido(['c000-s00009'], frases)).toBeNull()
  })
})

describe('El menú de la selección nunca tapa el texto elegido', () => {
  const menu = { ancho: 344, alto: 108 }
  const pantalla = { ancho: 390, alto: 844, arriba: 56, abajo: 0 }
  const solapa = (sel: { y: number; alto: number }, p: { top: number }) =>
    p.top < sel.y + sel.alto && p.top + menu.alto > sel.y

  it('va encima si cabe, con la flecha hacia el texto', () => {
    const sel = { x: 40, y: 360, ancho: 300, alto: 50 }
    const p = posicionMenu(sel, menu, pantalla)
    expect(p.debajo).toBe(false)
    expect(p.top + menu.alto).toBeLessThanOrEqual(sel.y - 8)
    expect(solapa(sel, p)).toBe(false)
  })
  it('va debajo si arriba no cabe (selección al principio de la página)', () => {
    const sel = { x: 24, y: 120, ancho: 340, alto: 54 }
    const p = posicionMenu(sel, menu, pantalla)
    expect(p.debajo).toBe(true)
    expect(p.top).toBeGreaterThanOrEqual(sel.y + sel.alto + 8)
    expect(solapa(sel, p)).toBe(false)
  })
  it('nunca se sale por los lados y la flecha apunta al centro de la selección', () => {
    const p = posicionMenu({ x: 360, y: 400, ancho: 20, alto: 20 }, menu, pantalla)
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.left + menu.ancho).toBeLessThanOrEqual(390 - 8)
    expect(p.left + p.flechaX).toBeGreaterThan(340)
    const q = posicionMenu({ x: 0, y: 400, ancho: 10, alto: 20 }, menu, pantalla)
    expect(q.left).toBe(8)
    expect(q.flechaX).toBeGreaterThanOrEqual(18)
  })
  it('con una selección más alta que la pantalla queda dentro de la pantalla', () => {
    const p = posicionMenu({ x: 20, y: 70, ancho: 350, alto: 760 }, menu, pantalla)
    expect(p.top).toBeGreaterThanOrEqual(56)
    expect(p.top + menu.alto).toBeLessThanOrEqual(844)
  })
})

describe('Sin ríos de espacios en el texto', () => {
  const prefs = {
    temaPapel: 'marfil',
    fuente: 'literata',
    tamano: 100,
    interlineado: 1.55,
    margen: 6,
    modo: 'paginado',
  } as unknown as Parameters<typeof cssDelLibro>[0]
  it('partición silábica (también -webkit- para Safari) y text-wrap: pretty', () => {
    const css = cssDelLibro(prefs)
    expect(css).toMatch(/-webkit-hyphens:auto/)
    expect(css).toMatch(/[^-]hyphens:auto/)
    expect(css).toMatch(/text-wrap:pretty/)
  })
  it('en el móvil (columna estrecha) alinea a la izquierda; en el PC justifica', () => {
    expect(cssDelLibro(prefs, { estrecho: true })).toMatch(/p\{text-align:left!important/)
    expect(cssDelLibro(prefs, { estrecho: false })).toMatch(/p\{text-align:justify!important/)
  })
})

describe('Modo de lectura: Pasar páginas · Hojas · Libro abierto', () => {
  const nunca = { modo: 'paginado' as const, modoElegido: false }
  it('si no se eligió, decide la ventana: PC bajo y ancho → Hojas; PC normal → libro abierto; teléfono → páginas', () => {
    expect(modoEfectivo(nunca, 1915, 730)).toBe('continuo')
    expect(modoEfectivo(nunca, 1366, 650)).toBe('continuo')
    expect(modoEfectivo(nunca, 1440, 900)).toBe('libro')
    expect(modoEfectivo(nunca, 390, 844)).toBe('paginado')
  })
  it('lo elegido manda; el libro abierto no cabe en el teléfono', () => {
    expect(modoEfectivo({ modo: 'continuo', modoElegido: true }, 390, 844)).toBe('continuo')
    expect(modoEfectivo({ modo: 'paginado', modoElegido: true }, 1915, 730)).toBe('paginado')
    expect(modoEfectivo({ modo: 'libro', modoElegido: true }, 390, 844)).toBe('paginado')
    expect(ventanaBajaYAncha(1440, 900)).toBe(false)
  })
  it('en un PC bajo y ancho se ofrecen las Hojas primero; en el teléfono no hay libro abierto', () => {
    expect(opcionesDeModo(1915, 730).map((o) => o.modo)).toEqual(['continuo', 'libro', 'paginado'])
    expect(opcionesDeModo(1440, 900).map((o) => o.modo)).toEqual(['libro', 'continuo', 'paginado'])
    expect(opcionesDeModo(390, 844).map((o) => o.modo)).toEqual(['paginado', 'continuo'])
  })
  it('las preferencias viejas (sin modoElegido) no fijan el modo; uno desconocido vuelve a páginas', () => {
    expect(leerPreferencias(JSON.stringify({ modo: 'paginado' })).modoElegido).toBe(false)
    expect(leerPreferencias(JSON.stringify({ modo: 'libro', modoElegido: true })).modo).toBe('libro')
    expect(leerPreferencias(JSON.stringify({ modo: 'raro' })).modo).toBe('paginado')
  })
})

describe('Hojas: el largo real de una página y cortes sin partir líneas', () => {
  it('la hoja tiene proporción de libro: ~660 px en el PC y casi todo el ancho en el teléfono', () => {
    const pc = geometriaHoja(1915)
    expect(pc.ancho).toBe(680)
    expect(pc.alto).toBe(Math.round(680 * 1.45))
    const movil = geometriaHoja(390)
    expect(movil.ancho).toBe(374)
    expect(movil.alto / movil.ancho).toBeCloseTo(1.45, 2)
  })
  // Renglones de 20 px; la hoja acaba en 100.
  const p = (arriba: number, abajo: number) => ({ arriba, abajo, bloque: true })
  const f = (arriba: number, abajo: number) => ({ arriba, abajo, bloque: false })
  it('si todo cabe, no hay corte', () => {
    expect(elegirCorte([p(0, 40), p(50, 90)], 0, 100, 0)).toBe(-1)
  })
  it('un párrafo que empieza después del límite abre la hoja siguiente', () => {
    expect(elegirCorte([p(0, 40), p(110, 150)], 0, 100, 0)).toBe(1)
  })
  it('un párrafo que cruza el límite se corta ante la frase que cruza, no a media línea', () => {
    // párrafo 50-150 con tres frases: 50-70, 70-110 (cruza), 110-150
    const c = [p(0, 40), p(50, 150), f(50, 70), f(70, 110), f(110, 150)]
    expect(elegirCorte(c, 0, 100, 0)).toBe(3)
  })
  it('un párrafo sin frases que cruza baja entero', () => {
    expect(elegirCorte([p(0, 40), p(60, 140)], 0, 100, 0)).toBe(1)
  })
  it('una frase más larga que una hoja, al principio de la hoja, se deja correr', () => {
    expect(elegirCorte([p(0, 300), f(0, 300), f(300, 320)], 0, 100, 0)).toBe(2)
  })
})

describe('Hojas: seguir desplazando al acabar el capítulo pasa al siguiente', () => {
  const caja = (scrollTop: number) => ({ scrollTop, clientHeight: 800, scrollHeight: 4000 })
  it('al pie y empujando hacia abajo, el siguiente; en la cabeza y hacia arriba, el anterior', () => {
    expect(pasoDeCapitulo(caja(3200), 120)).toBe(1)
    expect(pasoDeCapitulo(caja(0), -120)).toBe(-1)
  })
  it('en medio del capítulo, o empujando hacia dentro, nada', () => {
    expect(pasoDeCapitulo(caja(1500), 120)).toBe(0)
    expect(pasoDeCapitulo(caja(3200), -120)).toBe(0)
    expect(pasoDeCapitulo(caja(0), 120)).toBe(0)
  })
})
