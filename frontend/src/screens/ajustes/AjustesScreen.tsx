import React, { useEffect, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import Encabezado from '@componentes/molecules/Encabezado'
import Sala from '@componentes/molecules/Sala'
import { MODO_DEMO } from '@config'
import { useAuth } from '@contextos/AuthContext'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { motor } from '@contextos/VozContext'
import { PASOS_VELOCIDAD, textoVelocidad } from '@logica/velocidad'
import type { Rutas } from '@navegacion/linking'
import { vocesService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { VozDTO } from '@tipos'
import { confirmarAccion } from '@utils/confirmar'

type Props = NativeStackScreenProps<Rutas, 'Ajustes'>

/** Ajustes: el ambiente, la voz y la velocidad con que se empieza, los sonidos, la cuenta. */
const AjustesScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark, setOscuro } = useTheme()
  const { user, logout, esAdmin } = useAuth()
  const { prefs, cambiar } = usePreferencias()
  const [voces, setVoces] = useState<VozDTO[]>([])

  useEffect(() => {
    vocesService
      .todas()
      .then((r) => r.correct && setVoces(r.object))
      .catch((e) => console.warn('[ajustes] voces', e))
  }, [])

  const salir = () =>
    confirmarAccion({
      titulo: 'Cerrar sesión',
      mensaje: '¿Seguro que quieres salir? Tu avance queda guardado en el servidor.',
      textoConfirmar: 'Sí, salir',
      onConfirmar: () => {
        motor.detener()
        logout()
      },
    })

  const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
    <View style={[styles.tarjeta, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppText variant="subtitle">{titulo}</AppText>
      {children}
    </View>
  )

  const admin: [keyof Rutas, string, string][] = [
    ['AdminUsers', 'Usuarios', 'users'],
    ['AdminRoles', 'Roles', 'shield'],
    ['AdminModules', 'Módulos y permisos', 'key'],
    ['AdminAudit', 'Auditoría', 'history'],
  ]

  return (
    <Sala>
      <Encabezado titulo="Ajustes" atras />
      <ScrollView contentContainerStyle={styles.contenido}>
        <View style={styles.cuenta} accessible accessibilityLabel={`Tu cuenta: ${user?.name}, ${user?.email}`}>
          <View style={[styles.avatar, { borderColor: colors.primaryLight, backgroundColor: colors.surfaceLight }]}>
            <Text style={[styles.inicial, { color: colors.primary }]}>
              {(user?.name ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <AppText variant="subtitle">{user?.name}</AppText>
          <AppText variant="caption">{user?.email}</AppText>
        </View>

        <Seccion titulo="Ambiente">
          <View style={styles.chips}>
            <Chip etiqueta="Biblioteca de noche" icono="luna" activo={isDark} onPress={() => setOscuro(true)} />
            <Chip etiqueta="Sala de lectura de día" icono="sol" activo={!isDark} onPress={() => setOscuro(false)} />
          </View>
          <View style={styles.chips}>
            <Chip
              etiqueta={prefs.sonidos ? 'Sonidos: sí' : 'Sonidos: no'}
              icono={prefs.sonidos ? 'sonido' : 'silencio'}
              activo={prefs.sonidos}
              onPress={() => cambiar({ sonidos: !prefs.sonidos })}
            />
          </View>
          <AppText variant="caption">
            Pasar la página, el roce de la madera al sacar un libro y la tapa al abrirse.
          </AppText>
        </Seccion>

        <Seccion titulo="Voz por defecto">
          <View style={styles.chips}>
            {voces.map((v) => (
              <Chip
                key={v.id}
                etiqueta={`${v.nombre} · ${v.pais}`}
                activo={prefs.vozId === v.id}
                onPress={() => cambiar({ vozId: v.id })}
              />
            ))}
          </View>
          <AppText variant="label">Velocidad con la que se empieza</AppText>
          <View style={styles.chips}>
            {PASOS_VELOCIDAD.map((p) => (
              <Chip
                key={p}
                etiqueta={textoVelocidad(p)}
                activo={prefs.velocidad === p}
                onPress={() => cambiar({ velocidad: p })}
              />
            ))}
          </View>
        </Seccion>

        {esAdmin ? (
          <Seccion titulo="Administración">
            {admin.map(([ruta, nombre, icono]) => (
              <Pressable
                key={ruta}
                onPress={() => navigation.navigate(ruta as 'AdminUsers')}
                accessibilityRole="button"
                accessibilityLabel={nombre}
                style={[styles.enlace, { borderBottomColor: colors.border }]}
              >
                <Icono nombre={icono} color={colors.primary} />
                <Text style={[styles.enlaceTexto, { color: colors.text }]}>{nombre}</Text>
                <Icono nombre="right" color={colors.textMuted} />
              </Pressable>
            ))}
          </Seccion>
        ) : null}

        <Button title="Cerrar sesión" variant="outline" icono="logout" onPress={salir} />
        <AppText variant="caption" align="center">
          La Biblioteca AH · web{MODO_DEMO ? ' · modo demostración' : ''}
        </AppText>
      </ScrollView>
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 120, maxWidth: 680, width: '100%', alignSelf: 'center' },
  cuenta: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  inicial: { fontFamily: fuentes.tituloNegrita, fontSize: 36 },
  tarjeta: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  enlaceTexto: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
})

export default AjustesScreen
