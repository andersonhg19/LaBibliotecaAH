import { siguienteCalificacion } from '@componentes/atoms/Estrellas'
import { adornoDeBalda } from '@componentes/estanteria/Adorno'
import { cuentaDePlaca } from '@componentes/estanteria/Estante'
import { escalaAbierto, tamanoFinal } from '@componentes/estanteria/LibroEnEstante.web'
import { anchoLampara } from '@componentes/estanteria/Mueble'
import { portadaEsPagina } from '@componentes/estanteria/Portada'
import { esNoche, leerModo } from '@contextos/ThemeContext'
import { cuentaDePestana, plural, seAplico, tiempoRestante } from '@logica/formato'
import { AIRE_LOMO, CUEROS, DORADOS, GROSOR_MIN, capacidadBalda, dimensionesLomo, posturas } from '@logica/lomos'
import { FILTRO_NOTAS_INICIAL, citaParaCompartir, filtrarGrupos, porFecha, totalNotas } from '@logica/notas'
import { tituloCompactoConMas, usaCabeceraCompacta } from '@pantallas/biblioteca/BibliotecaScreen'
import { extremosDeAnios } from '@pantallas/biblioteca/Catalogo'
import { cajones } from '@pantallas/biblioteca/DocumentosScreen'
import { columnasDeMueble, filasDeModulos } from '@pantallas/biblioteca/Estanteria'
import { mensajeDeSubida, noSeSube, yaEstaba } from '@pantallas/biblioteca/SubirLibros'
import { ordenarDiario, tamanoTitulo, urlDondeConseguirlo } from '@pantallas/libro/FichaLibro'
import { contraste } from '@tema/contraste'
import {
  REGION,
  cepilladoLaton,
  fibraPapel,
  granoCuero,
  guardaMarmolada,
  vetaClara,
  vetaHorizontal,
  vetaVertical,
} from '@tema/madera'
import { LATON_PLANO, TINTA_LATON } from '@tema/materiales'
import type { AnotacionDTO, EjemplarDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { MENSAJES } from '@utils/mensajes'
import { esquemaCuentaNueva, esquemaDatosLibro, esquemaRegistro, validar } from '@validaciones/index'

/**
 * ============================================================================
 * EL DISEÑO Y LA BIBLIOTECA, REGLA A REGLA (QA UX y BI de la ola de diseño)
 * ============================================================================
 * Cada bloque nombra el hallazgo que evita que vuelva.
 */

const libro = (o: Partial<EjemplarDTO> = {}): EjemplarDTO => ({
  id: 'x',
  archivoId: 'a',
  tipo: 'LIBRO',
  estado: 'POR_LEER',
  titulo: 'Niebla',
  subtitulo: null,
  autores: [],
  anio: null,
  editorial: null,
  idioma: null,
  isbn: null,
  sinopsis: null,
  generos: [],
  etiquetas: [],
  calificacion: null,
  favorito: false,
  formatoOriginal: 'EPUB',
  estadoConversion: 'LISTO',
  tienePortada: false,
  minutosEstimados: null,
  porcentaje: 0,
  fechaLlegada: '2026-11-10T10:00:00Z',
  ultimaApertura: null,
  fechaFin: null,
  nNotas: 0,
  fuenteMetadatos: 'ARCHIVO',
  ...o,
})

describe('UX-04: lo que se elige se anuncia con su atributo ARIA', () => {
  it('pestaña → aria-selected; radio, casilla e interruptor → aria-checked; botón → aria-pressed', () => {
    expect(estadoElegible('tab', true)).toMatchObject({ role: 'tab', 'aria-selected': true })
    expect(estadoElegible('radio', false)).toMatchObject({ role: 'radio', 'aria-checked': false })
    expect(estadoElegible('checkbox', true)).toMatchObject({
      'aria-checked': true,
      accessibilityState: { checked: true },
    })
    expect(estadoElegible('switch', true, true)).toMatchObject({ 'aria-checked': true, 'aria-disabled': true })
    expect(estadoElegible('button', true)).toMatchObject({ role: 'button', 'aria-pressed': true })
  })
})

describe('UX-05: la madera no tiene costura', () => {
  const texturas = { vetaHorizontal, vetaVertical, vetaClara, granoCuero, fibraPapel, cepilladoLaton, guardaMarmolada }
  it.each(Object.entries(texturas))('%s ajusta la región del filtro al mosaico (empalma)', (_n, t) => {
    const svg = decodeURIComponent(t)
    expect(svg).toContain(`<filter id='`)
    expect(svg).toContain(REGION)
    expect(svg).toContain("stitchTiles='stitch'")
  })
})

describe('UX-06 / UX-27: lomos tocables y legibles', () => {
  it('el lomo más fino, con su aire, es un objetivo de 44 px', () => {
    expect(GROSOR_MIN + 2 * AIRE_LOMO).toBeGreaterThanOrEqual(44)
    expect(dimensionesLomo({ id: 'z', titulo: 'Breve', minutosEstimados: 1 }).grosor).toBeGreaterThanOrEqual(40)
  })
  it.each(CUEROS.flatMap((c) => DORADOS.map((d) => [d, c])))('el dorado %s sobre el cuero %s llega a 4,5:1', (d, c) => {
    expect(contraste(d, c)).toBeGreaterThanOrEqual(4.5)
  })
  it('la tinta de las placas de latón se lee de sobra', () => {
    expect(contraste(TINTA_LATON, LATON_PLANO)).toBeGreaterThanOrEqual(7)
  })
})

describe('Plan de diseño A: una balda a medias no es una fila de soldados', () => {
  it('con sitio: el último inclinado y el primero tumbado; llena, todos de pie', () => {
    expect(posturas(4, 9)).toEqual(['tumbado', 'derecho', 'derecho', 'inclinado'])
    expect(posturas(6, 6)).toEqual(Array(6).fill('derecho'))
    expect(posturas(1, 9)).toEqual(['derecho'])
    expect(posturas(6, 12)).toEqual(['tumbado', 'tumbado', 'derecho', 'derecho', 'derecho', 'inclinado'])
  })
  it('caben más lomos en una balda más ancha', () => expect(capacidadBalda(900)).toBeGreaterThan(capacidadBalda(360)))
  it('en el PC el mueble se reparte en módulos; en el teléfono, uno', () => {
    expect(columnasDeMueble(390)).toBe(1)
    expect(columnasDeMueble(1000)).toBe(2)
    expect(columnasDeMueble(1400)).toBe(3)
  })
})

describe('UX-12: cabecera compacta en el teléfono y en horizontal', () => {
  it('compacta en 390×844 y 844×390; completa en el PC', () => {
    expect(usaCabeceraCompacta(390, 844)).toBe(true)
    expect(usaCabeceraCompacta(844, 390)).toBe(true)
    expect(usaCabeceraCompacta(1440, 900)).toBe(false)
  })
})

describe('UX-08 / UX-18 / UX-19 / BI-22: las cuentas dicen la verdad', () => {
  it('"24 de 40" si la balda enseña solo una parte', () => {
    expect(cuentaDePlaca(24, 40)).toBe('24 de 40')
    expect(cuentaDePlaca(7, 7)).toBe('7 libros')
    expect(cuentaDePlaca(1, null)).toBe('1 libro')
  })
  it('plurales y lo que se cuenta en cada pestaña', () => {
    expect(plural(1, 'documento')).toBe('1 documento')
    expect(plural(3, 'documento')).toBe('3 documentos')
    expect(cuentaDePestana('DESEOS', 300)).toBe('300 deseos')
    expect(cuentaDePestana('DOCUMENTOS', 1)).toBe('1 documento')
    expect(cuentaDePestana('TODO', 8)).toBe('8 libros')
  })
  it('lo que queda de un libro en el atril', () => {
    expect(tiempoRestante(100, 50)).toBe('quedan 50 min')
    expect(tiempoRestante(null, 10)).toBeNull()
    expect(tiempoRestante(60, 100)).toBeNull()
  })
})

describe('UX-17: el género del campo obligatorio', () => {
  it('"La contraseña es obligatoria", "El título es obligatorio"', () => {
    expect(MENSAJES.requerido('La contraseña')).toBe('La contraseña es obligatoria.')
    expect(MENSAJES.requerido('El título')).toBe('El título es obligatorio.')
  })
})

describe('BI-07 / BI-08: no se dice "Guardado" si el servidor no lo aplicó', () => {
  it('pedir vaciar y recibir un valor = no se aplicó', () => {
    expect(seAplico({ calificacion: null }, { calificacion: 3 })).toBe(false)
    expect(seAplico({ anio: null }, { anio: 1949 })).toBe(false)
    expect(seAplico({ calificacion: null }, { calificacion: null })).toBe(true)
    expect(seAplico({ favorito: true }, { favorito: true })).toBe(true)
    expect(seAplico({ titulo: ' x ' }, { titulo: 'x' })).toBe(true)
    expect(seAplico({ anio: null }, null)).toBe(true)
  })
  it('UX-07: una estrella de 44 px; tocarla otra vez la deja en media', () => {
    expect(siguienteCalificacion(null, 4)).toBe(4)
    expect(siguienteCalificacion(4, 4)).toBe(3.5)
    expect(siguienteCalificacion(3.5, 4)).toBe(4)
    expect(siguienteCalificacion(2, 4)).toBe(4)
  })
})

describe('Contrato v1.2: los datos del libro', () => {
  const base = { titulo: 'T', autores: '', anio: '', editorial: '', sinopsis: '', generos: '', etiquetas: '' }
  it('lo vacío viaja como null (vacía el campo)', () => {
    const v = validar(esquemaDatosLibro, base)
    expect(v.ok && v.datos).toMatchObject({ anio: null, editorial: null, sinopsis: null, autores: null, generos: null })
  })
  it('año entero entre -3000 y 2100', () => {
    expect(validar(esquemaDatosLibro, { ...base, anio: '-3000' }).ok).toBe(true)
    expect(validar(esquemaDatosLibro, { ...base, anio: '2101' }).errores.anio).toBe(MENSAJES.anioInvalido)
    expect(validar(esquemaDatosLibro, { ...base, anio: '1999.5' }).ok).toBe(false)
  })
  it('como mucho 50 etiquetas de 50 caracteres', () => {
    const muchas = Array.from({ length: 51 }, (_, i) => `e${i}`).join(',')
    expect(validar(esquemaDatosLibro, { ...base, etiquetas: muchas }).ok).toBe(false)
    expect(validar(esquemaDatosLibro, { ...base, etiquetas: 'x'.repeat(51) }).ok).toBe(false)
    const v = validar(esquemaDatosLibro, { ...base, etiquetas: '#verano, regalo' })
    expect(v.ok && v.datos.etiquetas).toEqual(['verano', 'regalo'])
  })
  it('correo en minúsculas y clave de 10 o más (registro y cuenta nueva)', () => {
    const r = validar(esquemaRegistro, {
      name: 'L',
      email: ' Lectora@Casa.CO ',
      alias: 'lectora',
      password: 'Clave1234',
      confirmar: 'Clave1234',
    })
    expect(r.errores.password).toBe(MENSAJES.claveDebil)
    const c = validar(esquemaCuentaNueva, {
      name: 'L',
      email: 'Lectora@Casa.CO',
      alias: 'lectora',
      password: 'Clave12345',
    })
    expect(c.ok && c.datos.email).toBe('lectora@casa.co')
  })
})

describe('UX-10: un título larguísimo no se come la ficha', () => {
  it('el tamaño baja con la longitud', () => {
    expect(tamanoTitulo('x'.repeat(200))).toBeLessThan(tamanoTitulo('Niebla'))
  })
})

describe('BI-11: el diario en un solo orden', () => {
  it('de lo más nuevo a lo más viejo, al cargar y al escribir', () => {
    const l = ordenarDiario([
      { ejemplarId: 'x', texto: 'uno', creado: '2026-11-10T10:00:00Z' },
      { ejemplarId: 'x', texto: 'tres', creado: '2026-11-10T12:00:00Z' },
      { ejemplarId: 'x', texto: 'dos', creado: '2026-11-10T11:00:00Z' },
    ])
    expect(l.map((c) => c.texto)).toEqual(['tres', 'dos', 'uno'])
  })
})

describe('BI-15: el deseo dice dónde conseguirlo', () => {
  it('por ISBN si lo tiene; si no, por título y autor', () => {
    expect(urlDondeConseguirlo({ isbn: '978-84-376-0494-7', titulo: 'x', autores: [] })).toContain(
      encodeURIComponent('isbn:9788437604947'),
    )
    expect(urlDondeConseguirlo({ isbn: null, titulo: 'Rayuela', autores: ['Cortázar'] })).toContain('Rayuela')
  })
})

describe('BI-16 / BI-21 / SE-07: subir con la verdad', () => {
  it('lo que ya estaba se reconoce (por el campo del servidor o por la fecha)', () => {
    const ahora = Date.parse('2026-11-11T10:00:00Z')
    expect(yaEstaba(libro({ yaLoTenias: true }), ahora)).toBe(true)
    expect(yaEstaba(libro({ yaLoTenias: false, fechaLlegada: '2020-01-01T00:00:00Z' }), ahora)).toBe(false)
    expect(yaEstaba(libro({ fechaLlegada: '2026-11-01T00:00:00Z' }), ahora)).toBe(true)
    expect(yaEstaba(libro({ fechaLlegada: '2026-11-11T10:00:30Z' }), ahora)).toBe(false)
  })
  it('vacío o demasiado grande no se sube', () => {
    expect(noSeSube({ size: 0 })).toBe(MENSAJES.archivoVacio)
    expect(noSeSube({ size: 301 * 1048576 })).toBe(MENSAJES.archivoGrande('300 MB'))
    expect(noSeSube({ size: 1000 })).toBeNull()
  })
  it('un 413 sin mensaje del servidor se explica; con mensaje, manda el servidor', () => {
    expect(mensajeDeSubida({ response: { status: 413 } })).toBe(MENSAJES.archivoGrande('300 MB'))
    expect(mensajeDeSubida({ response: { status: 507, data: { message: 'Sin espacio' } } })).toBe('Sin espacio')
  })
})

describe('BI-19 / BI-26: años y cajones', () => {
  it('las pistas de año van de menor a mayor', () => {
    expect(extremosDeAnios([{ nombre: '2024' }, { nombre: '1605' }, { nombre: '1967' }])).toEqual({
      min: '1605',
      max: '2024',
    })
  })
  it('la Ñ tiene su cajón y la Á va a la A', () => {
    const g = cajones([
      libro({ id: '1', titulo: 'Ñandú informe' }),
      libro({ id: '2', titulo: 'Nube' }),
      libro({ id: '3', titulo: 'Árbol' }),
    ])
    expect(g.map((x) => x.rotulo)).toEqual(['A', 'N', 'Ñ'])
  })
})

describe('UX-09: los PDF se visten de libro', () => {
  it('la primera página de un PDF, Word o texto va dentro de una tapa; la portada de un EPUB, tal cual', () => {
    expect(portadaEsPagina({ formatoOriginal: 'PDF', tipo: 'LIBRO' })).toBe(true)
    expect(portadaEsPagina({ formatoOriginal: 'EPUB', tipo: 'LIBRO' })).toBe(false)
    expect(portadaEsPagina({ formatoOriginal: 'EPUB', tipo: 'DOCUMENTO' })).toBe(true)
  })
})

describe('UX-26: la tapa abierta cabe en la pantalla', () => {
  it.each([390, 412, 1440])('a %i px de ancho las dos páginas caben', (vw) => {
    const { W } = tamanoFinal(vw)
    expect(2 * W * escalaAbierto(vw, W)).toBeLessThanOrEqual(vw - 24 + 0.001)
  })
})

describe('UX-16: el ambiente sigue al dispositivo salvo que elijas', () => {
  it('modo "sistema" por defecto; noche si no hay esquema', () => {
    expect(leerModo(null)).toBe('sistema')
    expect(leerModo('dia')).toBe('dia')
    expect(esNoche('sistema', 'light')).toBe(false)
    expect(esNoche('sistema', 'dark')).toBe(true)
    expect(esNoche('sistema', null)).toBe(true)
    expect(esNoche('dia', 'dark')).toBe(false)
  })
})

describe('SE-05: la web lleva sus cabeceras de seguridad', () => {
  const serve = require('../../public/serve.json') as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const general = Object.fromEntries(
    (serve.headers.find((h) => h.source === '**')?.headers ?? []).map((h) => [h.key, h.value]),
  )
  const csp = general['Content-Security-Policy'] ?? ''
  it('nadie puede enmarcar la biblioteca', () => {
    expect(general['X-Frame-Options']).toBe('DENY')
    expect(csp).toContain("frame-ancestors 'none'")
  })
  it('ningún script en línea: solo los de la casa', () => {
    expect(csp).toMatch(/script-src 'self'( 'unsafe-eval')?;/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
  })
  it('el lector sigue funcionando: blobs para el iframe, sus imágenes y fuentes; la API para datos y audio', () => {
    expect(csp).toContain("frame-src 'self' blob:")
    expect(csp).toMatch(/img-src [^;]*blob:/)
    expect(csp).toMatch(/media-src [^;]*blob:/)
    expect(csp).toMatch(/connect-src [^;]*https:/)
  })
  it('QA RW-03: el silencio data:audio que desbloquea el audio en iOS no lo bloquea la CSP (serve.json y csp.mjs)', () => {
    const { SILENCIO } = require('@utils/motorAudio') as { SILENCIO: string }
    expect(SILENCIO.startsWith('data:audio/')).toBe(true)
    expect(csp).toMatch(/media-src [^;]*data:/)
    expect(csp).toMatch(/media-src [^;]*blob:/)
    const script = require('fs').readFileSync(
      require('path').join(__dirname, '../../scripts/csp.mjs'),
      'utf8',
    ) as string
    expect(script).toMatch(/`media-src 'self' data: blob: \$\{origen\}`/)
  })
})

describe('Mis notas: buscar, filtrar, ordenar y citar', () => {
  const nota = (o: Partial<AnotacionDTO>): AnotacionDTO => ({
    ejemplarId: 'x',
    tipo: 'RESALTADO',
    color: '#D9A35B',
    cfi: null,
    fraseInicio: null,
    offsetInicio: null,
    fraseFin: null,
    offsetFin: null,
    versionTexto: null,
    textoCitado: null,
    prefijo: null,
    sufijo: null,
    nota: null,
    capitulo: 0,
    ...o,
  })
  const l1 = libro({ id: 'l1', titulo: 'Rayuela', autores: ['Julio Cortázar'] })
  const l2 = libro({ id: 'l2', titulo: 'Niebla' })
  const grupos = [
    {
      libro: l1,
      notas: [
        nota({ id: 'a', textoCitado: 'La lámpara encendida', creado: '2026-11-01T10:00:00Z' }),
        nota({ id: 'b', tipo: 'NOTA', color: '#9DB89A', nota: 'Releer', creado: '2026-11-09T10:00:00Z' }),
      ],
    },
    { libro: l2, notas: [nota({ id: 'c', textoCitado: 'Augusto', creado: '2026-11-05T10:00:00Z' })] },
  ]
  it('busca sin tildes en la cita, la nota y el libro', () => {
    expect(filtrarGrupos(grupos, { ...FILTRO_NOTAS_INICIAL, texto: 'LAMPARA' }).map((g) => g.notas[0].id)).toEqual([
      'a',
    ])
    expect(filtrarGrupos(grupos, { ...FILTRO_NOTAS_INICIAL, texto: 'cortazar' })[0].notas).toHaveLength(2)
  })
  it('filtra por tipo y por color, y quita los libros que se quedan vacíos', () => {
    expect(filtrarGrupos(grupos, { ...FILTRO_NOTAS_INICIAL, tipo: 'NOTA' }).map((g) => g.libro.id)).toEqual(['l1'])
    expect(totalNotas(filtrarGrupos(grupos, { ...FILTRO_NOTAS_INICIAL, color: '#d9a35b' }))).toBe(2)
  })
  it('"Todas" va de la más nueva a la más vieja', () => {
    expect(porFecha(grupos).map((x) => x.nota.id)).toEqual(['b', 'c', 'a'])
  })
  it('la cita para compartir lleva comillas, autor y título', () => {
    expect(citaParaCompartir(grupos[0].notas[0], l1)).toBe('«La lámpara encendida»\n— Julio Cortázar, Rayuela')
  })
})

describe('Pulido: el mueble se adapta al contenido', () => {
  it('las baldas llenan cada fila del PC, equilibradas y sin hueco', () => {
    expect(filasDeModulos(2, 3)).toEqual([2])
    expect(filasDeModulos(4, 3)).toEqual([2, 2])
    expect(filasDeModulos(5, 3)).toEqual([3, 2])
    expect(filasDeModulos(3, 1)).toEqual([1, 1, 1])
    expect(filasDeModulos(0, 3)).toEqual([])
  })
  it('cada balda tiene siempre el mismo objeto decorativo', () => {
    expect(['globo', 'planta', 'reloj']).toContain(adornoDeBalda('recientes'))
    expect(adornoDeBalda('recientes')).toBe(adornoDeBalda('recientes'))
  })
  it('la lámpara del PC es 1,5 veces la del teléfono', () => {
    expect(anchoLampara(true, true)).toBe(198)
    expect(anchoLampara(false, true)).toBe(132)
  })
})

describe('E8 (validación web r2): «Mi biblioteca» entero con el «+» en la cabecera', () => {
  it('se encoge hasta caber en 320 y SE (sin bajar de 16 px) y en 320 se quita el escudo', () => {
    const anchoTexto = (px: number) => 'Mi biblioteca'.length * px * 0.6
    for (const ancho of [320, 340, 359, 375]) {
      const { tamano, conEscudo } = tituloCompactoConMas(ancho)
      const disponible = ancho - 24 - 3 * 44 - 4 * 8 - (conEscudo ? 32 : 0)
      expect(tamano).toBeGreaterThanOrEqual(16)
      expect(anchoTexto(tamano)).toBeLessThanOrEqual(disponible)
    }
    expect(tituloCompactoConMas(320).conEscudo).toBe(false)
    expect(tituloCompactoConMas(375)).toEqual({ tamano: 19, conEscudo: true })
    expect(tituloCompactoConMas(1000).tamano).toBe(28)
  })
})
