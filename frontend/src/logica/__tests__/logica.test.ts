import {
  FILTROS_INICIALES,
  aFiltroDTO,
  alternar,
  chipsActivos,
  claveFiltros,
  contarFiltros,
  leerFiltrosGuardados,
  limpiarFiltros,
} from '@logica/filtros'
import { duracion, fechaCorta, fechaRelativa, reloj, seEstaPreparando, sePuedeLeer } from '@logica/formato'
import { ALTO_MAX, ALTO_MIN, CUEROS, GROSOR_MAX, GROSOR_MIN, colorLomo, dimensionesLomo } from '@logica/lomos'
import { indiceDestino, mover, movimientoDeOrden, vecinos } from '@logica/orden'
import { decidirReanudacion, describirPosicion, masReciente, mismaPosicion, nombreDispositivo } from '@logica/progreso'
import {
  buscarFrase,
  buscarPalabra,
  capituloDeFrase,
  esIdDeFrase,
  idDeFrase,
  indiceDeFrase,
  inicioFraseAnterior,
  inicioFraseSiguiente,
  numeroDeFrase,
} from '@logica/tiempos'
import {
  normalizarVelocidad,
  pasoVecino,
  planDeVelocidad,
  resaltaPalabra,
  textoVelocidad,
  tiempoEn1x,
  tiempoEnArchivo,
} from '@logica/velocidad'
import type { FraseTiempo, ProgresoDTO } from '@tipos'

