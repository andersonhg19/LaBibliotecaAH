import { esWeb } from '@tema/web'

/*
 * CSS GLOBAL DE LA WEB, puesto una sola vez al arrancar:
 *   · "Reducir movimiento" (estándar 35): si el sistema lo pide, se apagan
 *     transiciones y animaciones en TODA la app, no componente a componente;
 *   · el anillo de foco de latón para quien navega con teclado;
 *   · la barra de desplazamiento fina y del color de la madera;
 *   · el fondo del documento (sin destellos blancos al cargar);
 *   · los fotogramas de los efectos (polvo en el haz de la lámpara, la mano de
 *     la guía, la llegada de la portada): los usan los estilos con
 *     animationName. Con "Reducir movimiento" duran 0,001 ms y acaban invisibles.
 */
export const CSS_GLOBAL = `
html,body{background:#22140C;overscroll-behavior-y:none}
*{-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid #C9A227!important;outline-offset:2px}
::-webkit-scrollbar{width:10px;height:8px}
::-webkit-scrollbar-thumb{background:rgba(139,90,43,.55);border-radius:6px}
::-webkit-scrollbar-track{background:transparent}
@keyframes bah-polvo{0%{transform:translate3d(0,0,0);opacity:0}15%{opacity:.85}85%{opacity:.6}100%{transform:translate3d(18px,140px,0);opacity:0}}
@keyframes bah-mano{0%{transform:translate3d(0,0,0) scale(1);opacity:0}12%{opacity:1}30%{transform:translate3d(0,0,0) scale(.92)}70%{transform:translate3d(0,-120px,0) scale(.92);opacity:1}100%{transform:translate3d(0,-120px,0) scale(1);opacity:0}}
@keyframes bah-llega{0%{opacity:0;transform:translateY(8px) scale(1.03)}100%{opacity:1;transform:none}}
@keyframes bah-mano-corta{0%{transform:translate3d(0,0,0) scale(.6);opacity:0}15%{opacity:1}35%{transform:translate3d(0,0,0) scale(.55)}75%{transform:translate3d(0,-22px,0) scale(.55);opacity:1}100%{transform:translate3d(0,-22px,0) scale(.6);opacity:0}}
@keyframes bah-aparece{0%{opacity:0}100%{opacity:1}}
@keyframes bah-luz{0%,100%{opacity:.92}50%{opacity:1}}
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
