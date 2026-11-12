import { FORMATOS_HOJA, destinoAlAbrir, esHojaDeCalculo } from '@logica/documentos'
import type { EjemplarDTO } from '@tipos'

type Doc = Pick<EjemplarDTO, 'id' | 'tipo' | 'archivoId' | 'estadoConversion' | 'formatoOriginal'>
const doc = (p: Partial<Doc> = {}): Doc => ({
  id: 'ej-1',
  tipo: 'DOCUMENTO',
  archivoId: 'ar-1',
  estadoConversion: 'LISTO',
  formatoOriginal: 'XLSX',
  ...p,
})

describe('documentos: qué se abre con qué', () => {
  it('las hojas de cálculo son XLSX, XLS, ODS y CSV (sin distinguir mayúsculas)', () => {
    expect(FORMATOS_HOJA).toEqual(['XLSX', 'XLS', 'ODS', 'CSV'])
    expect(['XLSX', 'xls', 'ODS', 'csv'].every(esHojaDeCalculo)).toBe(true)
    expect(['MD', 'DOCX', 'PDF', 'PPTX', 'TXT', '', null, undefined].some(esHojaDeCalculo)).toBe(false)
  })

  it('una hoja lista va al visor de hojas; un Markdown listo, al lector', () => {
    expect(destinoAlAbrir(doc())).toEqual({ ruta: 'Hoja', params: { id: 'ej-1' } })
    expect(destinoAlAbrir(doc({ formatoOriginal: 'CSV' })).ruta).toBe('Hoja')
    expect(destinoAlAbrir(doc({ formatoOriginal: 'MD' }))).toEqual({ ruta: 'Leer', params: { id: 'ej-1' } })
  })

  it('lo que se prepara, falló, no tiene archivo o es un deseo va a la ficha', () => {
    for (const p of [
      { estadoConversion: 'PENDIENTE' as const },
      { estadoConversion: 'PROCESANDO' as const },
      { estadoConversion: 'ERROR' as const },
      { archivoId: null },
      { tipo: 'DESEO' as const, archivoId: null, estadoConversion: null },
    ]) {
      expect(destinoAlAbrir(doc(p))).toEqual({ ruta: 'Libro', params: { id: 'ej-1' } })
    }
  })
})
