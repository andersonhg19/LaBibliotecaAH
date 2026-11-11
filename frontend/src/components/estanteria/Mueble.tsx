import React from 'react'

import { StyleSheet, View } from 'react-native'

import Lampara, { LamparaGaleria } from '@componentes/estanteria/Lampara'
import { useTheme } from '@contextos/ThemeContext'
import { cornisa, fondoMueble, hazLampara, montante, tablaEstante } from '@tema/madera'
import { web } from '@tema/web'

/*
 * UN MUEBLE DE VERDAD, NO UNA CAJA OSCURA (plan de diseño A, el de mayor
 * impacto). La librería tiene:
 *   · una CORNISA con moldura de dentellones arriba, y encima la lámpara de
 *     banquero (latón y cuero verde);
 *   · el HAZ cálido de la lámpara cayendo sobre las baldas de arriba, con unas
 *     motas de polvo flotando (se van con "Reducir movimiento"); de día, el haz
 *     es la luz de una ventana en diagonal;
 *   · los COSTADOS (montantes) de roble con veta vertical y canto biselado;
 *   · el FONDO de roble oscuro, iluminado al centro;
 *   · un RODAPIÉ abajo.
 * Las baldas (Estante) van dentro. En el PC se reparten en módulos de ~420 px
 * (ver Modulo): una balda de 1400 px con siete lomos parecía vacía.
 */
const MOTAS = [
  { left: '38%', top: 40, retraso: '0s', tam: 3 },
  { left: '47%', top: 90, retraso: '2.2s', tam: 2 },
  { left: '55%', top: 20, retraso: '4.1s', tam: 2.5 },
  { left: '61%', top: 140, retraso: '6.3s', tam: 2 },
  { left: '43%', top: 180, retraso: '3.4s', tam: 1.5 },
  { left: '52%', top: 120, retraso: '7.5s', tam: 2 },
] as const

/** El ancho de la lámpara: en el PC, 1,5 veces la del teléfono (si no, parece de juguete sobre un mueble de 1400 px). */
export const anchoLampara = (grande: boolean, noche: boolean) => Math.round((noche ? 132 : 118) * (grande ? 1.5 : 1))

/**
 * Qué lámpara lleva el mueble (QA diseño 2 y 3):
 *   · 'pie'     la de banquero apoyada en la cornisa (teléfono en vertical);
 *   · 'galeria' colgada de la cornisa, sin hueco encima (PC: se ven dos baldas al abrir);
 *   · 'ninguna' solo el haz (pantallas bajas, UX-12: la lámpara se comía media pantalla).
 */
export type TipoLampara = 'pie' | 'galeria' | 'ninguna'
export const lamparaDelMueble = (grande: boolean, apaisado: boolean): TipoLampara =>
  apaisado ? 'ninguna' : grande ? 'galeria' : 'pie'
/** El hueco de madera que la lámpara pide ENCIMA del mueble. */
export const huecoDeLampara = (tipo: TipoLampara, ancho: number) => (tipo === 'pie' ? Math.round(ancho * 0.62) + 4 : 0)
export const ANCHO_GALERIA = 280

