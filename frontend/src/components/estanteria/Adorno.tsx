import React from 'react'

import { View } from 'react-native'

import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'

import { hash } from '@logica/lomos'
import { paleta } from '@tema/colors'

/*
 * LOS OBJETOS DE LA BALDA (pulido de diseño): cuando una balda tiene pocos
 * libros, al final se apoya UN objeto pequeño —un globo terráqueo, una planta
 * en maceta de barro o un reloj de arena de latón— en vez de dejar madera
 * vacía. Uno por balda como mucho, siempre el mismo para la misma balda, y
 * mudo para el lector de pantalla: es decoración, no contenido.
 */
export type TipoAdorno = 'globo' | 'planta' | 'reloj'
export const TIPOS_ADORNO: TipoAdorno[] = ['globo', 'planta', 'reloj']

export const adornoDeBalda = (id: string): TipoAdorno =>
  (['globo', 'planta', 'reloj'] as const)[hash(`${id}|adorno`) % 3]

const Globo: React.FC<{ alto: number }> = ({ alto }) => (
  <Svg width={alto * 0.72} height={alto} viewBox="0 0 72 100" pointerEvents="none">
    <Defs>
      <RadialGradient id="mar" cx="0.38" cy="0.32" r="0.7">
        <Stop offset="0" stopColor="#7FA3B8" />
        <Stop offset="1" stopColor="#24404F" />
      </RadialGradient>
      <LinearGradient id="latonG" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#7A5A14" />
        <Stop offset="0.45" stopColor="#F3DC97" />
        <Stop offset="1" stopColor="#8C6A1C" />
      </LinearGradient>
    </Defs>
    <Circle cx="36" cy="40" r="27" fill="url(#mar)" />
    <Path
      d="M22 26c6-4 12-2 14 3s-3 8 1 12-2 9-7 8-8-6-10-10 0-10 2-13zM44 22c5 1 9 5 9 9s-4 4-6 2-6-3-5-7 0-4 2-4zM45 46c4-1 8 2 7 7s-6 8-9 6-1-12 2-13z"
      fill="#B9A46A"
      opacity={0.85}
    />
    <Path d="M8 40a28 28 0 0 1 56 0" stroke="url(#latonG)" strokeWidth={2.4} fill="none" />
    <Rect x="34" y="68" width="4" height="18" fill="url(#latonG)" />
    <Ellipse cx="36" cy="92" rx="18" ry="5" fill="url(#latonG)" />
  </Svg>
)

const Planta: React.FC<{ alto: number }> = ({ alto }) => (
  <Svg width={alto * 0.7} height={alto} viewBox="0 0 70 100" pointerEvents="none">
    <Defs>
      <LinearGradient id="barro" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#7A3B1E" />
        <Stop offset="0.5" stopColor={paleta.cedro} />
        <Stop offset="1" stopColor="#6A3219" />
      </LinearGradient>
    </Defs>
    <Path d="M35 62C30 44 18 38 10 36c8 8 14 16 22 26z" fill="#4F6E4A" />
    <Path d="M35 62C38 40 50 30 62 28c-8 10-16 20-25 34z" fill="#5E8257" />
    <Path d="M35 62C34 38 34 22 36 10c4 14 4 32 1 52z" fill="#3F5C3B" />
    <Path d="M35 62C26 52 20 52 14 54c8 2 13 5 19 10z" fill="#6B8F62" />
    <Path d="M18 62h34l-5 34H23z" fill="url(#barro)" />
    <Rect x="15" y="60" width="40" height="7" rx="2" fill="#8A4A26" />
  </Svg>
)

const Reloj: React.FC<{ alto: number }> = ({ alto }) => (
  <Svg width={alto * 0.56} height={alto} viewBox="0 0 56 100" pointerEvents="none">
    <Defs>
      <LinearGradient id="latonR" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#7A5A14" />
        <Stop offset="0.45" stopColor="#F3DC97" />
        <Stop offset="1" stopColor="#8C6A1C" />
      </LinearGradient>
    </Defs>
    <Rect x="6" y="6" width="44" height="7" rx="2" fill="url(#latonR)" />
    <Rect x="6" y="87" width="44" height="7" rx="2" fill="url(#latonR)" />
    <Rect x="9" y="13" width="3" height="74" fill="url(#latonR)" />
    <Rect x="44" y="13" width="3" height="74" fill="url(#latonR)" />
    <Path
      d="M15 14h26c0 18-10 26-13 36 3 10 13 18 13 36H15c0-18 10-26 13-36-3-10-13-18-13-36z"
      fill="rgba(251,247,238,0.18)"
      stroke="rgba(251,247,238,0.5)"
      strokeWidth={1}
    />
    <Path d="M20 30h16c-2 8-6 12-8 18-2-6-6-10-8-18z" fill={paleta.miel} />
    <Path d="M17 86c2-9 7-14 11-16 4 2 9 7 11 16z" fill={paleta.miel} />
  </Svg>
)

const Adorno: React.FC<{ tipo: TipoAdorno; alto?: number }> = ({ tipo, alto = 96 }) => (
  <View
    accessible={false}
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    testID={`adorno-${tipo}`}
  >
    {tipo === 'globo' ? <Globo alto={alto} /> : tipo === 'planta' ? <Planta alto={alto} /> : <Reloj alto={alto} />}
  </View>
)

export default Adorno
