import React, { useCallback, useEffect, useRef, useState } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { preparacionService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { PreparacionLibroDTO } from '@tipos'
import { mensajeDelServidor } from '@utils/mensajes'

/*
 * «PREPARAR EL LIBRO ENTERO» (F9, contrato C5, I-16): pide al taller que deje
 * lista la voz de todos los capítulos que van en el audiolibro, detrás de lo
 * urgente, para escuchar sin esperas (en el coche, sin red buena). Una barra
 * dice «12 de 40 listos» y se va actualizando mientras quede algo en cola.
 * Pedirlo dos veces no duplica nada (el servidor es idempotente).
 *
 * Si el servidor aún no tiene la ruta (0.3.3) no se enseña.
 */

export const CADA_MS = 5000

/** «12 de 40 listos», «Todo el libro listo», «… · 2 con error». Puro. */
export function textoPreparacion(p: PreparacionLibroDTO): string {
  if (p.total <= 0) return 'Este libro no tiene capítulos con voz.'
  const err = p.error > 0 ? ` · ${p.error} con error` : ''
  if (p.listos >= p.total) return 'Todo el libro está listo para escuchar sin esperas.'
  return `${p.listos} de ${p.total} capítulos listos${p.enCola > 0 ? ' · preparando…' : ''}${err}`
}

const PrepararLibro: React.FC<{ ejemplarId: string; vozId: string }> = ({ ejemplarId, vozId }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [estado, setEstado] = useState<PreparacionLibroDTO | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const vivo = useRef(true)

  const consultar = useCallback(async () => {
    try {
      const r = await preparacionService.estado(ejemplarId, vozId)
      if (vivo.current) setEstado(r?.correct ? r.object : null)
    } catch {
      if (vivo.current) setEstado(null)
    }
  }, [ejemplarId, vozId])

  useEffect(() => {
    vivo.current = true
    consultar()
    return () => {
      vivo.current = false
    }
  }, [consultar])

  // Mientras quede algo en cola, se vuelve a preguntar.
  useEffect(() => {
    if (!estado || estado.enCola <= 0) return
    const t = setTimeout(consultar, CADA_MS)
    return () => clearTimeout(t)
  }, [estado, consultar])

  if (!estado || estado.total <= 0) return null
  const completo = estado.listos >= estado.total
  const pct = (estado.listos / estado.total) * 100

  const preparar = async () => {
    setPidiendo(true)
    try {
      const r = await preparacionService.preparar(ejemplarId, vozId)
      if (!r.correct) throw new Error(r.message)
      showToast('success', 'La casa irá preparando la voz del libro entero.')
      await consultar()
    } catch (e) {
      showToast('error', 'No se pudo pedir', mensajeDelServidor(e, 'Inténtalo en un rato.'))
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <View style={[styles.caja, { borderColor: colors.border, backgroundColor: colors.card }]} testID="preparar-libro">
      <Text style={[styles.texto, { color: colors.text }]} accessibilityLiveRegion="polite">
        {textoPreparacion(estado)}
      </Text>
      <Barra porcentaje={pct} alto={6} etiqueta="Voz preparada" />
      {!completo && estado.enCola <= 0 ? (
        <Button
          title="Preparar el libro entero"
          icono="auriculares"
          variant="secondary"
          size="small"
          onPress={preparar}
          loading={pidiendo}
          testID="boton-preparar-libro"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  texto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm, fontVariant: ['lining-nums', 'tabular-nums'] },
})

export default PrepararLibro
