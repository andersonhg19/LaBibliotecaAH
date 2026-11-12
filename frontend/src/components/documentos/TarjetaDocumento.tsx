import React from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Icono from '@componentes/atoms/Icono'
import IconoArchivo from '@componentes/documentos/IconoArchivo'
import { tipoDeArchivo } from '@logica/carpetas'
import { fechaCorta, seEstaPreparando } from '@logica/formato'
import { fontSize, fuentes, paleta } from '@tema'
import { SOMBRA } from '@tema/materiales'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'

interface Props {
  documento: EjemplarDTO
  onAbrir: () => void
  onMenu: () => void
  /** Modo selección (mover varios): la tarjeta se marca en vez de abrirse. */
  seleccionando?: boolean
  seleccionado?: boolean
  onSeleccionar?: () => void
  /** Mantener pulsado: empezar a seleccionar. */
  onMantener?: () => void
  /** En una búsqueda: en qué carpeta está. */
  ubicacion?: string | null
}

/** "XLSX · 12 nov 2026", "preparando…" o "no se pudo convertir". */
export function metaDeDocumento(d: EjemplarDTO): string {
  const estado = seEstaPreparando(d) ? 'preparando…' : d.estadoConversion === 'ERROR' ? 'no se pudo preparar' : null
  return [tipoDeArchivo(d.formatoOriginal).etiqueta, fechaCorta(d.fechaLlegada), estado].filter(Boolean).join(' · ')
}

/*
 * UN DOCUMENTO: una hoja de papel marfil dentro del cajón, con el icono de su
 * tipo a la izquierda (la etiqueta de color dice XLSX, MD, PDF…), el título y
 * una línea de datos. Tocar abre; «⋯» da el resto. Al seleccionar varios, la
 * casilla ocupa el sitio del «⋯».
 */
const TarjetaDocumento: React.FC<Props> = ({
  documento: d,
  onAbrir,
  onMenu,
  seleccionando,
  seleccionado = false,
  onSeleccionar,
  onMantener,
  ubicacion,
}) => {
  const t = tipoDeArchivo(d.formatoOriginal)
  const meta = metaDeDocumento(d)
  const nombre = `${d.titulo}, ${t.nombre} ${t.etiqueta}${meta.includes('preparando') ? ', preparando' : ''}${
    ubicacion ? `, en ${ubicacion}` : ''
  }`
  return (
    <View style={styles.marco}>
      <Pressable
        onPress={seleccionando ? onSeleccionar : onAbrir}
        onLongPress={seleccionando ? undefined : onMantener}
        {...(seleccionando ? estadoElegible('checkbox', seleccionado) : { accessibilityRole: 'button' as const })}
        accessibilityLabel={seleccionando ? `Seleccionar ${nombre}` : `${nombre}. Abrir`}
        testID={`documento-${d.id}`}
        style={({ pressed }) => [
          styles.hoja,
          seleccionado && { borderColor: paleta.laton, borderWidth: 2 },
          web({
            boxShadow: SOMBRA[1],
            backgroundImage: 'linear-gradient(180deg, #FFFDF8 0%, #F6EEDB 100%)',
            cursor: 'pointer',
          }),
          pressed && { opacity: 0.85 },
        ]}
      >
        <IconoArchivo formato={d.formatoOriginal} />
        <View style={styles.textos}>
          <Text style={styles.titulo} numberOfLines={2}>
            {d.titulo}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
          {ubicacion ? (
            <Text style={styles.meta} numberOfLines={1}>
              en {ubicacion}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {seleccionando ? (
        <View style={[styles.casilla, seleccionado && styles.casillaMarcada]} aria-hidden pointerEvents="none">
          {seleccionado ? <Icono nombre="check" color={paleta.robleOscuro} tamano={18} /> : null}
        </View>
      ) : (
        <Pressable
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel={`Más acciones de ${d.titulo}`}
          testID={`menu-documento-${d.id}`}
          style={({ pressed }) => [styles.mas, pressed && { opacity: 0.7 }, web({ cursor: 'pointer' })]}
        >
          <Icono nombre="more" color={paleta.nogal} tamano={22} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  marco: { position: 'relative' },
  hoja: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 10,
    paddingRight: 56,
    paddingVertical: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2D3B0',
    backgroundColor: paleta.marfil,
  },
  textos: { flex: 1, gap: 2 },
  titulo: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm, color: paleta.robleOscuro },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, color: '#5A3B26' },
  mas: {
    position: 'absolute',
    right: 4,
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casilla: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -13,
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: paleta.nogal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: paleta.marfil,
  },
  casillaMarcada: { backgroundColor: paleta.laton, borderColor: paleta.laton },
})

export default TarjetaDocumento
