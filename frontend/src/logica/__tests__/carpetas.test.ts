import {
  COLORES_DE_FAMILIA,
  arbolPlano,
  carpetaVacia,
  cuentaDeCarpeta,
  destinoAlBorrar,
  tipoDeArchivo,
} from '@logica/carpetas'
import { paleta } from '@tema'
import { contraste } from '@tema/contraste'
import type { CarpetaDTO } from '@tipos'

/*
 * EL ARCHIVADOR (contrato v1.6): tipos de archivo con su etiqueta y color, y el
 * árbol de carpetas para elegir adónde mover.
 */

const c = (id: string, padreId: string | null, nombre = id, nDocumentos = 0, nSubcarpetas = 0): CarpetaDTO => ({
  id,
  padreId,
  nombre,
  nDocumentos,
  nSubcarpetas,
})

describe('tipoDeArchivo', () => {
  it('cada formato va a su familia y lleva sus letras', () => {
    expect(tipoDeArchivo('XLSX')).toMatchObject({ familia: 'hoja', etiqueta: 'XLSX', nombre: 'hoja de cálculo' })
    expect(tipoDeArchivo('csv')).toMatchObject({ familia: 'hoja', etiqueta: 'CSV' })
    expect(tipoDeArchivo('MD')).toMatchObject({ familia: 'texto', etiqueta: 'MD' })
    expect(tipoDeArchivo('PPTX')).toMatchObject({ familia: 'presentacion', nombre: 'presentación' })
    expect(tipoDeArchivo('JSON')).toMatchObject({ familia: 'codigo' })
    expect(tipoDeArchivo('PDF')).toMatchObject({ familia: 'pdf' })
    expect(tipoDeArchivo('EPUB')).toMatchObject({ familia: 'libro' })
  })

  it('sin formato o con uno desconocido es un documento de texto', () => {
    expect(tipoDeArchivo(null)).toMatchObject({ familia: 'texto', etiqueta: 'DOC' })
    expect(tipoDeArchivo('MOBI')).toMatchObject({ familia: 'texto', etiqueta: 'MOBI' })
  })

  it('las letras marfil se leen sobre el color de cada familia (AA 4.5:1)', () => {
    for (const color of COLORES_DE_FAMILIA) expect(contraste(paleta.marfil, color)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('cuentas y borrado', () => {
  it('dice documentos y carpetas en plural, o «Vacía»', () => {
    expect(cuentaDeCarpeta(c('a', null, 'a', 3, 1))).toBe('3 documentos · 1 carpeta')
    expect(cuentaDeCarpeta(c('a', null, 'a', 1, 0))).toBe('1 documento')
    expect(cuentaDeCarpeta(c('a', null))).toBe('Vacía')
    expect(carpetaVacia(c('a', null))).toBe(true)
    expect(carpetaVacia(c('a', null, 'a', 0, 2))).toBe(false)
  })

  it('lo de dentro sube a la carpeta de arriba, con su nombre, o a la raíz', () => {
    expect(destinoAlBorrar(null, () => undefined)).toBe('la raíz del archivador')
    expect(destinoAlBorrar('p', () => 'Proyectos')).toBe('«Proyectos»')
    expect(destinoAlBorrar('p', () => 'Obra / Planos')).toBe('«Planos»')
    expect(destinoAlBorrar('p', () => undefined)).toBe('la carpeta de arriba')
  })
})

describe('arbolPlano', () => {
  const todas = [c('a', null, 'A'), c('a1', 'a', 'A1'), c('a11', 'a1', 'A11'), c('b', null, 'B')]

  it('da el nivel de cada carpeta en el orden recibido', () => {
    expect(arbolPlano(todas).map((x) => [x.id, x.nivel])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['a11', 2],
      ['b', 0],
    ])
  })

  it('al mover una carpeta quita ella y todo lo suyo', () => {
    expect(arbolPlano(todas, 'a1').map((x) => x.id)).toEqual(['a', 'b'])
    expect(arbolPlano(todas, null).map((x) => x.id)).toEqual(['a', 'a1', 'a11', 'b'])
  })

  it('aguanta un ciclo o un padre que no está', () => {
    const raras = [c('x', 'y'), c('y', 'x'), c('z', 'perdida')]
    expect(arbolPlano(raras).map((x) => x.nivel)).toEqual([2, 2, 0])
    expect(arbolPlano(raras, 'x').map((x) => x.id)).toEqual(['z'])
  })
})
