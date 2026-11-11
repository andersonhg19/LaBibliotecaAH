import React, { useCallback, useState } from 'react'

import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'

import { useFocusEffect } from '@react-navigation/native'

import Button from '@componentes/atoms/Button'
import Card from '@componentes/atoms/Card'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import EstadoError from '@componentes/molecules/EstadoError'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, mensajeDeError, useCarga } from '@hooks/useCarga'
import { adminService } from '@servicios/adminService'
import { spacing } from '@tema'
import { Rol } from '@tipos'

/** Los dos que la plataforma da por supuestos. El backend tambien los protege. */
const DEL_SISTEMA = ['ADMIN', 'USER']

/**
 * Los roles que existen.
 *
 * ADMIN y USER no se pueden renombrar ni retirar, y aqui se DICE por que en vez
 * de limitarse a deshabilitar el boton: hay reglas de seguridad escritas contra
 * esos dos nombres, y una regla que apunta a un rol inexistente no falla —se
 * salta—. El backend se niega igual; esto es para que se entienda antes de
 * intentarlo.
 */
const AdminRolesScreen: React.FC = () => {
  const { colors } = useTheme()
  const { showToast } = useToast()

  const [roles, setRoles] = useState<Rol[]>([])
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [descripcionNueva, setDescripcionNueva] = useState('')
  const [creando, setCreando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)

  const traer = useCallback(async () => {
    setRoles(exigir(await adminService.roles()) ?? [])
  }, [])

  const { cargando, refrescando, error, cargar, refrescar } = useCarga(traer)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  const crear = async () => {
    const nombre = nombreNuevo.trim().toUpperCase()
    if (!nombre) {
      showToast('warning', 'Ponle un nombre al rol')
      return
    }
    setCreando(true)
    try {
      const res = await adminService.guardarRol({
        name: nombre,
        description: descripcionNueva.trim() || undefined,
      })
      if (!res.correct) {
        showToast('error', res.message)
        return
      }
      setNombreNuevo('')
      setDescripcionNueva('')
      showToast('success', `Rol ${nombre} creado`)
      await cargar()
    } catch (err) {
      showToast('error', mensajeDeError(err))
    } finally {
      setCreando(false)
    }
  }

  const retirar = async (rol: Rol) => {
    setOcupado(rol.id)
    try {
      const res = await adminService.desactivarRol(rol.id)
      if (!res.correct) {
        showToast('error', res.message)
        return
      }
      showToast('success', `Rol ${rol.name} retirado`)
      await cargar()
    } catch (err) {
      showToast('error', mensajeDeError(err))
    } finally {
      setOcupado(null)
    }
  }

  if (cargando) return <Spinner fullScreen />

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EstadoError mensaje={error} onReintentar={cargar} />
      </View>
    )
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {roles.map((rol) => {
        const esDelSistema = DEL_SISTEMA.includes(rol.name)
        const enUso = rol.usuarios > 0

        return (
          <Card key={rol.id} style={styles.tarjeta}>
            <View style={styles.cabecera}>
              <AppText variant="body" style={styles.nombre}>
                {rol.name}
              </AppText>
              <AppText variant="caption" color={rol.active ? colors.success : colors.textMuted}>
                {rol.active ? 'Activo' : 'Retirado'}
              </AppText>
            </View>

            {!!rol.description && (
              <AppText variant="caption" color={colors.textSecondary}>
                {rol.description}
              </AppText>
            )}

            <AppText variant="caption" color={colors.textSecondary} style={styles.cuenta}>
              {rol.usuarios === 0
                ? 'No lo tiene nadie'
                : rol.usuarios === 1
                  ? 'Lo tiene 1 persona'
                  : `Lo tienen ${rol.usuarios} personas`}
            </AppText>

            {esDelSistema ? (
              <AppText variant="caption" color={colors.textMuted} style={styles.motivo}>
                Es un rol del sistema: hay reglas de seguridad escritas contra este nombre, asi que no se renombra ni se
                retira.
              </AppText>
            ) : enUso ? (
              <AppText variant="caption" color={colors.textMuted} style={styles.motivo}>
                Para retirarlo, primero quitaselo a quien lo tenga.
              </AppText>
            ) : rol.active ? (
              <Button
                title="Retirar rol"
                variant="danger"
                size="small"
                loading={ocupado === rol.id}
                onPress={() => retirar(rol)}
                accessibilityLabel={`Retirar el rol ${rol.name}`}
                testID={`retirar-${rol.name}`}
              />
            ) : null}
          </Card>
        )
      })}

      <Card style={styles.tarjeta}>
        <AppText variant="subtitle" style={styles.tituloAlta}>
          Rol nuevo
        </AppText>
        <Input
          label="Nombre"
          value={nombreNuevo}
          onChangeText={setNombreNuevo}
          placeholder="CONTABLE"
          accessibilityLabel="Nombre del rol nuevo, en mayusculas"
        />
        <AppText variant="caption" color={colors.textSecondary} style={styles.ayuda}>
          Se guarda en mayusculas: es el nombre exacto que se compara al autorizar.
        </AppText>
        <Input
          label="Para que sirve"
          value={descripcionNueva}
          onChangeText={setDescripcionNueva}
          placeholder="Puede ver las cifras pero no cambiarlas"
          accessibilityLabel="Descripcion del rol nuevo"
        />
        <Button
          title="Crear rol"
          loading={creando}
          onPress={crear}
          accessibilityLabel="Crear el rol nuevo"
          testID="crear-rol"
        />
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  tarjeta: { marginBottom: spacing.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nombre: { fontWeight: '600' },
  cuenta: { marginTop: spacing.xs },
  motivo: { marginTop: spacing.sm },
  tituloAlta: { marginBottom: spacing.sm },
  ayuda: { marginTop: -spacing.xs, marginBottom: spacing.sm },
})

export default AdminRolesScreen
