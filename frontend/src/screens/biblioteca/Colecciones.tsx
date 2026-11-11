import React, { useCallback, useEffect, useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { useAccionUnica } from '@hooks/useAccionUnica'
import { exigir, useCarga } from '@hooks/useCarga'
import { plural } from '@logica/formato'
import { estantesService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { montante } from '@tema/madera'
import { web } from '@tema/web'
import type { EstanteDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { confirmarAccion } from '@utils/confirmar'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { esquemaEstante, validar } from '@validaciones/index'

/** Las maderas con que se puede forrar el fondo de una colección. */
export const MADERAS: { color: string | null; nombre: string }[] = [
  { color: null, nombre: 'La del mueble' },
  { color: paleta.roble, nombre: 'Roble' },
  { color: paleta.nogal, nombre: 'Nogal' },
  { color: paleta.cedro, nombre: 'Cedro' },
  { color: '#5A2A1E', nombre: 'Cerezo' },
  { color: '#2A1A12', nombre: 'Ébano' },
]

interface Props {
  visible: boolean
  onCerrar: () => void
  /** Algo cambió: la estantería tiene que volver a pintarse. */
  onCambio: () => void
}

/*
 * TUS COLECCIONES (BI-04): las baldas propias se crean, se renombran, se
 * forran con otra madera y se retiran desde la app (antes solo existían en la
 * API). FAVORITOS es de la casa: se ve, pero no se renombra ni se borra, y se
 * dice por qué. Retirar una colección no toca los libros.
 */
const Colecciones: React.FC<Props> = ({ visible, onCerrar, onCambio }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [estantes, setEstantes] = useState<EstanteDTO[]>([])
  const [nombre, setNombre] = useState('')
  const [madera, setMadera] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; error?: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const tarea = useCallback(async () => setEstantes(exigir(await estantesService.todos()) ?? []), [])
  const carga = useCarga(tarea)
  const { cargar } = carga
  useEffect(() => {
    if (visible) cargar()
  }, [visible, cargar])

  const crear = useAccionUnica(async () => {
    const v = validar(esquemaEstante, { nombre })
    setError(v.errores.nombre)
    if (!v.ok) return
    try {
      const r = await estantesService.guardar({ nombre: v.datos.nombre, colorMadera: madera })
      if (!r.correct) throw new Error(r.message)
      setEstantes((l) => [...l, r.object])
      setNombre('')
      setMadera(null)
      showToast('success', MENSAJES.estanteCreado, r.object.nombre)
      onCambio()
    } catch (e) {
      setError(mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  })

  const renombrar = async (e: EstanteDTO) => {
    if (!edicion || ocupado) return
    const v = validar(esquemaEstante, { nombre: edicion.nombre })
    if (!v.ok) {
      setEdicion({ ...edicion, error: v.errores.nombre })
      return
    }
    setOcupado(e.id)
    try {
      const r = await estantesService.guardar({ id: e.id, nombre: v.datos.nombre, colorMadera: e.colorMadera })
      if (!r.correct) throw new Error(r.message)
      setEstantes((l) => l.map((x) => (x.id === e.id ? { ...x, ...r.object } : x)))
      setEdicion(null)
      showToast('success', MENSAJES.estanteRenombrado)
      onCambio()
    } catch (err) {
      setEdicion({ ...edicion, error: mensajeDelServidor(err, MENSAJES.errorGuardar) })
    } finally {
      setOcupado(null)
    }
  }

  const borrar = (e: EstanteDTO) =>
    confirmarAccion({
      titulo: 'Retirar la colección',
      mensaje: `La balda «${e.nombre}» se quita del mueble. Sus libros siguen en tu biblioteca.`,
      textoConfirmar: 'Sí, retirar',
      onConfirmar: async () => {
        setOcupado(e.id)
        try {
          const r = await estantesService.borrar(e.id)
          if (!r.correct) throw new Error(r.message)
          setEstantes((l) => l.filter((x) => x.id !== e.id))
          showToast('success', MENSAJES.estanteBorrado)
          onCambio()
        } catch (err) {
          showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(err, MENSAJES.errorGuardar))
        } finally {
          setOcupado(null)
        }
      },
    })

  return (
    <Hoja visible={visible} titulo="Tus colecciones" onCerrar={onCerrar} testID="hoja-colecciones">
      <AppText variant="body" color={colors.textSecondary}>
        Cada colección es una balda del mueble. Pon libros en ella desde su ficha, en «Datos».
      </AppText>
      {carga.cargando && !estantes.length ? <Spinner /> : null}
      {carga.error ? <EstadoError mensaje={carga.error} onReintentar={cargar} /> : null}
      {estantes.map((e) => {
        const casa = e.tipo === 'FAVORITOS'
        const editando = edicion?.id === e.id
        return (
          <View
            key={e.id}
            style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}
            testID={`coleccion-${e.id}`}
          >
            <View
              accessible={false}
              style={[
                styles.muestra,
                { backgroundColor: e.colorMadera ?? paleta.roble },
                !e.colorMadera && web({ backgroundImage: montante(true) }),
              ]}
            />
            {editando ? (
              <View style={styles.flex}>
                <Input
                  label="Nuevo nombre"
                  value={edicion.nombre}
                  onChangeText={(t) => setEdicion({ id: e.id, nombre: t })}
                  error={edicion.error}
                  testID={`coleccion-nombre-${e.id}`}
                  onSubmitEditing={() => renombrar(e)}
                />
                <View style={styles.botones}>
                  <Button
                    title="Guardar"
                    size="small"
                    loading={ocupado === e.id}
                    onPress={() => renombrar(e)}
                    testID={`coleccion-guardar-${e.id}`}
                  />
                  <Button title="Cancelar" size="small" variant="secondary" onPress={() => setEdicion(null)} />
                </View>
              </View>
            ) : (
              <View style={styles.flex}>
                <Text style={[styles.nombre, { color: colors.text }]}>{e.nombre}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  {casa ? `${plural(e.nLibros, 'libro')} · ${MENSAJES.favoritosProtegido}` : plural(e.nLibros, 'libro')}
                </Text>
              </View>
            )}
            {!casa && !editando ? (
              <>
                <BotonIcono
                  icono="lapiz"
                  etiqueta={`Renombrar ${e.nombre}`}
                  onPress={() => setEdicion({ id: e.id, nombre: e.nombre })}
                  disabled={ocupado === e.id}
                  testID={`coleccion-renombrar-${e.id}`}
                />
                <BotonIcono
                  icono="trash"
                  etiqueta={`Retirar la colección ${e.nombre}`}
                  onPress={() => borrar(e)}
                  disabled={ocupado === e.id}
                  testID={`coleccion-borrar-${e.id}`}
                />
              </>
            ) : null}
          </View>
        )
      })}

      <View style={[styles.nueva, { borderColor: colors.border }]}>
        <AppText variant="label">Colección nueva</AppText>
        <Input
          label="Nombre"
          value={nombre}
          onChangeText={setNombre}
          placeholder="Novela negra, Para el viaje…"
          error={error}
          testID="coleccion-nueva"
          onSubmitEditing={crear.ejecutar}
        />
        <Text style={[styles.meta, { color: colors.textSecondary }]}>Madera del fondo</Text>
        <View style={styles.maderas} accessibilityRole="radiogroup" accessibilityLabel="Madera del fondo">
          {MADERAS.map((m) => {
            const elegida = madera === m.color
            return (
              <Pressable
                key={m.nombre}
                onPress={() => setMadera(m.color)}
                {...estadoElegible('radio', elegida)}
                accessibilityLabel={m.nombre}
                style={[
                  styles.madera,
                  { borderColor: elegida ? colors.primary : colors.border, borderWidth: elegida ? 2 : 1 },
                  web({ cursor: 'pointer' }),
                ]}
              >
                <View
                  style={[
                    styles.maderaMuestra,
                    { backgroundColor: m.color ?? paleta.roble },
                    !m.color && web({ backgroundImage: montante(true) }),
                  ]}
                />
                <Text style={[styles.maderaNombre, { color: colors.text }]}>{m.nombre}</Text>
              </Pressable>
            )
          })}
        </View>
        <Button
          title="Crear colección"
          icono="plus"
          onPress={crear.ejecutar}
          loading={crear.ejecutando}
          testID="coleccion-crear"
        />
      </View>
    </Hoja>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  muestra: { width: 14, alignSelf: 'stretch', borderRadius: 3, minHeight: 44 },
  nombre: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  botones: { flexDirection: 'row', gap: 8 },
  nueva: { borderTopWidth: 1, paddingTop: 14, marginTop: 6, gap: 8 },
  maderas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  madera: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 22,
  },
  maderaMuestra: { width: 18, height: 18, borderRadius: 9 },
  maderaNombre: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
})

export default Colecciones
