import React, { useEffect, useState } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { estadoCasaService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { EstadoCasaDTO } from '@tipos'

/*
 * LA LÁMPARA DE LA CASA (F11, contrato C6). Una luz pequeña que dice, en
 * palabras de casa, si el taller que prepara las voces, el traductor y el
 * disco de los libros están despiertos. Encendida y quieta cuando todo va
 * bien; ámbar si el taller va lento; apagada si algo está caído.
 *
 * El servidor guarda la respuesta 15 s; aquí también, para no preguntar en
 * cada ficha. Si el servidor aún no tiene la ruta (0.3.3), no se pinta nada.
 */

const CACHE_MS = 15_000
let cache: { t: number; dato: EstadoCasaDTO | null } | null = null
/** Para las pruebas. */
export const olvidarEstadoCasa = () => {
  cache = null
}

export async function pedirEstadoCasa(ahora = Date.now()): Promise<EstadoCasaDTO | null> {
  if (cache && ahora - cache.t < CACHE_MS) return cache.dato
  let dato: EstadoCasaDTO | null = null
  try {
    const r = await estadoCasaService.obtener()
    dato = r?.correct ? r.object : null
  } catch (e) {
    console.warn('[casa] no se pudo saber el estado de la casa', e)
  }
  cache = { t: ahora, dato }
  return dato
}

export type Luz = 'encendida' | 'tenue' | 'apagada'

/** La luz y la frase, en palabras de casa. Pura: la usan la lámpara y las pruebas. */
export function leerCasa(e: EstadoCasaDTO): { luz: Luz; frase: string } {
  if (e.disco === 'DESCONECTADO')
    return {
      luz: 'apagada',
      frase: e.mensaje || 'El disco de los libros no está conectado: lo nuevo tendrá que esperar.',
    }
  if (e.taller === 'CAIDO')
    return { luz: 'apagada', frase: e.mensaje || 'El taller de la casa está apagado: las voces nuevas esperarán.' }
  if (e.taller === 'LENTO') {
    const cola = e.colaVoz > 0 ? ` (${e.colaVoz} capítulo${e.colaVoz === 1 ? '' : 's'} en cola)` : ''
    return { luz: 'tenue', frase: e.mensaje || `El taller va despacio${cola}: las voces tardarán un poco.` }
  }
  if (e.traductor === 'CAIDO')
    return { luz: 'tenue', frase: e.mensaje || 'El traductor está descansando; lo demás funciona.' }
  const cola = e.colaVoz > 0 ? ` Preparando ${e.colaVoz} capítulo${e.colaVoz === 1 ? '' : 's'}.` : ''
  return { luz: 'encendida', frase: e.mensaje || `La casa está despierta.${cola}` }
}

const COLOR: Record<Luz, string> = { encendida: '#E7C37A', tenue: '#D98A3A', apagada: '#7A6A5A' }

const LamparaCasa: React.FC<{ testID?: string }> = ({ testID = 'lampara-casa' }) => {
  const { colors } = useTheme()
  const [estado, setEstado] = useState<EstadoCasaDTO | null>(null)
  useEffect(() => {
    let vivo = true
    pedirEstadoCasa().then((d) => vivo && setEstado(d))
    return () => {
      vivo = false
    }
  }, [])
  if (!estado) return null
  const { luz, frase } = leerCasa(estado)
  const c = COLOR[luz]
  return (
    <View style={styles.fila} testID={testID} accessible accessibilityLiveRegion="polite" accessibilityLabel={frase}>
      <View
        style={[
          styles.bombilla,
          { backgroundColor: c, opacity: luz === 'apagada' ? 0.55 : 1 },
          web({ boxShadow: luz === 'apagada' ? 'none' : `0 0 8px 2px ${c}88` }),
        ]}
      />
      <Text style={[styles.texto, { color: colors.textSecondary }]}>{frase}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  bombilla: { width: 10, height: 10, borderRadius: 5 },
  texto: { flex: 1, fontFamily: fuentes.ui, fontSize: fontSize.xs },
})

export default LamparaCasa
