import React from 'react'

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'

import { avisoRecorte } from '@componentes/hoja/rejilla'
import type { LibroDeHojas } from '@componentes/hoja/tipos'
import type { EstadoVisor } from '@componentes/hoja/useVisorHoja'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fuentes, paleta } from '@tema'
import { web } from '@tema/web'
import { estadoElegible } from '@utils/aria'

/*
 * LO POCO QUE SE VE ALREDEDOR DE LA HOJA: las lenguetas de las hojas (como
 * pestañas de carpeta, la activa en pergamino con filete de latón), la lupa y
 * el zoom. Nada más a la vista; lo demás se hace tocando la hoja.
 */
export const ControlesHoja: React.FC<{ libro: LibroDeHojas; v: EstadoVisor }> = ({ libro, v }) => {
  const { colors } = useTheme()
  const aviso = avisoRecorte(v.hoja) ?? (libro.recortado ? 'El archivo tiene más hojas de las que se muestran.' : null)
  const n = v.coincidencias.length
  return (
    <View style={[styles.marco, { borderBottomColor: colors.border }]}>
      <View style={styles.fila}>
        {libro.hojas.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.lenguetas}
            contentContainerStyle={styles.lenguetasDentro}
            accessibilityRole="tablist"
            accessibilityLabel="Hojas del libro"
          >
            {libro.hojas.map((h, i) => {
              const activa = i === v.hojaActiva
              return (
                <Pressable
                  key={`${i}-${h.nombre}`}
                  onPress={() => v.elegirHoja(i)}
                  {...estadoElegible('tab', activa)}
                  accessibilityLabel={`Hoja ${h.nombre || i + 1}`}
                  testID={`hoja-pestana-${i}`}
                  style={[
                    styles.lengueta,
                    activa
                      ? { backgroundColor: paleta.pergamino, borderColor: paleta.laton }
                      : { backgroundColor: colors.surface, borderColor: colors.border },
                    web({ cursor: 'pointer' }),
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.lenguetaTexto,
                      { color: activa ? paleta.robleOscuro : colors.textSecondary },
                      activa && { fontFamily: fuentes.uiNegrita },
                    ]}
                  >
                    {h.nombre || `Hoja ${i + 1}`}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : (
          <Text style={[styles.unaHoja, { color: colors.textSecondary }]} numberOfLines={1}>
            {v.hoja.nombre}
          </Text>
        )}
        <View style={styles.herramientas}>
          <BotonIcono
            icono="search"
            etiqueta={v.buscando ? 'Cerrar la búsqueda' : 'Buscar en la hoja'}
            activo={v.buscando}
            onPress={() => (v.buscando ? v.cerrarBusqueda() : v.abrirBusqueda())}
            testID="hoja-buscar"
          />
          <BotonIcono icono="minus" etiqueta="Alejar" onPress={() => v.cambiarZoom(-1)} testID="hoja-alejar" />
          <Text
            style={[styles.zoom, { color: colors.textSecondary }]}
            accessibilityLabel={`Zoom ${Math.round(v.zoom * 100)} %`}
          >
            {Math.round(v.zoom * 100)} %
          </Text>
          <BotonIcono icono="plus" etiqueta="Acercar" onPress={() => v.cambiarZoom(1)} testID="hoja-acercar" />
        </View>
      </View>
      {v.buscando ? (
        <View style={styles.fila}>
          <TextInput
            value={v.texto}
            onChangeText={v.setTexto}
            placeholder="Buscar en todas las hojas…"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Texto a buscar"
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => v.saltar(1)}
            onKeyPress={(e) => {
              const k = (e.nativeEvent as { key?: string; shiftKey?: boolean }).key
              if (k === 'Escape') v.cerrarBusqueda()
            }}
            style={[
              styles.campo,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
              web({ outlineColor: colors.primary }),
            ]}
            testID="hoja-campo-busqueda"
          />
          <Text style={[styles.contador, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {v.texto.trim() ? (n ? `${v.actual >= 0 ? v.actual + 1 : 0} de ${n}` : 'Sin resultados') : ''}
          </Text>
          <BotonIcono icono="up" etiqueta="Coincidencia anterior" onPress={() => v.saltar(-1)} disabled={!n} />
          <BotonIcono icono="down" etiqueta="Coincidencia siguiente" onPress={() => v.saltar(1)} disabled={!n} />
        </View>
      ) : null}
      {aviso ? (
        <Text style={[styles.aviso, { color: colors.warning }]} testID="hoja-aviso-recorte">
          {aviso}
        </Text>
      ) : null}
    </View>
  )
}

/** La barra fina de abajo: qué celda está elegida y su texto completo (útil en el móvil). */
export const BarraSeleccion: React.FC<{ texto: string | null }> = ({ texto }) => {
  const { colors } = useTheme()
  if (!texto) return null
  return (
    <View style={[styles.barraSel, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.barraSelTexto, { color: colors.text }]} numberOfLines={2} selectable testID="hoja-seleccion">
        {texto}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  marco: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 4, gap: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lenguetas: { flex: 1 },
  lenguetasDentro: { gap: 6, alignItems: 'flex-end', paddingRight: 8 },
  lengueta: {
    minHeight: 44,
    maxWidth: 200,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopWidth: 3,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  lenguetaTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  unaHoja: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, paddingHorizontal: 6 },
  herramientas: { flexDirection: 'row', alignItems: 'center' },
  zoom: { fontFamily: fuentes.ui, fontSize: fontSize.xs, minWidth: 44, textAlign: 'center' },
  campo: {
    flex: 1,
    minWidth: 0,
    width: 0,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontFamily: fuentes.ui,
    fontSize: fontSize.sm,
  },
  contador: { fontFamily: fuentes.ui, fontSize: fontSize.xs, minWidth: 64, textAlign: 'center' },
  aviso: { fontFamily: fuentes.ui, fontSize: fontSize.xs, paddingHorizontal: 6, paddingBottom: 4 },
  barraSel: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  barraSelTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
})
