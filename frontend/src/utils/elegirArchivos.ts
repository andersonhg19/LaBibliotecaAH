/*
 * Abre el selector de archivos del navegador. En el iPhone esto abre "Archivos"
 * con iCloud Drive y Google Drive (donde Anderson guarda sus libros); en
 * Android, el selector del sistema; en el PC, el explorador.
 *
 * Tiene que llamarse DENTRO del toque del usuario: Safari no abre el selector
 * si se pide más tarde.
 */
/* Contrato v1.6: además de libros, documentos de texto y ofimática y hojas de cálculo. */
export const EXTENSIONES = [
  '.epub',
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.xhtml',
  '.rtf',
  '.odt',
  '.pptx',
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.log',
] as const

export const extensionAdmitida = (nombre: string) => EXTENSIONES.some((e) => nombre.toLowerCase().endsWith(e))

/*
 * En el iPhone/iPad, Safari traduce `accept` a tipos del sistema y deja en gris lo
 * que no reconoce (un .md, .yaml o .log de iCloud Drive no se podría elegir). Ahí
 * no se filtra en el selector: se filtra después con extensionAdmitida().
 */
export const esIOS = (nav: { userAgent?: string; maxTouchPoints?: number; platform?: string } | undefined) =>
  !!nav &&
  (/iPhone|iPad|iPod/i.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1))

export function elegirArchivos(varios = true): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve([])
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = varios
    if (!esIOS(typeof navigator === 'undefined' ? undefined : navigator))
      input.accept = [
        ...EXTENSIONES,
        'application/epub+zip',
        'application/pdf',
        'text/plain',
        'text/markdown',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ].join(',')
    input.style.position = 'fixed'
    input.style.left = '-1000px'
    input.setAttribute('aria-hidden', 'true')
    let resuelto = false
    const terminar = (lista: File[]) => {
      if (resuelto) return
      resuelto = true
      input.remove()
      resolve(lista)
    }
    input.addEventListener('change', () => terminar(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => terminar([]))
    document.body.appendChild(input)
    input.click()
  })
}
