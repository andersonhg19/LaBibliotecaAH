import React from 'react'

import Svg, { Circle, Path, Rect } from 'react-native-svg'

/*
 * Iconos de línea de la biblioteca, todos con el mismo trazo (como en Oh
 * Churus): se pintan con el color del tema y se ven igual en todos los
 * dispositivos. `relleno` los pinta llenos (el corazón de favorito, la
 * estrella).
 */
type Dibujo = (c: string, relleno: boolean) => React.ReactNode

const P =
  (d: string, rellenable = false): Dibujo =>
  (c, relleno) => (
    <Path
      d={d}
      stroke={c}
      strokeWidth={1.8}
      fill={rellenable && relleno ? c : 'none'}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
const varios =
  (...ds: Dibujo[]): Dibujo =>
  (c, r) => (
    <>
      {ds.map((d, i) => (
        <React.Fragment key={i}>{d(c, r)}</React.Fragment>
      ))}
    </>
  )
const circulo =
  (cx: number, cy: number, rad: number, rellenable = false): Dibujo =>
  (c, r) => <Circle cx={cx} cy={cy} r={rad} stroke={c} strokeWidth={1.8} fill={rellenable && r ? c : 'none'} />
const rect =
  (x: number, y: number, w: number, h: number, rx = 1.5): Dibujo =>
  (c) => <Rect x={x} y={y} width={w} height={h} rx={rx} stroke={c} strokeWidth={1.8} fill="none" />

const DIBUJOS: Record<string, Dibujo> = {
  menu: P('M4 6h16M4 12h16M4 18h16'),
  more: varios(circulo(5, 12, 1.3, true), circulo(12, 12, 1.3, true), circulo(19, 12, 1.3, true)),
  back: P('M15 5l-7 7 7 7'),
  left: P('M15 6l-6 6 6 6'),
  right: P('M9 6l6 6-6 6'),
  down: P('M6 9l6 6 6-6'),
  up: P('M6 15l6-6 6 6'),
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  check: P('M5 12l5 5 9-10'),
  close: P('M6 6l12 12M18 6L6 18'),
  search: varios(circulo(11, 11, 6), P('M20 20l-4-4')),
  filtro: P('M4 5h16l-6 8v5l-4 2v-7z'),
  orden: P('M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3'),
  upload: P('M12 16V4M7 9l5-5 5 5M4 20h16'),
  // libros y estantes
  book: P('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5'),
  libroAbierto: P('M3 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0zM21 6c-3-1.5-6-1.5-9 0v13c3-1.5 6-1.5 9 0z'),
  lomos: varios(rect(3, 5, 4, 15, 0.8), rect(8, 3, 4, 17, 0.8), P('M14 6.5l3.6-1 3.8 14.2-3.6 1z'), P('M2 21h20')),
  rejilla: varios(rect(4, 4, 7, 9), rect(13, 4, 7, 9), rect(4, 15, 7, 5), rect(13, 15, 7, 5)),
  lista: P('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'),
  archivador: varios(rect(4, 3, 16, 18), P('M4 9.5h16M4 15h16M10 6h4M10 12h4M10 18h4')),
  bookmark: P('M6 3h12v18l-6-4-6 4z', true),
  /* Un lazo (UX-20): el deseo ya no usa la estrella de calificar. */
  deseo: varios(
    P('M12 9c-2.5-4.5-8-4.5-8-1.2S9.5 11 12 9zM12 9c2.5-4.5 8-4.5 8-1.2S14.5 11 12 9z'),
    P('M12 9l-3.5 11M12 9l3.5 11'),
    circulo(12, 9, 1.4, true),
  ),
  heart: P('M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z', true),
  star: P('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', true),
  nota: P('M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h5'),
  lapiz: P('M4 20h4L19 9l-4-4L4 16zM14 6l4 4'),
  resaltar: P('M5 19h6M14 4l6 6-8 8H6v-6z'),
  copiar: varios(rect(8, 8, 12, 12), P('M16 8V4H4v12h4')),
  trash: P('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'),
  indice: P('M4 6h2M9 6h11M4 12h2M9 12h11M6 18h2M11 18h9'),
  texto: P('M4 18L9 5l5 13M6 13.5h6M15 18l3-7 3 7M16 16h4'),
  // la voz
  play: P('M7 4.5v15l12.5-7.5z', true),
  pause: varios(P('M7 5h3.2v14H7z', true), P('M13.8 5H17v14h-3.2z', true)),
  atras15: varios(P('M4 12a8 8 0 1 0 2.4-5.7L4 8.5'), P('M4 3.5v5h5')),
  adelante15: varios(P('M20 12a8 8 0 1 1-2.4-5.7L20 8.5'), P('M20 3.5v5h-5')),
  anterior: P('M18 6v12L10 12zM7 6v12'),
  siguiente: P('M6 6v12l8-6zM17 6v12'),
  fraseAnterior: P('M11 7l-5 5 5 5M18 7l-5 5 5 5'),
  fraseSiguiente: P('M13 7l5 5-5 5M6 7l5 5-5 5'),
  auriculares: P('M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z'),
  voz: varios(
    circulo(9, 8, 3.5),
    P('M3 20c.8-3.5 3-5.5 6-5.5s5.2 2 6 5.5M17 7c1.2 1.2 1.2 3.8 0 5M19.5 5c2.4 2.4 2.4 6.6 0 9'),
  ),
  temporizador: varios(circulo(12, 13, 7.5), P('M12 9v4l2.5 2M9.5 3h5')),
  velocidad: varios(P('M4 17a8 8 0 1 1 16 0'), P('M12 17l4-5')),
  volver: P('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'),
  // sistema
  settings: varios(
    circulo(12, 12, 3),
    P('M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1'),
  ),
  logout: P('M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10'),
  luna: P('M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'),
  sol: varios(
    circulo(12, 12, 4),
    P('M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  ),
  lampara: P('M8 3h8l3 7H5zM12 10v8M8 21h8M10 18h4'),
  user: varios(circulo(12, 8, 4), P('M4 21c1-4 4-6 8-6s7 2 8 6')),
  users: varios(circulo(9, 8, 3.5), P('M2.5 20c.8-3.5 3.5-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8')),
  shield: P('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'),
  history: varios(P('M3 12a9 9 0 1 0 3-6.7L3 8'), P('M3 3v5h5M12 7v5l3 2')),
  key: varios(circulo(8, 15, 4), P('M11 12l9-9M17 6l3 3')),
  sonido: P('M4 9h4l5-4v14l-5-4H4zM16 9c1.3 1.3 1.3 4.7 0 6M18.5 6.5c2.8 2.8 2.8 8.2 0 11'),
  silencio: P('M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6'),
}

export const tieneDibujo = (nombre?: string) => !!nombre && !!DIBUJOS[nombre]

interface Props {
  nombre: string
  color: string
  tamano?: number
  relleno?: boolean
}

const Icono: React.FC<Props> = ({ nombre, color, tamano = 22, relleno = false }) => {
  const dibujo = DIBUJOS[nombre] ?? DIBUJOS.book
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 24 24" pointerEvents="none">
      {dibujo(color, relleno)}
    </Svg>
  )
}

export default Icono
