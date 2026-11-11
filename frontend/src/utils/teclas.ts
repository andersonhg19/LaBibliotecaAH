/**
 * Teclas con las que un deslizador fija su valor al soltarlas (QA LV-P6): solo
 * las que lo mueven. Tab (al llegar con el teclado), Mayús o cualquier otra no
 * lo hacen saltar a ninguna parte.
 */
export const TECLAS_DESLIZADOR = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
] as const

export const teclaMueveDeslizador = (tecla: string): boolean => (TECLAS_DESLIZADOR as readonly string[]).includes(tecla)
