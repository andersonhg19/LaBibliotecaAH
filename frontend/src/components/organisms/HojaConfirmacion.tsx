import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { fibraPapel, laton } from '@tema/madera'
import { SOMBRA } from '@tema/materiales'
import { reducirMovimiento, web } from '@tema/web'
import { PedidoConfirmacion, registrarConfirmacion } from '@utils/confirmar'

/*
 * LA HOJA DE CONFIRMACIÓN DE LA CASA (QA diseño 4). Sustituye al
 * `window.confirm` gris del navegador: papel pergamino con filete de latón,
 * el título en Cormorant, el texto y dos botones: «Cancelar» de latón y la
 * acción en burdeos si borra o retira algo. En el teléfono sube desde abajo;
 * en el PC es una tarjeta centrada.
 *
 * Accesible: `alertdialog` con su título y su texto enlazados; al abrir, el
 * foco va a «Cancelar» (lo seguro); Escape o tocar fuera cancelan; al cerrar,
 * el foco vuelve a donde estaba.
 */
const HojaConfirmacion: React.FC = () => {
  const { isDark } = useTheme()
  const { width } = useWindowDimensions()
  const escritorio = width >= 820
  const [pedido, setPedido] = useState<PedidoConfirmacion | null>(null)
  const antes = useRef<HTMLElement | null>(null)
  const cancelar = useRef<View>(null)
  const actual = useRef<PedidoConfirmacion | null>(null)
  actual.current = pedido

  useEffect(
    () =>
      registrarConfirmacion((p) => {
        if (Platform.OS === 'web' && typeof document !== 'undefined')
          antes.current = document.activeElement as HTMLElement | null
        actual.current = p
        setPedido(p)
      }),
    [],
  )

  /* Al abrir, el foco a «Cancelar» (en la web, tras pintarse el modal). */
  useEffect(() => {
    if (!pedido || Platform.OS !== 'web') return
    const t = setTimeout(() => (cancelar.current as unknown as HTMLElement | null)?.focus?.(), 30)
    return () => clearTimeout(t)
  }, [pedido])

  const cerrar = useCallback((confirmado: boolean) => {
    const p = actual.current
    actual.current = null
    setPedido(null)
    if (p && confirmado) p.onConfirmar()
    const previo = antes.current
    antes.current = null
    if (previo && typeof previo.focus === 'function') setTimeout(() => previo.focus(), 0)
  }, [])

  const visible = !!pedido
  const destructiva = pedido?.destructiva ?? false

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducirMovimiento() ? 'none' : escritorio ? 'fade' : 'slide'}
      onRequestClose={() => cerrar(false)}
    >
      <View
        style={[
          styles.velo,
          { backgroundColor: isDark ? 'rgba(16,9,5,0.72)' : 'rgba(43,26,16,0.55)' },
          { justifyContent: escritorio ? 'center' : 'flex-end' },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => cerrar(false)}
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          {...({ tabIndex: -1 } as object)}
        />
        {pedido ? (
          <View
            testID="hoja-confirmacion"
            accessibilityViewIsModal
            {...({
              role: 'alertdialog',
              'aria-modal': true,
              'aria-labelledby': 'confirmacion-titulo',
              'aria-describedby': 'confirmacion-texto',
            } as object)}
            style={[
              styles.hoja,
              {
                backgroundColor: paleta.pergamino,
                borderColor: paleta.laton,
                borderRadius: escritorio ? 18 : 0,
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                maxWidth: escritorio ? 460 : undefined,
              },
              web({
                backgroundImage: `${fibraPapel}, linear-gradient(180deg, ${paleta.marfil}, ${paleta.pergamino})`,
                boxShadow: `${SOMBRA[3]}, inset 0 0 0 4px rgba(201,162,39,0.16)`,
                paddingBottom: escritorio ? 22 : 'calc(22px + env(safe-area-inset-bottom))',
              }),
            ]}
          >
            <View style={[styles.filete, { backgroundColor: destructiva ? paleta.burdeos : paleta.laton }]} />
            <Text style={styles.titulo} nativeID="confirmacion-titulo" accessibilityRole="header">
              {pedido.titulo}
            </Text>
            <Text style={styles.texto} nativeID="confirmacion-texto">
              {pedido.mensaje}
            </Text>
            <View style={[styles.botones, !escritorio && styles.botonesMovil]}>
              <Pressable
                ref={cancelar}
                onPress={() => cerrar(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                testID="confirmacion-cancelar"
                style={({ pressed }) => [
                  styles.boton,
                  styles.botonCancelar,
                  !escritorio && styles.botonMovil,
                  web({
                    backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.35), rgba(0,0,0,0.08)), ${laton}`,
                    boxShadow: 'inset 0 1px 0 rgba(255,245,215,0.7), 0 2px 6px rgba(43,26,16,0.35)',
                    cursor: 'pointer',
                  }),
                  pressed && styles.presionado,
                ]}
              >
                <Text style={[styles.botonTexto, { color: paleta.robleOscuro }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => cerrar(true)}
                accessibilityRole="button"
                accessibilityLabel={pedido.textoConfirmar}
                testID="confirmacion-aceptar"
                style={({ pressed }) => [
                  styles.boton,
                  { backgroundColor: destructiva ? paleta.burdeos : paleta.nogal },
                  !escritorio && styles.botonMovil,
                  web({
                    backgroundImage: destructiva
                      ? 'linear-gradient(180deg, #8A2E3B 0%, #6B1F2A 55%, #4E1520 100%)'
                      : 'linear-gradient(180deg, #6B4A30 0%, #4A2E1C 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,220,200,0.35), 0 2px 6px rgba(43,26,16,0.4)',
                    cursor: 'pointer',
                  }),
                  pressed && styles.presionado,
                ]}
              >
                <Text style={[styles.botonTexto, { color: paleta.pergamino }]}>{pedido.textoConfirmar}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  velo: { flex: 1, alignItems: 'center' },
  hoja: { width: '100%', borderWidth: 1, padding: 22, paddingTop: 18, gap: 10 },
  filete: { alignSelf: 'center', width: 56, height: 4, borderRadius: 2, marginBottom: 4 },
  titulo: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.xl,
    lineHeight: 30,
    color: paleta.robleOscuro,
    textAlign: 'center',
  },
  texto: { fontFamily: fuentes.ui, fontSize: fontSize.sm, lineHeight: 22, color: paleta.nogal, textAlign: 'center' },
  botones: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 },
  botonesMovil: { flexDirection: 'column-reverse', alignItems: 'stretch' },
  boton: {
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonMovil: { minWidth: 0 },
  botonCancelar: { backgroundColor: paleta.laton },
  botonTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
  presionado: { opacity: 0.88, transform: [{ scale: 0.97 }] },
})

export default HojaConfirmacion
