import { esWeb } from '@tema/web'

/*
 * CSS GLOBAL DE LA WEB, puesto una sola vez al arrancar:
 *   · "Reducir movimiento" (estándar 35): si el sistema lo pide, se apagan
 *     transiciones y animaciones en TODA la app, no componente a componente;
 *   · el anillo de foco de latón para quien navega con teclado;
 *   · la barra de desplazamiento fina y del color de la madera;
 *   · el fondo del documento (sin destellos blancos al cargar).
 */
export const CSS_GLOBAL = `
html,body{background:#22140C;overscroll-behavior-y:none}
*{-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid #C9A227!important;outline-offset:2px}
::-webkit-scrollbar{width:10px;height:8px}
::-webkit-scrollbar-thumb{background:rgba(139,90,43,.55);border-radius:6px}
::-webkit-scrollbar-track{background:transparent}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}
}
`

let puesto = false

export function ponerEstilosGlobales(fondo?: string): void {
  if (!esWeb || typeof document === 'undefined') return
  if (!puesto) {
    puesto = true
    const s = document.createElement('style')
    s.setAttribute('data-bah', 'global')
    s.textContent = CSS_GLOBAL
    document.head.appendChild(s)
    const meta =
      document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(document.createElement('meta'))
    meta.setAttribute('name', 'theme-color')
  }
  if (fondo) {
    document.documentElement.style.background = fondo
    document.body.style.background = fondo
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fondo)
  }
}
