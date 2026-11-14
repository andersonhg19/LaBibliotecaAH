import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'

import { SALA_ESCUCHA } from '@componentes/lector/disenoLector'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { BotonLaton, useNivel } from '@componentes/reproductor/ControlesVoz'
import { useFrasesCapitulo } from '@componentes/reproductor/useFrasesCapitulo'
import { fontSize, fuentes } from '@tema'
import { reducirMovimiento, web } from '@tema/web'
import type { EventoFrase } from '@utils/motorAudio'

/*
 * EL MODO CINE (Ola E, F8): pantalla completa y oscura con la frase que suena
 * en grande, la palabra en latón y la anterior apagándose arriba; un halo que
 * respira con la voz (envolvente precalculada, F7) y la pantalla encendida
 * mientras dure (Wake Lock, si el navegador lo tiene). Tocar el texto pausa o
 * sigue; ⏮ ⏭ cambian de frase; Escape o ✕ salen. Con «Reducir movimiento», sin
 * halo ni transiciones.
 */

export const TEXTOS_CINE = {
  abrir: 'Modo cine: la frase en grande y la pantalla encendida',
  cerrar: 'Salir del modo cine',
  sinTexto: 'El texto de este capítulo no está disponible.',
  cargando: 'Cargando el texto…',
}

type Centinela = { release: () => Promise<void> } | null

/** Mantiene la pantalla encendida mientras `activo` (Safari 16.4+, Chrome); si no se puede, no pasa nada. */
export function useWakeLock(activo: boolean) {
  useEffect(() => {
    if (!activo || Platform.OS !== 'web' || typeof navigator === 'undefined') return
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Centinela> } }).wakeLock
    if (!wl) return
    let centinela: Centinela = null
    let vivo = true
    const pedir = () => {
      wl.request('screen')
        .then((c) => {
          if (vivo) centinela = c
          else void c?.release()
        })
        .catch((e: unknown) => console.warn('[voz] modo cine: sin Wake Lock', e))
    }
    // Al volver a la pestaña el navegador lo suelta: se vuelve a pedir.
    const alVolver = () => {
      if (document.visibilityState === 'visible') pedir()
    }
    pedir()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      void centinela?.release().catch(() => {})
    }
  }, [activo])
}

/** Parte la frase en [antes, palabra, después] según los caracteres de la palabra que suena. */
export function partirPorPalabra(texto: string, palabra: [number, number] | null): [string, string, string] {
  if (!palabra) return [texto, '', '']
  const [a, b] = palabra
  if (!(a >= 0 && b > a && b <= texto.length)) return [texto, '', '']
  return [texto.slice(0, a), texto.slice(a, b), texto.slice(b)]
}

