import React, { useCallback, useMemo, useState } from 'react'

import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'

import { useFocusEffect } from '@react-navigation/native'

import Card from '@componentes/atoms/Card'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import EstadoError from '@componentes/molecules/EstadoError'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, mensajeDeError, useCarga } from '@hooks/useCarga'
import { adminService } from '@servicios/adminService'
import { spacing } from '@tema'
import { ModuloAdmin, PermisoDeRol, Rol } from '@tipos'

type Accion = 'canRead' | 'canCreate' | 'canUpdate' | 'canDelete'

const ACCIONES: { clave: Accion; rotulo: string; verbo: string }[] = [
  { clave: 'canRead', rotulo: 'Ver', verbo: 'ver' },
  { clave: 'canCreate', rotulo: 'Crear', verbo: 'crear en' },
  { clave: 'canUpdate', rotulo: 'Editar', verbo: 'editar en' },
  { clave: 'canDelete', rotulo: 'Borrar', verbo: 'borrar en' },
]

const SIN_PERMISO: Omit<PermisoDeRol, 'pageId' | 'moduleCode' | 'pageCode' | 'pageName'> = {
  canRead: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
}

/**
 * Que puede hacer cada rol en cada pantalla.
 *
 * La rejilla es de cuatro columnas y no de una casilla de "se ve / no se ve",
 * porque "puede entrar" y "puede borrar" no son la misma pregunta. Un modelo
 * que solo dice si la pantalla aparece obliga a repetir la decision DENTRO de
 * cada pantalla, y esa es la que se olvida.
 *
 * Quitar las cuatro equivale a no tener fila: en este modelo, no existir es no
 * poder.
 */
const AdminModulesScreen: React.FC = () => {
  const { colors } = useTheme()
  const { showToast } = useToast()

  const [modulos, setModulos] = useState<ModuloAdmin[]>([])
  const [roles, setRoles] = useState<Rol[]>([])
  const [rolElegido, setRolElegido] = useState<string | null>(null)
  const [permisos, setPermisos] = useState<PermisoDeRol[]>([])
  const [guardando, setGuardando] = useState<number | null>(null)

  const traer = useCallback(async () => {
    const [resModulos, resRoles] = await Promise.all([adminService.modulos(), adminService.roles()])
    const listaModulos = exigir(resModulos) ?? []
    const listaRoles = (exigir(resRoles) ?? []).filter((r) => r.active)
    setModulos(listaModulos)
    setRoles(listaRoles)

    const rol = rolElegido ?? listaRoles[0]?.name ?? null
    setRolElegido(rol)
    if (rol) {
      setPermisos(exigir(await adminService.permisosDeRol(rol)) ?? [])
    }
  }, [rolElegido])

  const { cargando, refrescando, error, cargar, refrescar } = useCarga(traer)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  const porPagina = useMemo(() => {
    const mapa = new Map<number, PermisoDeRol>()
    permisos.forEach((p) => mapa.set(p.pageId, p))
    return mapa
  }, [permisos])

  const elegirRol = async (nombre: string) => {
    setRolElegido(nombre)
    try {
      const res = await adminService.permisosDeRol(nombre)
      if (!res.correct) {
        showToast('error', res.message)
        return
      }
      setPermisos(res.object ?? [])
    } catch (err) {
      showToast('error', mensajeDeError(err))
    }
  }

  const alternar = async (pageId: number, accion: Accion) => {
    if (!rolElegido) return
    const actual = porPagina.get(pageId)
    const base = actual ?? { pageId, ...SIN_PERMISO }
    const propuesta = { ...base, [accion]: !base[accion] }

    setGuardando(pageId)
    try {
      const res = await adminService.guardarPermiso({
        roleName: rolElegido,
        pageId,
        canRead: propuesta.canRead,
        canCreate: propuesta.canCreate,
        canUpdate: propuesta.canUpdate,
        canDelete: propuesta.canDelete,
      })
      if (!res.correct) {
        showToast('error', res.message)
        return
      }
      /* Se recarga en vez de tocar el estado local porque el backend puede
         haber BORRADO la fila —quitar las cuatro es no tener permiso— y
         reflejar eso a mano aqui seria duplicar esa regla en dos sitios. */
      setPermisos(exigir(await adminService.permisosDeRol(rolElegido)) ?? [])
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
        Un modulo es una parte de La Biblioteca. Lo que marques aqui decide que ve el rol elegido cuando entra.
      </AppText>

      <View style={styles.selectorDeRol}>
        {roles.map((rol) => {
          const elegido = rol.name === rolElegido
          return (
            <TouchableOpacity
              key={rol.id}
              onPress={() => elegirRol(rol.name)}
              style={[
                styles.chipRol,
                {
                  backgroundColor: elegido ? colors.primary : 'transparent',
                  borderColor: elegido ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegido }}
              accessibilityLabel={`Ver los permisos del rol ${rol.name}`}
              testID={`elegir-rol-${rol.name}`}
            >
              <AppText variant="caption" color={elegido ? colors.background : colors.textSecondary}>
                {rol.name}
              </AppText>
            </TouchableOpacity>
          )
        })}
      </View>

      {modulos.map((modulo) => (
        <Card key={modulo.id} style={styles.tarjeta}>
          <View style={styles.cabecera}>
            <AppText variant="body" style={styles.nombreModulo}>
              {modulo.name}
            </AppText>
            <AppText variant="caption" color={modulo.active ? colors.success : colors.textMuted}>
              {modulo.active ? 'Activo' : 'Desactivado'}
            </AppText>
          </View>

          {modulo.pages.map((pagina) => {
            const permiso = porPagina.get(pagina.id)
            return (
              <View key={pagina.id} style={[styles.fila, { borderTopColor: colors.border }]}>
                <View style={styles.datosPagina}>
                  <AppText variant="caption">{pagina.name}</AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {pagina.inMenu ? 'En el menu' : 'Solo desde dentro'}
                  </AppText>
                </View>

                <View style={styles.acciones}>
                  {ACCIONES.map(({ clave, rotulo, verbo }) => {
                    const concedido = !!permiso?.[clave]
                    return (
                      <TouchableOpacity
                        key={clave}
                        onPress={() => alternar(pagina.id, clave)}
                        disabled={guardando === pagina.id}
                        style={[
                          styles.casilla,
                          {
                            backgroundColor: concedido ? colors.accent : 'transparent',
                            borderColor: concedido ? colors.accent : colors.border,
                          },
                        ]}
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: concedido,
                          disabled: guardando === pagina.id,
                        }}
                        accessibilityLabel={
                          concedido
                            ? `Quitar a ${rolElegido} el permiso de ${verbo} ${pagina.name}`
                            : `Dar a ${rolElegido} el permiso de ${verbo} ${pagina.name}`
                        }
                        testID={`permiso-${pagina.id}-${clave}`}
                      >
                        <AppText variant="caption" color={concedido ? colors.background : colors.textMuted}>
                          {rotulo}
                        </AppText>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </Card>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  explicacion: { marginBottom: spacing.md },
  selectorDeRol: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  chipRol: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  tarjeta: { marginBottom: spacing.md },
  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nombreModulo: { fontWeight: '600' },
  fila: { borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.sm },
  datosPagina: { marginBottom: spacing.xs },
  acciones: { flexDirection: 'row', flexWrap: 'wrap' },
  casilla: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
})

export default AdminModulesScreen