describe('Los filtros del catálogo', () => {
  it('sin filtros, solo manda pestaña, orden y página', () => {
    expect(aFiltroDTO(FILTROS_INICIALES)).toEqual({ pestana: 'TODO', orden: 'RECIENTES', page: 0, size: 30 })
  })

  it('combina todos los filtros y recorta el texto', () => {
    const f = aFiltroDTO(
      {
        ...FILTROS_INICIALES,
        pestana: 'LEIDOS',
        texto: '  galdós ',
        autores: ['Benito Pérez Galdós'],
        generos: ['Novela'],
        formatos: ['PDF'],
        etiquetas: ['x'],
        anioDesde: 1870,
        anioHasta: 1880,
        calificacionMin: 4,
        conNotas: true,
        orden: 'ANIO',
      },
      2,
      10,
    )
    expect(f).toEqual({
      pestana: 'LEIDOS',
      orden: 'ANIO',
      page: 2,
      size: 10,
      texto: 'galdós',
      autores: ['Benito Pérez Galdós'],
      generos: ['Novela'],
      formatos: ['PDF'],
      etiquetas: ['x'],
      anioDesde: 1870,
      anioHasta: 1880,
      calificacionMin: 4,
      conNotas: true,
    })
  })

  it('alternar pone y quita', () => {
    expect(alternar(['a'], 'b')).toEqual(['a', 'b'])
    expect(alternar(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('cada chip sabe quitarse solo a sí mismo', () => {
    const e = {
      ...FILTROS_INICIALES,
      autores: ['Cervantes', 'Clarín'],
      anioDesde: 1600,
      anioHasta: 1700,
      conNotas: true,
      calificacionMin: 4,
    }
    const chips = chipsActivos(e)
    expect(chips.map((c) => c.etiqueta)).toEqual(['Cervantes', 'Clarín', 'Años 1600–1700', '4★ o más', 'Con notas'])
    const sinCervantes = chips[0].quitar(e)
    expect(sinCervantes.autores).toEqual(['Clarín'])
    expect(chips[2].quitar(e)).toMatchObject({ anioDesde: null, anioHasta: null })
    expect(contarFiltros(e)).toBe(5)
  })

  it('limpiar conserva la pestaña y el orden', () => {
    const e = {
      ...FILTROS_INICIALES,
      pestana: 'DESEOS' as const,
      orden: 'TITULO' as const,
      autores: ['x'],
      texto: 'hola',
    }
    expect(limpiarFiltros(e)).toEqual({ ...FILTROS_INICIALES, pestana: 'DESEOS', orden: 'TITULO' })
  })

  it('lo guardado se lee sin fiarse: lo corrupto cae al valor inicial', () => {
    expect(leerFiltrosGuardados(null)).toEqual(FILTROS_INICIALES)
    expect(leerFiltrosGuardados('{no es json')).toEqual(FILTROS_INICIALES)
    expect(
      leerFiltrosGuardados(
        JSON.stringify({ pestana: 'INVENTADA', orden: 'TITULO', autores: [1, 2], conNotas: 'si', anioDesde: 1900 }),
      ),
    ).toEqual({
      ...FILTROS_INICIALES,
      orden: 'TITULO',
      anioDesde: 1900,
    })
  })

  it('los filtros se guardan por usuario', () => {
    expect(claveFiltros('1')).toBe('@biblioteca_ah_filtros_1')
    expect(claveFiltros(null)).toBe('@biblioteca_ah_filtros_anonimo')
  })
})

describe('Velocidad: qué archivo suena a cada velocidad', () => {
  it.each([
    [0.5, '1x', 1, 0.5],
    [1, '1x', 1, 1],
    [2.5, '1x', 1, 2.5],
    [2.55, '2x', 2, 1.275],
    [3, '2x', 2, 1.5],
    [5, '2x', 2, 2.5],
  ])('a %sx suena el archivo %s (factor %s) a %sx', (v, variante, factor, rate) => {
    expect(planDeVelocidad(v)).toEqual({ variante, factor, rate })
  })

  it('normaliza al paso fino y a los límites', () => {
    expect(normalizarVelocidad(1.23)).toBe(1.25)
    expect(normalizarVelocidad(0.1)).toBe(0.5)
    expect(normalizarVelocidad(9)).toBe(5)
    expect(normalizarVelocidad(Number.NaN)).toBe(1)
  })

  it('al cambiar de archivo se conserva la posición (tiempo × factor)', () => {
    const pos1x = 120
    expect(tiempoEnArchivo(pos1x, 2)).toBe(60)
    expect(tiempoEn1x(tiempoEnArchivo(pos1x, 2), 2)).toBe(pos1x)
    expect(tiempoEnArchivo(pos1x, 1)).toBe(120)
  })

  it('la palabra se resalta solo hasta 2.5x', () => {
    expect(resaltaPalabra(2.5)).toBe(true)
    expect(resaltaPalabra(3)).toBe(false)
  })

  it('pasos vecinos desde cualquier valor', () => {
    expect(pasoVecino(1, 1)).toBe(1.25)
    expect(pasoVecino(1.1, 1)).toBe(1.25)
    expect(pasoVecino(1.1, -1)).toBe(1)
    expect(pasoVecino(5, 1)).toBe(5)
    expect(pasoVecino(0.5, -1)).toBe(0.5)
    expect(textoVelocidad(1.5)).toBe('1.5x')
    expect(textoVelocidad(2)).toBe('2x')
  })
})

const FRASES: FraseTiempo[] = [
  {
    id: 'c003-s00000',
    t0: 0.25,
    t1: 2,
    palabras: [
      [0, 3, 0.3, 0.6],
      [4, 9, 0.7, 1.2],
      [10, 14, 1.3, 1.9],
    ],
  },
  { id: 'c003-s00001', t0: 2.4, t1: 5, palabras: [] },
  { id: 'c003-s00002', t0: 5.3, t1: 9, palabras: [] },
]

describe('Búsqueda binaria de la frase que suena', () => {
  it('antes de la primera frase no hay frase', () => expect(buscarFrase(FRASES, 0.1)).toBe(-1))
  it('dentro de una frase', () => {
    expect(buscarFrase(FRASES, 0.25)).toBe(0)
    expect(buscarFrase(FRASES, 3)).toBe(1)
    expect(buscarFrase(FRASES, 100)).toBe(2)
  })
  it('en la pausa entre frases sigue la anterior (no parpadea)', () => expect(buscarFrase(FRASES, 2.2)).toBe(0))
  it('con miles de frases sigue acertando', () => {
    const muchas = Array.from({ length: 5000 }, (_, i) => ({
      id: idDeFrase(1, i),
      t0: i * 2,
      t1: i * 2 + 1.5,
      palabras: [],
    }))
    expect(buscarFrase(muchas, 7777.9)).toBe(3888)
    expect(buscarFrase([], 3)).toBe(-1)
  })
  it('la palabra dentro de la frase, y nada en los espacios', () => {
    const p = FRASES[0].palabras
    expect(buscarPalabra(p, 0.31)).toBe(0)
    expect(buscarPalabra(p, 1.5)).toBe(2)
    expect(buscarPalabra(p, 0.65)).toBe(-1)
  })
  it('saltos de frase', () => {
    expect(inicioFraseSiguiente(FRASES, 1)).toBe(2.4)
    expect(inicioFraseSiguiente(FRASES, 6)).toBeNull()
    expect(inicioFraseAnterior(FRASES, 4.5)).toBe(2.4)
    expect(inicioFraseAnterior(FRASES, 2.6)).toBe(0.25)
  })
  it('ids de frase', () => {
    expect(idDeFrase(3, 123)).toBe('c003-s00123')
    expect(capituloDeFrase('c003-s00123')).toBe(3)
    expect(numeroDeFrase('c003-s00123')).toBe(123)
    expect(capituloDeFrase('basura')).toBe(-1)
    expect(esIdDeFrase('c000-s00000')).toBe(true)
    expect(indiceDeFrase(FRASES, 'c003-s00002')).toBe(2)
    expect(indiceDeFrase(FRASES, 'c009-s00000')).toBe(-1)
  })
})

const prog = (p: Partial<ProgresoDTO>): ProgresoDTO => ({
  ejemplarId: 'e1',
  capitulo: 0,
  fraseId: null,
  cfi: null,
  posicionAudioSeg: null,
  vozId: null,
  velocidad: null,
  porcentaje: 0,
  modo: 'VISTA',
  dispositivo: 'PC',
  actualizadoEn: '2026-11-10T10:00:00Z',
  ...p,
})

describe('Retomar donde lo dejé', () => {
  it('sin nada, al principio', () =>
    expect(decidirReanudacion(null, null, 'PC')).toEqual({ inicial: null, ofrecer: null, subirLocal: false }))
  it('solo servidor: ahí, sin preguntar', () => {
    const s = prog({ fraseId: 'c002-s00010' })
    expect(decidirReanudacion(null, s, 'PC')).toEqual({ inicial: s, ofrecer: null, subirLocal: false })
  })
  it('solo local: ahí, y se sube', () => {
    const l = prog({ fraseId: 'c001-s00001' })
    expect(decidirReanudacion(l, null, 'PC')).toEqual({ inicial: l, ofrecer: null, subirLocal: true })
  })
  it('el servidor es más nuevo y viene de OTRO dispositivo: se abre donde iba este y se pregunta', () => {
    const l = prog({ fraseId: 'c001-s00001', actualizadoEn: '2026-11-09T10:00:00Z', dispositivo: 'PC' })
    const s = prog({
      fraseId: 'c007-s00040',
      capitulo: 7,
      actualizadoEn: '2026-11-10T10:00:00Z',
      dispositivo: 'iPhone',
    })
    expect(decidirReanudacion(l, s, 'PC')).toEqual({ inicial: l, ofrecer: s, subirLocal: false })
  })
  it('el servidor es más nuevo y es de este dispositivo: ahí, sin preguntar', () => {
    const l = prog({ fraseId: 'c001-s00001', actualizadoEn: '2026-11-09T10:00:00Z' })
    const s = prog({ fraseId: 'c002-s00001', actualizadoEn: '2026-11-10T10:00:00Z', dispositivo: 'PC' })
    expect(decidirReanudacion(l, s, 'PC').inicial).toBe(s)
    expect(decidirReanudacion(l, s, 'PC').ofrecer).toBeNull()
  })
  it('misma posición en otro dispositivo: no se pregunta', () => {
    const l = prog({ fraseId: 'c001-s00001', actualizadoEn: '2026-11-09T10:00:00Z' })
    const s = prog({ fraseId: 'c001-s00001', dispositivo: 'Android' })
    expect(decidirReanudacion(l, s, 'PC').ofrecer).toBeNull()
  })
  it('lo local va por delante (no se llegó a subir): gana y se sube', () => {
    const l = prog({ fraseId: 'c003-s00001', actualizadoEn: '2026-11-10T12:00:00Z' })
    const s = prog({ fraseId: 'c001-s00001', dispositivo: 'Android' })
    expect(decidirReanudacion(l, s, 'PC')).toEqual({ inicial: l, ofrecer: null, subirLocal: true })
  })
  it('auxiliares', () => {
    const a = prog({ actualizadoEn: '2026-01-01T00:00:00Z' })
    const b = prog({ actualizadoEn: '2026-02-01T00:00:00Z' })
    expect(masReciente(a, b)).toBe(b)
    expect(masReciente(null, a)).toBe(a)
    expect(
      mismaPosicion(prog({ modo: 'VOZ', posicionAudioSeg: 10 }), prog({ modo: 'VOZ', posicionAudioSeg: 11 })),
    ).toBe(true)
    expect(mismaPosicion(prog({ cfi: 'epubcfi(/6/2)' }), prog({ cfi: 'epubcfi(/6/4)' }))).toBe(false)
    expect(nombreDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(nombreDispositivo('Mozilla/5.0 (Linux; Android 15)')).toBe('Android')
    expect(nombreDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('PC')
    expect(
      describirPosicion(prog({ capitulo: 6, porcentaje: 41.6 }), [{ indice: 6, titulo: 'La tormenta', minutos: 30 }]),
    ).toBe('el capítulo 7 «La tormenta» (42 % del libro)')
    // QA LV-13: el título que ya dice «Capítulo 4» no se repite y el % es del libro.
    expect(
      describirPosicion(prog({ capitulo: 3, porcentaje: 68 }), [
        { indice: 3, titulo: 'Capítulo 4: El invierno largo', minutos: 30 },
      ]),
    ).toBe('«Capítulo 4: El invierno largo» (68 % del libro)')
  })
})

describe('Ordenar un estante a mano', () => {
  const L = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  it('mover', () => {
    expect(mover(L, 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(mover(L, 3, 0).map((x) => x.id)).toEqual(['d', 'a', 'b', 'c'])
    expect(mover(L, 9, 0)).toEqual(L)
  })
  it('los vecinos: despuesDe = el de la izquierda, antesDe = el de la derecha', () => {
    expect(vecinos(L, 'b')).toEqual({ despuesDe: 'a', antesDe: 'c' })
    expect(vecinos(L, 'a')).toEqual({ antesDe: 'b' })
    expect(vecinos(L, 'd')).toEqual({ despuesDe: 'c' })
    expect(vecinos(L, 'z')).toEqual({})
  })
  it('el cuerpo de /ordenar tras soltar', () => {
    expect(movimientoDeOrden(L, 0, 2)?.cuerpo).toEqual({ ejemplarId: 'a', despuesDe: 'c', antesDe: 'd' })
    expect(movimientoDeOrden(L, 3, 0)?.cuerpo).toEqual({ ejemplarId: 'd', antesDe: 'a' })
    expect(movimientoDeOrden(L, 1, 1)).toBeNull()
  })
  it('el destino según dónde se suelta el puntero', () => {
    const centros = [10, 50, 90, 130]
    expect(indiceDestino(centros, 100, 0)).toBe(2)
    expect(indiceDestino(centros, 0, 3)).toBe(0)
    expect(indiceDestino(centros, 999, 1)).toBe(3)
  })
})

describe('Cómo se ve cada libro', () => {
  it('lomos estables y dentro de sus medidas', () => {
    const l = { id: 'x', titulo: 'Niebla', minutosEstimados: 480 }
    const d = dimensionesLomo(l)
    expect(dimensionesLomo(l)).toEqual(d)
    expect(d.alto).toBeGreaterThanOrEqual(ALTO_MIN)
    expect(d.alto).toBeLessThanOrEqual(ALTO_MAX)
    expect(d.grosor).toBeGreaterThanOrEqual(GROSOR_MIN)
    expect(d.grosor).toBeLessThanOrEqual(GROSOR_MAX)
  })
  it('un libro largo es más gordo que uno corto', () => {
    expect(dimensionesLomo({ id: 'a', titulo: 'A', minutosEstimados: 2400 }).grosor).toBeGreaterThan(
      dimensionesLomo({ id: 'b', titulo: 'B', minutosEstimados: 60 }).grosor,
    )
  })
  it('el color sale de los cueros (o del fijo si es válido)', () => {
    expect(CUEROS).toContain(colorLomo({ id: '1', titulo: 'Platero' }))
    expect(colorLomo({ id: '1', titulo: 'Platero' }, '#123456')).toBe('#123456')
    expect(CUEROS).toContain(colorLomo({ id: '1', titulo: 'Platero' }, 'rojo'))
  })
})

describe('Formatos', () => {
  it('duraciones y relojes', () => {
    expect(duracion(560)).toBe('9 h 20 min')
    expect(duracion(45)).toBe('45 min')
    expect(duracion(120)).toBe('2 h')
    expect(duracion(null)).toBe('—')
    expect(reloj(75.3)).toBe('1:15')
    expect(reloj(3725)).toBe('1:02:05')
  })
  it('las fechas se dicen en la hora de Bogotá', () => {
    // 03:00 UTC del 10 de noviembre = 22:00 del 9 de noviembre en Bogotá.
    expect(fechaCorta('2026-11-10T03:00:00Z')).toBe('9 nov 2026')
    expect(fechaRelativa('2026-11-10T03:00:00Z', new Date('2026-11-10T15:00:00Z'))).toBe('ayer')
    expect(fechaRelativa('2026-11-10T14:00:00Z', new Date('2026-11-10T15:00:00Z'))).toBe('hoy')
    expect(fechaRelativa('2026-11-07T14:00:00Z', new Date('2026-11-10T15:00:00Z'))).toBe('hace 3 días')
    expect(fechaCorta('no')).toBe('')
  })
  it('preparando y legible', () => {
    expect(seEstaPreparando({ archivoId: 'a', estadoConversion: 'PROCESANDO' })).toBe(true)
    expect(sePuedeLeer({ archivoId: 'a', estadoConversion: 'LISTO', tipo: 'LIBRO' })).toBe(true)
    expect(sePuedeLeer({ archivoId: null, estadoConversion: null, tipo: 'DESEO' })).toBe(false)
  })
})
