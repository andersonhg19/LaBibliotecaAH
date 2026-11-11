import React, { useEffect, useState } from 'react'

import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Input from '@componentes/atoms/Input'
import AppText from '@componentes/atoms/Text'
import Sala from '@componentes/molecules/Sala'
import { MODO_DEMO } from '@config'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import type { Rutas } from '@navegacion/linking'
import { fontSize, fuentes, spacing } from '@tema'
import { web } from '@tema/web'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { esquemaEntrar, validar } from '@validaciones/index'

type Props = NativeStackScreenProps<Rutas, 'Entrar'>

/** Se recuerda en el dispositivo que el registro está cerrado: la entrada deja de ofrecer "Crea tu cuenta". */
export const CLAVE_REGISTRO_CERRADO = '@biblioteca_ah_registro_cerrado'

/** El escudo de la casa: monograma AH en latón dentro de un doble círculo. */
export const Escudo: React.FC<{ tamano?: number }> = ({ tamano = 108 }) => {
  const { colors, isDark } = useTheme()
  return (
    <View
      accessible={false}
      style={[
        styles.escudo,
        { width: tamano, height: tamano, borderRadius: tamano / 2, borderColor: colors.primaryLight },
        web({
          backgroundImage: isDark
            ? 'radial-gradient(circle at 35% 30%, #5A3A22, #2B1A10 70%)'
            : 'radial-gradient(circle at 35% 30%, #FFF6E2, #EADCBC 70%)',
          boxShadow:
            '0 0 0 6px rgba(201,162,39,0.15), 0 12px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,240,200,0.4)',
        }),
      ]}
    >
      <View style={[styles.escudoInterior, { borderColor: colors.primaryLight, borderRadius: tamano / 2 - 8 }]}>
        <Text
          style={[
            styles.monograma,
            { color: isDark ? '#E8C877' : colors.primary, fontSize: tamano * 0.38 },
            web({ textShadow: '0 1px 0 rgba(0,0,0,0.5), 0 0 12px rgba(232,200,119,0.35)' }),
          ]}
        >
          AH
        </Text>
      </View>
    </View>
  )
}

/*
 * LA ENTRADA DE LA BIBLIOTECA: el escudo de la casa bajo la lámpara, el
 * nombre en Cormorant y un atril de pergamino donde se firma la entrada.
 */
const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const { login, avisoDeSesion, limpiarAvisoDeSesion } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [errores, setErrores] = useState<{ usuario?: string; password?: string }>({})
  /* Si el servidor ya dijo que el registro está cerrado, no se ofrece "Crea tu cuenta" (contrato v1.2). */
  const [registroCerrado, setRegistroCerrado] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem(CLAVE_REGISTRO_CERRADO)
      .then((v) => setRegistroCerrado(v === '1'))
      .catch(() => {})
  }, [])

  const entrar = async () => {
    const v = validar(esquemaEntrar, { usuario, password })
    setErrores(v.errores)
    if (!v.ok) return
    setCargando(true)
    try {
      await login(v.datos.usuario, v.datos.password)
    } catch (err) {
      showToast('error', MENSAJES.entrarFallo, mensajeDelServidor(err, MENSAJES.entrarRespaldo))
    } finally {
      setCargando(false)
    }
  }

  return (
    <Sala>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <View
            style={styles.cabecera}
            accessible
            accessibilityLabel="La Biblioteca AH. Entra: los libros te esperan donde los dejaste."
          >
            <Escudo />
            <AppText variant="display" align="center" style={styles.nombre}>
              La Biblioteca AH
            </AppText>
            <Text style={[styles.lema, { color: colors.textSecondary }]}>Los libros te esperan donde los dejaste.</Text>
          </View>

          {avisoDeSesion ? (
            <View
              style={[styles.aviso, { borderColor: colors.warning, backgroundColor: colors.surface }]}
              accessibilityRole="alert"
            >
              <AppText variant="body" style={styles.flex}>
                ⚠ {avisoDeSesion}
              </AppText>
              <Pressable
                onPress={limpiarAvisoDeSesion}
                style={styles.cerrarAviso}
                accessibilityRole="button"
                accessibilityLabel="Cerrar el aviso"
              >
                <AppText variant="body" color={colors.textSecondary}>
                  ✕
                </AppText>
              </Pressable>
            </View>
          ) : null}

          <View
            style={[
              styles.atril,
              { backgroundColor: colors.surface, borderColor: colors.border },
              web({ boxShadow: '0 20px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' }),
            ]}
          >
            <Input
              label="Correo o usuario"
              value={usuario}
              onChangeText={setUsuario}
              placeholder="tu@correo.com o tu usuario"
              autoComplete="username"
              autoCapitalize="none"
              error={errores.usuario}
              testID="entrar-correo"
            />
            <Input
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
              autoComplete="password"
              error={errores.password}
              onSubmitEditing={entrar}
              testID="entrar-clave"
            />
            <Button
              title="Entrar a la biblioteca"
              onPress={entrar}
              loading={cargando}
              size="large"
              testID="entrar-boton"
            />
            {MODO_DEMO ? (
              <AppText variant="caption" align="center" style={styles.demo}>
                Modo demostración: entra con cualquier correo o usuario y una contraseña de 6 o más caracteres.
              </AppText>
            ) : null}
          </View>

          {registroCerrado ? (
            <AppText variant="caption" align="center" style={styles.demo}>
              ¿Primera vez? Pide a quien administra la biblioteca que te cree la cuenta.
            </AppText>
          ) : (
            <Pressable
              onPress={() => navigation.navigate('Registro')}
              style={styles.enlace}
              accessibilityRole="link"
              accessibilityLabel="¿Primera vez? Crea tu cuenta"
            >
              <AppText variant="body" color={colors.textSecondary}>
                ¿Primera vez?{' '}
              </AppText>
              <AppText variant="body" color={colors.primary} style={styles.enlaceTexto}>
                Crea tu cuenta
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Sala>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  cabecera: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
  escudo: { borderWidth: 2, padding: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A2416' },
  escudoInterior: { flex: 1, alignSelf: 'stretch', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monograma: { fontFamily: fuentes.tituloNegrita, letterSpacing: 2 },
  nombre: { marginTop: spacing.md },
  lema: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.lg, textAlign: 'center' },
  atril: { borderRadius: 14, borderWidth: 1, padding: spacing.lg, gap: 4 },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 48,
  },
  cerrarAviso: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  demo: { marginTop: spacing.md },
  enlace: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    alignItems: 'center',
  },
  enlaceTexto: { fontFamily: fuentes.uiSemi },
})

export default LoginScreen