const ModoCine: React.FC<{
  visible: boolean
  onCerrar: () => void
  archivoId: string | null
  capitulo: number
  titulo: string
  fraseId: string | null
  sonando: boolean
  ocupado: boolean
  enError: boolean
  onAlternar: () => void
  onFraseAnterior: () => void
  onFraseSiguiente: () => void
  suscribirFrase: (fn: (e: EventoFrase) => void) => () => void
  nivel?: () => number | null
}> = ({
  visible,
  onCerrar,
  archivoId,
  capitulo,
  titulo,
  fraseId,
  sonando,
  ocupado,
  enError,
  onAlternar,
  onFraseAnterior,
  onFraseSiguiente,
  suscribirFrase,
  nivel,
}) => {
  useWakeLock(visible)
  const { frases, cargando } = useFrasesCapitulo(archivoId, capitulo, visible)
  const [palabra, setPalabra] = useState<[number, number] | null>(null)
  useEffect(() => {
    if (!visible) return
    return suscribirFrase((e) => setPalabra(e.palabra))
  }, [visible, suscribirFrase])

  const i = useMemo(() => (frases && fraseId ? frases.findIndex((f) => f.id === fraseId) : -1), [frases, fraseId])
  const actual = i >= 0 && frases ? frases[i] : null
  const anterior = i > 0 && frases ? frases[i - 1] : null
  const [antes, enVoz, despues] = partirPorPalabra(actual?.texto ?? '', palabra)

  /* Teclado: espacio = ▶/⏸, flechas = frase. (Escape lo atiende el Modal con onRequestClose.) */
  const acciones = useRef({ onAlternar, onFraseAnterior, onFraseSiguiente })
  acciones.current = { onAlternar, onFraseAnterior, onFraseSiguiente }
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === ' ') acciones.current.onAlternar()
      else if (e.key === 'ArrowLeft') acciones.current.onFraseAnterior()
      else if (e.key === 'ArrowRight') acciones.current.onFraseSiguiente()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [visible])

  const halo = useRef<HTMLElement | null>(null)
  useNivel(nivel, visible && sonando, (n) => {
    const h = halo.current
    if (!h) return
    h.style.transform = `scale(${n == null ? 1 : 0.9 + n * 0.35})`
    h.style.opacity = String(n == null ? 0.35 : 0.2 + n * 0.55)
  })

  if (!visible) return null
  const quieto = reducirMovimiento()
  return (
    <Modal visible transparent={false} animationType={quieto ? 'none' : 'fade'} onRequestClose={onCerrar}>
      <View style={styles.fondo} testID="modo-cine" accessibilityViewIsModal>
        {Platform.OS === 'web' && !quieto
          ? React.createElement('div', {
              className: 'bah-halo',
              'aria-hidden': true,
              ref: (n: HTMLElement | null) => {
                halo.current = n
              },
              style: {
                position: 'absolute',
                left: '50%',
                top: '45%',
                width: 'min(80vw, 80vh)',
                height: 'min(80vw, 80vh)',
                marginLeft: 'calc(min(80vw, 80vh) / -2)',
                marginTop: 'calc(min(80vw, 80vh) / -2)',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(217,163,91,0.32) 0%, rgba(217,163,91,0) 68%)',
                opacity: 0.35,
                pointerEvents: 'none',
              },
            })
          : null}
        <View style={styles.cabecera}>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          <BotonIcono icono="close" etiqueta={TEXTOS_CINE.cerrar} onPress={onCerrar} />
        </View>
        <Pressable
          style={styles.centro}
          onPress={onAlternar}
          accessibilityRole="button"
          accessibilityLabel={sonando ? 'Pausar' : 'Reproducir'}
          testID="cine-texto"
        >
          {anterior ? (
            <Text style={styles.anterior} numberOfLines={3}>
              {anterior.texto}
            </Text>
          ) : null}
          {actual ? (
            <Text style={styles.frase} accessibilityLiveRegion="polite">
              {antes}
              {enVoz ? (
                <Text style={styles.palabra} testID="cine-palabra">
                  {enVoz}
                </Text>
              ) : null}
              {despues}
            </Text>
          ) : (
            <Text style={styles.anterior}>
              {cargando ? TEXTOS_CINE.cargando : archivoId ? '' : TEXTOS_CINE.sinTexto}
            </Text>
          )}
        </Pressable>
        <View style={styles.controles}>
          <BotonIcono icono="fraseAnterior" etiqueta="Frase anterior" onPress={onFraseAnterior} />
          <BotonLaton
            sonando={sonando}
            ocupado={ocupado}
            enError={enError}
            onPress={onAlternar}
            tamano={60}
            testID="cine-play"
          />
          <BotonIcono icono="fraseSiguiente" etiqueta="Frase siguiente" onPress={onFraseSiguiente} />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: '#0E0906',
    ...web({
      backgroundImage: 'radial-gradient(ellipse at 50% 40%, #2B1A10 0%, #0E0906 70%)',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      overflow: 'hidden',
    }),
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  titulo: {
    flex: 1,
    color: SALA_ESCUCHA.pergamino,
    opacity: 0.75,
    fontFamily: fuentes.tituloCursiva,
    fontSize: fontSize.md,
    fontVariant: ['lining-nums'],
  },
  centro: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
    maxWidth: 900,
    alignSelf: 'center',
  },
  anterior: {
    color: SALA_ESCUCHA.pergamino,
    opacity: 0.45,
    fontFamily: fuentes.lectura,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  frase: {
    color: SALA_ESCUCHA.pergamino,
    fontFamily: fuentes.lectura,
    fontSize: 30,
    lineHeight: 42,
    textAlign: 'center',
  },
  palabra: { color: '#F0C982', textDecorationLine: 'underline', textDecorationColor: SALA_ESCUCHA.laton },
  controles: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingBottom: 16 },
})

export default ModoCine
