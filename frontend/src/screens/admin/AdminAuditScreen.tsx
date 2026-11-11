import React, { useCallback, useState } from 'react'

import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'

import { useFocusEffect } from '@react-navigation/native'

import Card from '@componentes/atoms/Card'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import EmptyState from '@componentes/molecules/EmptyState'
import EstadoError from '@componentes/molecules/EstadoError'
import { useTheme } from '@contextos/ThemeContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { adminService } from '@servicios/adminService'
import { spacing } from '@tema'
import { LineaDeAuditoria } from '@tipos'

/** Ventanas de tiempo. Sin una, la consulta traeria la tabla entera. */
const VENTANAS = [
  { dias: 7, rotulo: 'Semana' },
  { dias: 30, rotulo: 'Mes' },
  { dias: 365, rotulo: 'Ano' },
]

/**
 * Lo que ha pasado en la plataforma: quien entro, quien cambio roles, quien
 * toco permisos.
 *
 * SOLO SE LEE. No hay boton de borrar ni de editar, y su ausencia es el
 * diseno: un registro que se puede retocar desde la aplicacion no prueba nada.
 * Lo unico que borra lineas es la retencion por antiguedad, y la hace un
 * proceso de madrugada, no una persona.
 */
const AdminAuditScreen: React.FC = () => {
  const { colors } = useTheme()

  const [lineas, setLineas] = useState<LineaDeAuditoria[]>([])
  const [dias, setDias] = useState(30)

  const traer = useCallback(async () => {
    const res = await adminService.auditoria({ ultimosDias: dias, page: 0, size: 100 })
    setLineas(exigir(res)?.list ?? [])
  }, [dias])

  const { cargando, refrescando, error, cargar, refrescar } = useCarga(traer)

  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  /** El color acompana, pero lo que dice lo que paso es la palabra. */
  const comoSePinta = (accion: string) => {
    if (accion === 'LOGIN') return colors.textSecondary
    if (accion.startsWith('ROLE') || accion === 'PERMISSION_CHANGE') return colors.warning
    if (accion === 'USER_DEACTIVATE') return colors.danger
    return colors.success
  }

  const enPalabras = (accion: string) => {
    switch (accion) {
      case 'LOGIN':
        return 'Entro'
      case 'USER_CREATE':
        return 'Creo una cuenta'
      case 'USER_ACTIVATE':
        return 'Reactivo una cuenta'
      case 'USER_DEACTIVATE':
        return 'Desactivo una cuenta'
      case 'ROLE_CREATE':
        return 'Creo un rol'
      case 'ROLE_UPDATE':
        return 'Cambio un rol'
      case 'ROLE_DEACTIVATE':
        return 'Retiro un rol'
      case 'ROLES_ASSIGNED':
        return 'Cambio los roles de alguien'
      case 'PERMISSION_CHANGE':
        return 'Cambio permisos'
      default:
        return accion
    }
  }

  const cuando = (iso: string) => {
    const fecha = new Date(iso)
    return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleString()
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
      <View style={styles.ventanas}>
        {VENTANAS.map((ventana) => {
          const elegida = ventana.dias === dias
          return (
            <TouchableOpacity
              key={ventana.dias}
              onPress={() => setDias(ventana.dias)}
              style={[
                styles.chip,
                {
                  backgroundColor: elegida ? colors.primary : 'transparent',
                  borderColor: elegida ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: elegida }}
              accessibilityLabel={`Ver lo ocurrido en el ultimo periodo: ${ventana.rotulo}`}
              testID={`ventana-${ventana.dias}`}
            >
              <AppText variant="caption" color={elegida ? colors.background : colors.textSecondary}>
                {ventana.rotulo}
              </AppText>
            </TouchableOpacity>
          )
        })}
      </View>

      {lineas.length === 0 && <EmptyState title="Nada que contar" message="No hay movimientos en este periodo" />}

      {lineas.map((linea) => (
        <Card key={linea.id} style={styles.tarjeta}>
          <View style={styles.cabecera}>
            <AppText variant="caption" color={comoSePinta(linea.action)} style={styles.accion}>
              {enPalabras(linea.action)}
            </AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {cuando(linea.occurredAt)}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.textSecondary}>
            {linea.actorEmail ?? 'sin identificar'}
          </AppText>
          {!!linea.details && (
            <AppText variant="caption" color={colors.textMuted} style={styles.detalle}>
              {linea.details}
            </AppText>
          )}
        </Card>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  ventanas: { flexDirection: 'row', marginBottom: spacing.md },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  tarjeta: { marginBottom: spacing.sm },
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accion: { fontWeight: '600' },
  detalle: { marginTop: spacing.xs },
})

export default AdminAuditScreen
