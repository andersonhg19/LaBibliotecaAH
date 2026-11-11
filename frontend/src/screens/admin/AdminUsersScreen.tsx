import React, { useCallback, useState } from 'react'

import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'

import { useFocusEffect } from '@react-navigation/native'

import Button from '@componentes/atoms/Button'
import Card from '@componentes/atoms/Card'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { useAccionUnica } from '@hooks/useAccionUnica'
import { exigir, mensajeDeError, useCarga } from '@hooks/useCarga'
import { adminService } from '@servicios/adminService'
import { spacing } from '@tema'
import { AdminUser, Rol } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { confirmarAccion } from '@utils/confirmar'
import { MENSAJES } from '@utils/mensajes'
import { esquemaAlias, esquemaCuentaNueva, validar } from '@validaciones/index'

/** El alias que se está editando: de qué cuenta, lo escrito y el error de formato si lo hay. */
type EdicionDeAlias = { id: number; valor: string; error?: string }

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
  const [edicion, setEdicion] = useState<EdicionDeAlias | null>(null)

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

  /* Desactivar pide confirmación (UX-03): la persona deja de poder entrar. Reactivar no. */
  const alternarActivacion = (usuario: AdminUser) => {
    if (!usuario.active) {
      cambiarActivacion(usuario)
      return
    }
    confirmarAccion({
      titulo: 'Desactivar cuenta',
      mensaje: `${usuario.name} (${usuario.email}) no podrá entrar a la biblioteca hasta que la reactives. Sus libros y notas no se borran.`,
      textoConfirmar: 'Sí, desactivar',
      onConfirmar: () => {
        cambiarActivacion(usuario)
      },
    })
  }

  const cambiarActivacion = async (usuario: AdminUser) => {
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

  /*
   * Cambiar el usuario (alias) de una cuenta. Se valida con el mismo formato
   * que el servidor antes de enviar; nombre y correo viajan tal cual estaban
   * porque el guardado de administración los exige.
   */
  const guardarAlias = async (usuario: AdminUser) => {
    if (!edicion) return
    const v = esquemaAlias.safeParse(edicion.valor)
    if (!v.success) {
      setEdicion({ ...edicion, error: v.error.issues[0]?.message })
      return
    }
    setGuardando(usuario.id)
    try {
      const res = await adminService.editarUsuario({
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        alias: v.data,
      })
      if (!res.correct) {
        setEdicion({ ...edicion, error: res.message })
        return
      }
      setUsuarios((previos) => previos.map((u) => (u.id === usuario.id ? { ...u, alias: res.object.alias } : u)))
      setEdicion(null)
      showToast('success', MENSAJES.aliasGuardado)
    } catch (err) {
      showToast('error', mensajeDeError(err))
    } finally {
      setGuardando(null)
    }
  }

  if (cargando)
    return (
      <Sala>
        <Encabezado titulo="Usuarios" subtitulo="Administración" atras />
        <Spinner fullScreen />
      </Sala>
    )

  if (error) {
    return (
      <Sala>
        <Encabezado titulo="Usuarios" subtitulo="Administración" atras />
        <EstadoError mensaje={error} onReintentar={cargar} />
      </Sala>
    )
  }

  return (
    <Sala>
      <Encabezado titulo="Usuarios" subtitulo="Administración" atras />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      >
        <AppText variant="caption" color={colors.textSecondary} style={styles.explicacion}>
          Los roles deciden qué ve cada persona al entrar. Un cambio aquí se nota la próxima vez que esa persona inicie
          sesión.
        </AppText>

        {usuarios.length === 0 && <EmptyState title="Sin cuentas" message="No hay ninguna cuenta creada todavía." />}

        {usuarios.map((usuario) => {
          const soyYo = String(usuario.id) === String(user?.userId)
          const ocupado = guardando === usuario.id

          return (
            <Card key={usuario.id} style={styles.tarjeta}>
              <View style={styles.cabecera}>
                <View style={styles.identidad}>
                  <AppText variant="body" style={styles.nombre}>
                    {usuario.name}
                    {soyYo ? ' (tú)' : ''}
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {usuario.email}
                  </AppText>
                  <AppText variant="caption" color={colors.textSecondary} testID={`alias-${usuario.id}`}>
                    {usuario.alias ? `Usuario: ${usuario.alias}` : 'Sin usuario'}
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
                        {...estadoElegible('switch', puesto, ocupado)}
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

              {edicion?.id === usuario.id ? (
                <View style={styles.edicion}>
                  <Input
                    label="Usuario"
                    value={edicion.valor}
                    onChangeText={(valor) => setEdicion({ id: usuario.id, valor })}
                    autoComplete="off"
                    autoCapitalize="none"
                    ayuda={MENSAJES.aliasAyuda}
                    error={edicion.error}
                    accessibilityLabel={`Usuario de ${usuario.name}`}
                    testID={`alias-campo-${usuario.id}`}
                    onSubmitEditing={() => guardarAlias(usuario)}
                  />
                  <View style={styles.botones}>
                    <Button
                      title="Guardar usuario"
                      size="small"
                      loading={ocupado}
                      onPress={() => guardarAlias(usuario)}
                      accessibilityLabel={`Guardar el usuario de ${usuario.name}`}
                      testID={`alias-guardar-${usuario.id}`}
                    />
                    <Button
                      title="Cancelar"
                      variant="secondary"
                      size="small"
                      onPress={() => setEdicion(null)}
                      accessibilityLabel={`Cancelar el cambio de usuario de ${usuario.name}`}
                      testID={`alias-cancelar-${usuario.id}`}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  title="Cambiar usuario"
                  variant="secondary"
                  size="small"
                  disabled={ocupado}
                  onPress={() => setEdicion({ id: usuario.id, valor: usuario.alias ?? '' })}
                  accessibilityLabel={`Cambiar el usuario de ${usuario.name}`}
                  testID={`alias-editar-${usuario.id}`}
                />
              )}

              {/* Nadie se desactiva a sí mismo (UX-03): se quedaría fuera sin poder volver. */}
              {soyYo ? (
                <AppText variant="caption" color={colors.textMuted} testID={`activacion-propia-${usuario.id}`}>
                  Es tu cuenta: no puedes desactivarte a ti mismo.
                </AppText>
              ) : (
                <View style={styles.botones}>
                  <Button
                    title={usuario.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                    variant={usuario.active ? 'outline' : 'secondary'}
                    icono={usuario.active ? 'close' : 'check'}
                    size="small"
                    loading={ocupado}
                    onPress={() => alternarActivacion(usuario)}
                    accessibilityLabel={
                      usuario.active
                        ? `Desactivar la cuenta de ${usuario.name}`
                        : `Reactivar la cuenta de ${usuario.name}`
                    }
                    testID={`activacion-${usuario.id}`}
                  />
                </View>
              )}
            </Card>
          )
        })}
        <CuentaNueva onCreada={(u) => setUsuarios((previos) => [...previos, u])} />
      </ScrollView>
    </Sala>
  )
}

type CamposCuenta = { name: string; email: string; alias: string; password: string }
const CUENTA_VACIA: CamposCuenta = { name: '', email: '', alias: '', password: '' }

/*
 * CREAR UNA CUENTA desde Administración (contrato v1.2: el registro público
 * está cerrado por defecto). Mismas reglas que el servidor: correo en
 * minúsculas, usuario (alias) con su formato y clave de 10 o más; si el
 * servidor la rechaza por fácil (400 claveDebil), se lee su motivo.
 */
const CuentaNueva: React.FC<{ onCreada: (u: AdminUser) => void }> = ({ onCreada }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [f, setF] = useState<CamposCuenta>(CUENTA_VACIA)
  const [errores, setErrores] = useState<Partial<Record<keyof CamposCuenta, string>>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const campo = (k: keyof CamposCuenta) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  const { ejecutar, ejecutando } = useAccionUnica(async () => {
    setGeneral(null)
    const v = validar(esquemaCuentaNueva, f)
    setErrores(v.errores)
    if (!v.ok) return
    try {
      const res = await adminService.crearUsuario(v.datos)
      if (!res.correct) {
        setGeneral(res.message)
        return
      }
      onCreada(res.object)
      setF(CUENTA_VACIA)
      showToast('success', MENSAJES.cuentaCreada, res.object.email)
    } catch (err) {
      setGeneral(mensajeDeError(err))
    }
  })

  return (
    <Card style={styles.tarjeta}>
      <AppText variant="subtitle">Cuenta nueva</AppText>
      <AppText variant="caption" color={colors.textSecondary} style={styles.explicacion}>
        La persona entra con su correo o con su usuario y la contraseña que pongas aquí.
      </AppText>
      <Input label="Nombre" value={f.name} onChangeText={campo('name')} error={errores.name} testID="nueva-nombre" />
      <Input
        label="Correo"
        value={f.email}
        onChangeText={campo('email')}
        keyboardType="email-address"
        autoComplete="off"
        error={errores.email}
        testID="nueva-correo"
      />
      <Input
        label="Usuario"
        value={f.alias}
        onChangeText={campo('alias')}
        autoCapitalize="none"
        autoComplete="off"
        ayuda={MENSAJES.aliasAyuda}
        error={errores.alias}
        testID="nueva-alias"
      />
      <Input
        label="Contraseña"
        value={f.password}
        onChangeText={campo('password')}
        secureTextEntry
        autoComplete="new-password"
        ayuda={MENSAJES.claveDebil}
        error={errores.password}
        testID="nueva-clave"
      />
      {general ? (
        <AppText variant="caption" color={colors.danger} testID="nueva-error">
          ⚠ {general}
        </AppText>
      ) : null}
      <Button title="Crear la cuenta" icono="plus" onPress={ejecutar} loading={ejecutando} testID="nueva-crear" />
    </Card>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl, maxWidth: 760, width: '100%', alignSelf: 'center' },
  explicacion: { marginBottom: spacing.md },
  tarjeta: { marginBottom: spacing.md },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  identidad: { flex: 1, paddingRight: spacing.sm },
  nombre: { fontWeight: '600' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: spacing.sm },
  edicion: { marginBottom: spacing.sm },
  botones: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
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
