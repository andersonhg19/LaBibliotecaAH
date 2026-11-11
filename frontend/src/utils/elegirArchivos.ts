/*
 * Abre el selector de archivos del navegador. En el iPhone esto abre "Archivos"
 * con iCloud Drive y Google Drive (donde Anderson guarda sus libros); en
 * Android, el selector del sistema; en el PC, el explorador.
 *
 * Tiene que llamarse DENTRO del toque del usuario: Safari no abre el selector
 * si se pide más tarde.
 */
export const EXTENSIONES = ['.epub', '.pdf', '.docx', '.doc', '.txt'] as const

export const extensionAdmitida = (nombre: string) => EXTENSIONES.some((e) => nombre.toLowerCase().endsWith(e))

export function elegirArchivos(): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve([])
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = [...EXTENSIONES, 'application/epub+zip', 'application/pdf', 'text/plain'].join(',')
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
