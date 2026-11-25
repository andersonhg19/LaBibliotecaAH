import React, { useCallback, useEffect, useState } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import AppText from '@componentes/atoms/Text'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { plural } from '@logica/formato'
import { tamanoLegible, textoSinConexion } from '@logica/leyendo'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { MENSAJES } from '@utils/mensajes'
import {
  type ProgresoSinConexion,
  escucharSinConexion,
  listarSinConexion,
  olvidarSinConexion,
  sinConexionDisponible,
} from '@utils/sinConexion'

/** Lo que se dice de una copia: «Completo», «Guardando 12/40»… */
export function estadoDeCopia(p: ProgresoSinConexion): string {
  if (p.estado === 'completo') return `Completo · ${plural(p.total, 'capítulo')}`
  if (p.estado === 'error') return 'Falló; se reintenta solo'
  if (p.estado === 'no-disponible') return 'No se puede guardar aquí'
  return textoSinConexion(p) ?? p.mensaje ?? ''
}

/*
 * 0.5.0 (C12) · AJUSTES › SIN CONEXIÓN: los libros guardados en ESTE
 * dispositivo para escucharlos sin red, cuánto ocupan y un botón para borrar
 * una copia (no toca el servidor). Si el navegador no puede guardar (Safari
 * fuera de la pantalla de inicio, modo privado), una línea dice cómo hacerlo.
 */
const SinConexionAjustes: React.FC = () => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [copias, setCopias] = useState<ProgresoSinConexion[] | null>(null)
  const [titulos, setTitulos] = useState<Record<string, string>>({})
  const [borrando, setBorrando] = useState<string | null>(null)
  const disponible = (() => {
    try {
      return sinConexionDisponible()
    } catch {
      return false
    }
  })()

  const cargar = useCallback(async () => {
    try {
      setCopias((await listarSinConexion()) ?? [])
    } catch (e) {
      console.warn('[ajustes] sin conexión', e)
      setCopias([])
    }
  }, [])

  useEffect(() => {
    cargar()
    let baja: (() => void) | undefined
    try {
      baja = escucharSinConexion(() => {
        cargar()
      })
    } catch {
      baja = undefined
    }
    return () => baja?.()
  }, [cargar])

  /* Los títulos: las copias son de libros en «Leyendo» (los de antes, por su id, si ya no están). */
  useEffect(() => {
    if (!copias?.length) return
    let vivo = true
    Promise.resolve()
      .then(() => librosService.todos({ pestana: 'LEYENDO', page: 0, size: 200 }))
      .then((r) => {
        if (!vivo || !r?.correct) return
        setTitulos(Object.fromEntries(r.object.list.map((l) => [l.id, l.titulo])))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [copias?.length])

  const borrar = async (id: string) => {
    if (borrando) return
    setBorrando(id)
    try {
      await olvidarSinConexion(id)
      showToast('success', MENSAJES.sinConexionBorrada)
      await cargar()
    } catch (e) {
      console.warn('[ajustes] no se pudo borrar la copia', e)
      showToast('error', MENSAJES.errorGuardar)
    } finally {
      setBorrando(null)
    }
  }

  const lista = copias ?? []
  const total = lista.reduce((a, p) => a + (p.bytes || 0), 0)

  return (
    <View style={styles.caja} testID="ajustes-sin-conexion">
      {!disponible ? (
        <AppText variant="caption" testID="sin-conexion-no-disponible">
          {MENSAJES.sinConexionNoDisponible}
        </AppText>
      ) : null}
      {disponible && copias && !lista.length ? <AppText variant="caption">{MENSAJES.sinConexionVacio}</AppText> : null}
      {lista.length ? (
        <>
          <Text style={[styles.total, { color: colors.text }]} testID="sin-conexion-total">
            {plural(lista.length, 'libro')} en este dispositivo · {tamanoLegible(total)}
          </Text>
          {lista.map((p) => {
            const titulo = titulos[p.ejemplarId] ?? 'Libro que ya no está en «Leyendo»'
            return (
              <View key={p.ejemplarId} style={[styles.fila, { borderBottomColor: colors.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.titulo, { color: colors.text }]} numberOfLines={2}>
                    {titulo}
                  </Text>
                  <Text style={[styles.detalle, { color: colors.textSecondary }]}>
                    {estadoDeCopia(p)} · {tamanoLegible(p.bytes)}
                  </Text>
                </View>
                <BotonIcono
                  icono="trash"
                  etiqueta={`Borrar de este dispositivo la copia de «${titulo}»`}
                  onPress={() => borrar(p.ejemplarId)}
                  disabled={!!borrando}
                  testID={`borrar-copia-${p.ejemplarId}`}
                />
              </View>
            )
          })}
          <AppText variant="caption">{MENSAJES.sinConexionVuelve}</AppText>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { gap: 8 },
  flex: { flex: 1 },
  total: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm, fontVariant: ['lining-nums'] },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titulo: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  detalle: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
})

export default SinConexionAjustes