const Mueble: React.FC<{ children: React.ReactNode; testID?: string; grande?: boolean; apaisado?: boolean }> = ({
  children,
  testID,
  grande = false,
  apaisado = false,
}) => {
  const { isDark } = useTheme()
  const tipo = lamparaDelMueble(grande, apaisado)
  const ancho = anchoLampara(grande, isDark)
  const altoLampara = Math.round(ancho * 0.62)
  return (
    <View style={[styles.mueble, { marginTop: huecoDeLampara(tipo, ancho) }]} testID={testID}>
      {/* La lámpara de banquero APOYADA en la cornisa: su base toca el canto de arriba. */}
      {tipo === 'pie' ? (
        <View style={[styles.lampara, { top: -(altoLampara - 3) }]} pointerEvents="none" testID="lampara-pie">
          <Lampara ancho={ancho} encendida={isDark} />
        </View>
      ) : null}
      {/* La de galería, COLGADA de la cornisa: garras en el canto y la pantalla sobre la primera balda. */}
      {tipo === 'galeria' ? (
        <View style={[styles.lampara, styles.galeria]} pointerEvents="none" testID="lampara-galeria">
          <LamparaGaleria ancho={ANCHO_GALERIA} encendida={isDark} />
        </View>
      ) : null}
      <View
        accessible={false}
        style={[
          styles.cornisa,
          { backgroundColor: isDark ? '#6E4524' : '#B98149' },
          web({
            backgroundImage: cornisa(isDark),
            boxShadow: '0 10px 16px -6px rgba(20,10,4,0.75), inset 0 1px 0 rgba(255,225,170,0.45)',
          }),
        ]}
      />
      {/* La luz de la bombilla se derrama sobre la cornisa y la primera balda. */}
      {isDark && tipo !== 'ninguna' ? (
        <View
          pointerEvents="none"
          accessible={false}
          style={[
            styles.derrame,
            tipo === 'galeria' && { top: 30 },
            web({
              backgroundImage:
                'radial-gradient(ellipse 50% 70% at 50% 0%, rgba(255,214,140,0.42), rgba(255,190,110,0.14) 45%, rgba(0,0,0,0) 78%)',
              mixBlendMode: 'screen',
            }),
          ]}
        />
      ) : null}
      <View style={styles.cuerpo}>
        <Costado />
        <View
          style={[
            styles.interior,
            { backgroundColor: isDark ? '#2B1A10' : '#B07A45' },
            web({
              backgroundImage: fondoMueble(isDark),
              boxShadow:
                'inset 0 18px 22px -6px rgba(10,5,2,0.75), inset 14px 0 18px -8px rgba(10,5,2,0.6), inset -14px 0 18px -8px rgba(10,5,2,0.6)',
            }),
          ]}
        >
          {/* El haz de la lámpara (o de la ventana) y el polvo que flota en él. */}
          <View
            pointerEvents="none"
            accessible={false}
            style={[
              styles.haz,
              web({
                backgroundImage: hazLampara(isDark),
                animationName: 'bah-luz',
                animationDuration: '7s',
                animationIterationCount: 'infinite',
              }),
            ]}
          >
            {isDark
              ? MOTAS.map((m, i) => (
                  <View
                    key={i}
                    style={[
                      styles.mota,
                      { left: m.left, top: m.top, width: m.tam, height: m.tam },
                      web({
                        animationName: 'bah-polvo',
                        animationDuration: '9s',
                        animationDelay: m.retraso,
                        animationIterationCount: 'infinite',
                        animationTimingFunction: 'linear',
                        boxShadow: '0 0 4px rgba(255,220,150,0.9)',
                      }),
                    ]}
                  />
                ))
              : null}
          </View>
          {children}
        </View>
        <Costado />
      </View>
      <View
        accessible={false}
        style={[
          styles.rodapie,
          { backgroundColor: isDark ? '#4A2E1C' : '#9A6935' },
          web({ backgroundImage: tablaEstante(isDark), boxShadow: '0 12px 18px -8px rgba(10,5,2,0.7)' }),
        ]}
      />
    </View>
  )
}

/** Un costado del mueble: roble con veta vertical y el canto biselado. */
const Costado: React.FC = () => {
  const { isDark } = useTheme()
  return (
    <View
      accessible={false}
      style={[
        styles.costado,
        { backgroundColor: isDark ? '#6E4524' : '#B98149' },
        web({
          backgroundImage: montante(isDark),
          boxShadow: 'inset 1px 0 0 rgba(255,225,170,0.35), inset -1px 0 0 rgba(0,0,0,0.4)',
        }),
      ]}
    />
  )
}

/**
 * Un módulo del mueble en el PC (una columna de ~420 px). Entre módulo y
 * módulo, un montante fino, como en las librerías modulares de verdad.
 */
export const Modulo: React.FC<{ children: React.ReactNode; ancho: `${number}%`; conSeparador: boolean }> = ({
  children,
  ancho,
  conSeparador,
}) => {
  const { isDark } = useTheme()
  return (
    <View style={[styles.modulo, { width: ancho }]}>
      {conSeparador ? (
        <View
          accessible={false}
          style={[
            styles.separador,
            { backgroundColor: isDark ? '#6E4524' : '#B98149' },
            web({
              backgroundImage: montante(isDark),
              boxShadow: '4px 0 10px rgba(10,5,2,0.5), -4px 0 10px rgba(10,5,2,0.5)',
            }),
          ]}
        />
      ) : null}
      <View style={styles.flex}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mueble: { width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: 6 },
  /* La lámpara se apoya SOBRE la cornisa (su base toca el canto de arriba). */
  lampara: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  galeria: { top: 4 },
  derrame: { position: 'absolute', top: -6, left: '25%', right: '25%', height: 260, zIndex: 2 },
  cornisa: { height: 26, marginHorizontal: -6, borderTopLeftRadius: 3, borderTopRightRadius: 3, zIndex: 1 },
  cuerpo: { flexDirection: 'row' },
  costado: { width: 14 },
  interior: { flex: 1, paddingTop: 10, overflow: 'hidden' },
  haz: { position: 'absolute', top: 0, left: 0, right: 0, height: 620 },
  mota: { position: 'absolute', borderRadius: 2, backgroundColor: 'rgba(255,228,170,0.85)', opacity: 0 },
  rodapie: { height: 22, marginHorizontal: -4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  modulo: { flexDirection: 'row' },
  separador: { width: 12 },
})

export default Mueble
