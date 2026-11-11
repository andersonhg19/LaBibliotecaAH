import React, { useCallback, useState } from 'react'

import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'

import { useFocusEffect } from '@react-navigation/native'

import Button from '@componentes/atoms/Button'
import Card from '@componentes/atoms/Card'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import EmptyState from '@componentes/molecules/EmptyState'
import EstadoError from '@componentes/molecules/EstadoError'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, mensajeDeError, useCarga } from '@hooks/useCarga'
import { adminService } from '@servicios/adminService'
import { spacing } from '@tema'
import { AdminUser, Rol } from '@tipos'

/**
 * Quien entra y que puede hacer.
 *
 * Las dos operaciones que importan aqui son irreversibles desde el punto de
 * vista del que las sufre: quitarle el rol a alguien y desactivarle la cuenta.
 * Por eso las dos avisan de lo que va a pasar antes de que pase, y por eso el
 * backend se niega en los dos casos que dejarian la plataforma sin
 * administrador — esta pantalla ENSENA ese "no", no lo esconde: si el servidor
 * responde que no se puede, se lee el motivo.
 */
const AdminUsersScreen: React.FC = () => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const { user } = useAuth()

  const [usuarios, setUsuarios] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [guardando, setGuardando] = useState<number | null>(null)

  const traer = useCallback(async () => {
    const [resUsuarios, resRoles] = await Promise.all([
      adminService.usuarios({ page: 0, size: 50 }),
      adminService.roles(),
    ])
    setUsuarios(exigir(resUsuarios)?.list ?? [])
    setRoles(exigir(resRoles) ?? [])
  }, [])

  const { cargando, refrescando, error, cargar, refrescar } = useCarga(traer)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  const alternarRol = async (usuario: AdminUser, rol: string) => {
    const tenia = usuario.roles.includes(rol)
    const nuevos = tenia ? usuario.roles.filter((r) => r !== rol) : [...usuario.roles, rol]
    setGuardando(usuario.id)
    try {
      const res = await adminService.fijarRoles(usuario.id, nuevos)
      if (!res.correct) {
        /* El mensaje del backend explica POR QUE no se puede: casi siempre
           porque es el ultimo administrador. Tragarselo dejaria la pantalla
           igual que estaba y al usuario sin entender nada. */
        showToast('error', res.message)
        return
      }
      setUsuarios((previos) => previos.map((u) => (u.id === usuario.id ? { ...u, roles: res.object.roles } : u)))
      showToast('success', tenia ? `Rol ${rol} retirado` : `Rol ${rol} concedido`)
    } catch (err) {
      showToast('error', mensajeDeError(err))
    } finally {
      setGuardando(null)
    }
  }

  const alternarActivacion = async (usuario: AdminUser) => {
    setGuardando(usuario.id)
    try {
      const res = await adminService.cambiarActivacion(usuario.id, !usuario.active)
      if (!res.correct) {
        showToast('error', res.message)
        return
      }
      setUsuarios((previos) => previos.map((u) => (u.id === usuario.id ? { ...u, active: res.object.active } : u)))
      showToast('success', usuario.active ? 'Cuenta desactivada' : 'Cuenta reactivada')
    } catch (err) {
      showToast('error', mensajeDeError(err))
    } finally {
      setGuardando(null)
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
      <AppText variant="caption" color={colors.textSecondary} style={styles.explicacion}>
        Los roles deciden que ve cada persona al entrar. Un cambio aqui surte efecto la proxima vez que esa persona
        inicie sesion, porque el rol viaja dentro de su token.
      </AppText>

      {usuarios.length === 0 && <EmptyState title="Sin cuentas" message="No hay ninguna cuenta creada todavia" />}

      {usuarios.map((usuario) => {
        const soyYo = String(usuario.id) === String(user?.userId)
        const ocupado = guardando === usuario.id

        return (
          <Card key={usuario.id} style={styles.tarjeta}>
            <View style={styles.cabecera}>
              <View style={styles.identidad}>
                <AppText variant="body" style={styles.nombre}>
                  {usuario.name}
                  {soyYo ? ' (tu)' : ''}
                </AppText>
                <AppText variant="caption" color={colors.textSecondary}>
                  {usuario.email}
                </AppText>
              </View>
              {/* El estado no se distingue SOLO por opacidad: lleva palabra. */}
              <AppText variant="caption" color={usuario.active ? colors.success : colors.textMuted}>
                {usuario.active ? 'Activa' : 'Desactivada'}
              </AppText>
            </View>

            <View style={styles.roles}>
              {roles
                .filter((rol) => rol.active)
                .map((rol) => {
                  const puesto = usuario.roles.includes(rol.name)
                  return (
                    <TouchableOpacity
                      key={rol.id}
                      onPress={() => alternarRol(usuario, rol.name)}
                      disabled={ocupado}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: puesto ? colors.primary : 'transparent',
                          borderColor: puesto ? colors.primary : colors.border,
                        },
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: puesto, disabled: ocupado }}
                      accessibilityLabel={
                        puesto
                          ? `Retirar el rol ${rol.name} a ${usuario.name}`
                          : `Conceder el rol ${rol.name} a ${usuario.name}`
                      }
                      testID={`rol-${usuario.id}-${rol.name}`}
                    >
                      <AppText variant="caption" color={puesto ? colors.background : colors.textSecondary}>
                        {puesto ? `✓ ${rol.name}` : rol.name}
                      </AppText>
                    </TouchableOpacity>
                  )
                })}
            </View>

            <Button
              title={usuario.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
              variant={usuario.active ? 'danger' : 'secondary'}
              size="small"
              loading={ocupado}
              onPress={() => alternarActivacion(usuario)}
              accessibilityLabel={
                usuario.active ? `Desactivar la cuenta de ${usuario.name}` : `Reactivar la cuenta de ${usuario.name}`
              }
              testID={`activacion-${usuario.id}`}
            />
          </Card>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  explicacion: { marginBottom: spacing.md },
  tarjeta: { marginBottom: spacing.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  identidad: { flex: 1, paddingRight: spacing.sm },
  nombre: { fontWeight: '600' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    /* 44 de alto minimo: por debajo de eso no se acierta con el pulgar, y esa
       fue una de las tres cosas que salieron al etiquetar en la ola anterior. */
    minHeight: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
})

export default AdminUsersScreen
