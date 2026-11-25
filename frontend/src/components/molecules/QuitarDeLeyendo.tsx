import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { fechaCorta } from '@logica/formato'
import { OPCIONES_QUITAR, alEntrarEnLeyendo, estadoEnFrase, sincronizarLeyendo } from '@logica/leyendo'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { fibraPapel } from '@tema/madera'
import { SOMBRA } from '@tema/materiales'
import { web } from '@tema/web'
import type { EjemplarDTO, EstadoLectura } from '@tipos'
import { celebrarFin } from '@utils/confeti'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'

/** Cuánto se ofrece «Deshacer» tras quitar un libro de «Leyendo». */
export const DESHACER_MS = 8000

interface Hecho {
  libro: EjemplarDTO
  a: EstadoLectura
}

/*
 * 0.5.0 · «QUITAR DE EN PROCESO» (contrato C10.4) desde la propia lista de
 * «Leyendo» (atril de la estantería y pestaña Leyendo del catálogo), sin tener
 * que entrar en la ficha. Un botón discreto «⋯» en la tarjeta abre una hoja
 * con las tres salidas; tras elegir, una tira de papel ofrece «Deshacer»
 * durante unos segundos. Se usa el `save` de siempre; luego se refresca la
 * lista y se sincronizan las copias sin conexión (la del quitado se borra).
 *
 * Devuelve: `abrir(libro)` para el botón, `hoja` (el diálogo) y `aviso` (la
 * tira con «Deshacer», que cada pantalla pinta donde se vea).
 */
export function useQuitarDeLeyendo(onCambio: () => void) {
  const { colors } = useTheme()
  const { prefs } = usePreferencias()
  const { showToast } = useToast()
  const [libro, setLibro] = useState<EjemplarDTO | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [ocupado, setOcupado] = useState<EstadoLectura | null>(null)
  const enCurso = useRef(false)
  const onCambioRef = useRef(onCambio)
  useEffect(() => {
    onCambioRef.current = onCambio
  }, [onCambio])

  /* La tira se va sola. */
  useEffect(() => {
    if (!hecho) return
    const t = setTimeout(() => setHecho(null), DESHACER_MS)
    return () => clearTimeout(t)
  }, [hecho])

  /** Cambia el estado con el `save` de siempre; true si el servidor lo aplicó. */
  const cambiar = useCallback(
    async (l: EjemplarDTO, estado: EstadoLectura): Promise<boolean> => {
      if (enCurso.current) return false
      enCurso.current = true
      setOcupado(estado)
      try {
        const r = await librosService.guardar({ id: l.id, estado })
        if (!r?.correct) throw Object.assign(new Error(r?.message), { codigo: r?.errorCode })
        if (r.object && r.object.estado !== estado) {
          showToast('warning', MENSAJES.noSeAplico)
          return false
        }
        return true
      } catch (e) {
        showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
        return false
      } finally {
        enCurso.current = false
        setOcupado(null)
      }
    },
    [showToast],
  )

  const elegir = async (estado: EstadoLectura) => {
    if (!libro) return
    const l = libro
    if (!(await cambiar(l, estado))) return
    setLibro(null)
    setHecho({ libro: l, a: estado })
    /* «Ya lo terminé» se celebra como en la ficha (una vez por libro; con reducir movimiento, sin confeti). */
    if (estado === 'LEIDO')
      celebrarFin(l.id)
        .then((r) => {
          if (r.primera)
            showToast('success', '¡Libro terminado!', `«${l.titulo}», ${fechaCorta(new Date().toISOString())}.`)
        })
        .catch(() => {})
    onCambioRef.current()
    sincronizarLeyendo()
  }

  const deshacer = async () => {
    if (!hecho) return
    const { libro: l } = hecho
    if (!(await cambiar(l, 'LEYENDO'))) return
    setHecho(null)
    showToast('success', MENSAJES.vueltaALeyendo(l.titulo))
    alEntrarEnLeyendo(l, prefs.vozId)
    onCambioRef.current()
    sincronizarLeyendo()
  }

  const hoja = (
    <Hoja
      visible={!!libro}
      titulo="Quitar de «Leyendo»"
      onCerrar={() => (ocupado ? undefined : setLibro(null))}
      ancho={480}
      testID="hoja-quitar-leyendo"
    >
      {libro ? (
        <>
          <Text style={[styles.libro, { color: colors.text }]} numberOfLines={2}>
            «{libro.titulo}»
          </Text>
          <AppText variant="caption">{MENSAJES.quitarDeLeyendoAviso}</AppText>
          <View style={styles.opciones}>
            {OPCIONES_QUITAR.map((o) => (
              <Pressable
                key={o.estado}
                onPress={() => elegir(o.estado)}
                disabled={!!ocupado}
                accessibilityRole="button"
                accessibilityLabel={`${o.titulo}. ${o.detalle}`}
                accessibilityState={{ disabled: !!ocupado, busy: ocupado === o.estado }}
                testID={`quitar-${o.estado}`}
                style={({ pressed }) => [
                  styles.opcion,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  o.estado === 'LEIDO' && { borderColor: colors.primaryLight },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] },
                  !!ocupado && ocupado !== o.estado && { opacity: 0.5 },
                  web({ cursor: ocupado ? 'default' : 'pointer', transition: 'transform 120ms ease' }),
                ]}
              >
                <Icono nombre={o.icono} color={colors.primary} tamano={22} />
                <View style={styles.flex}>
                  <Text style={[styles.opcionTitulo, { color: colors.text }]}>{o.titulo}</Text>
                  <Text style={[styles.opcionDetalle, { color: colors.textSecondary }]}>{o.detalle}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </Hoja>
  )

  const aviso = hecho ? (
    <View
      style={[
        styles.aviso,
        { backgroundColor: paleta.pergamino, borderColor: paleta.laton },
        web({
          backgroundImage: `${fibraPapel}, linear-gradient(180deg, ${paleta.marfil}, ${paleta.pergamino})`,
          boxShadow: SOMBRA[1],
          animationName: 'bah-llega',
          animationDuration: '260ms',
          animationFillMode: 'both',
        }),
      ]}
      testID="aviso-deshacer"
    >
      <Text style={styles.avisoTexto} accessibilityLiveRegion="polite" numberOfLines={2}>
        {MENSAJES.quitadoDeLeyendo(hecho.libro.titulo, estadoEnFrase(hecho.a))}
      </Text>
      <Button
        title="Deshacer"
        size="small"
        variant="secondary"
        onPress={deshacer}
        loading={ocupado === 'LEYENDO'}
        accessibilityLabel={`Deshacer: volver a poner «${hecho.libro.titulo}» en Leyendo`}
        testID="deshacer-quitar"
      />
    </View>
  ) : null

  return { abrir: setLibro, hoja, aviso }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  libro: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg },
  opciones: { gap: 10, marginTop: 4 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  opcionTitulo: { fontFamily: fuentes.uiSemi, fontSize: fontSize.md },
  opcionDetalle: { fontFamily: fuentes.ui, fontSize: fontSize.xs, marginTop: 2 },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  avisoTexto: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm, color: paleta.robleOscuro },
})
