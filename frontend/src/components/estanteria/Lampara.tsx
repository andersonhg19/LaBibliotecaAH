import React from 'react'

import Svg, { Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'

import { paleta } from '@tema/colors'

/*
 * LA LÁMPARA DE BANQUERO que corona la librería (plan de diseño A): base y
 * brazo de latón, pantalla de cuero verde con su brillo y la cadenita. Debajo,
 * la bombilla encendida (un resplandor miel). El haz que cae sobre las baldas
 * lo pinta el mueble; esto es solo el objeto. SVG puro: unos cientos de bytes.
 */
const Lampara: React.FC<{ ancho?: number; encendida?: boolean }> = ({ ancho = 132, encendida = true }) => {
  const alto = ancho * 0.62
  return (
    <Svg width={ancho} height={alto} viewBox="0 0 132 82" pointerEvents="none">
      <Defs>
        <LinearGradient id="lat" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7A5A14" />
          <Stop offset="0.35" stopColor="#F3DC97" />
          <Stop offset="0.6" stopColor="#C9A227" />
          <Stop offset="1" stopColor="#6E5010" />
        </LinearGradient>
        <LinearGradient id="pantalla" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4F7A60" />
          <Stop offset="0.45" stopColor={paleta.cueroVerde} />
          <Stop offset="1" stopColor="#16261D" />
        </LinearGradient>
        <LinearGradient id="brillo" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.35" />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="luz" cx="0.5" cy="0.3" r="0.6">
          <Stop offset="0" stopColor="#FFE9B0" stopOpacity="0.95" />
          <Stop offset="0.5" stopColor="#FFC870" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#FFB050" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* La base y el brazo de latón. */}
      <Ellipse cx="66" cy="78" rx="30" ry="4" fill="url(#lat)" />
      <Rect x="40" y="70" width="52" height="8" rx="3" fill="url(#lat)" />
      <Rect x="63" y="34" width="6" height="38" rx="2" fill="url(#lat)" />
      <Rect x="58" y="62" width="16" height="9" rx="2" fill="url(#lat)" />
      {/* La bombilla encendida bajo la pantalla. */}
      {encendida ? <Ellipse cx="66" cy="40" rx="50" ry="14" fill="url(#luz)" /> : null}
      {/* La pantalla de cuero verde (medio cilindro visto de frente). */}
      <G>
        <Path d="M10 32 Q66 2 122 32 L118 40 Q66 30 14 40 Z" fill="url(#pantalla)" />
        <Path d="M10 32 Q66 2 122 32 L118 40 Q66 30 14 40 Z" fill="url(#brillo)" />
        <Path d="M14 40 Q66 30 118 40" stroke="#C9A227" strokeWidth={1.6} fill="none" />
        <Path d="M10 32 Q66 2 122 32" stroke="#0E1812" strokeOpacity={0.5} strokeWidth={1} fill="none" />
      </G>
      {/* La cadenita con su borla de latón. */}
      <Path d="M100 38 L100 56" stroke="#C9A227" strokeWidth={1} strokeDasharray="1.5 1.5" />
      <Ellipse cx="100" cy="58" rx="2.4" ry="3" fill="url(#lat)" />
    </Svg>
  )
}

/*
 * LA LÁMPARA DE GALERÍA (QA diseño 2): en el PC la lámpara ya no se apoya
 * ENCIMA del mueble (eso dejaba ~170 px de madera vacía antes de la primera
 * balda); cuelga de la cornisa como las lámparas de cuadro de las bibliotecas
 * antiguas: dos garras y un brazo de latón, y una pantalla alargada de cuero
 * verde con sus tapas de latón que alumbra hacia abajo. Mismos materiales que
 * la de banquero, así sigue siendo la misma casa.
 */
export const LamparaGaleria: React.FC<{ ancho?: number; encendida?: boolean }> = ({
  ancho = 260,
  encendida = true,
}) => {
  const alto = ancho * (70 / 240)
  return (
    <Svg width={ancho} height={alto} viewBox="0 0 240 70" pointerEvents="none">
      <Defs>
        <LinearGradient id="glat" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7A5A14" />
          <Stop offset="0.35" stopColor="#F3DC97" />
          <Stop offset="0.6" stopColor="#C9A227" />
          <Stop offset="1" stopColor="#6E5010" />
        </LinearGradient>
        <LinearGradient id="glatV" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F3DC97" />
          <Stop offset="0.5" stopColor="#C9A227" />
          <Stop offset="1" stopColor="#6E5010" />
        </LinearGradient>
        <LinearGradient id="gpantalla" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5E8C70" />
          <Stop offset="0.4" stopColor={paleta.cueroVerde} />
          <Stop offset="1" stopColor="#122019" />
        </LinearGradient>
        <LinearGradient id="gbrillo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0.3" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="gluz" cx="0.5" cy="0" r="0.8">
          <Stop offset="0" stopColor="#FFE9B0" stopOpacity="0.95" />
          <Stop offset="0.45" stopColor="#FFC870" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#FFB050" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* Las dos garras sobre el canto de la cornisa y el brazo que sale hacia delante. */}
      <Rect x="96" y="0" width="10" height="12" rx="2" fill="url(#glatV)" />
      <Rect x="134" y="0" width="10" height="12" rx="2" fill="url(#glatV)" />
      <Path d="M101 10 Q101 24 120 26 Q139 24 139 10" stroke="url(#glat)" strokeWidth={4} fill="none" />
      <Rect x="115" y="22" width="10" height="10" rx="2" fill="url(#glat)" />
      {/* El resplandor hacia abajo, sobre la primera balda. */}
      {encendida ? <Ellipse cx="120" cy="48" rx="112" ry="22" fill="url(#gluz)" /> : null}
      {/* La pantalla alargada de cuero verde, con sus tapas y su filete de latón. */}
      <Rect x="22" y="30" width="196" height="16" rx="8" fill="url(#gpantalla)" />
      <Rect x="22" y="30" width="196" height="16" rx="8" fill="url(#gbrillo)" />
      <Path d="M28 45.5 L212 45.5" stroke="#C9A227" strokeWidth={1.4} />
      <Ellipse cx="23" cy="38" rx="4" ry="8.5" fill="url(#glatV)" />
      <Ellipse cx="217" cy="38" rx="4" ry="8.5" fill="url(#glatV)" />
    </Svg>
  )
}

export default Lampara
