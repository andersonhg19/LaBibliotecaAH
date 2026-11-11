import React, { useState } from 'react'

import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Input from '@componentes/atoms/Input'
import AppText from '@componentes/atoms/Text'
import Sala from '@componentes/molecules/Sala'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import type { Rutas } from '@navegacion/linking'
import { Escudo } from '@pantallas/auth/LoginScreen'
import { spacing } from '@tema'
import { web } from '@tema/web'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { esquemaRegistro, validar } from '@validaciones/index'

type Props = NativeStackScreenProps<Rutas, 'Registro'>

type Campos = { name: string; email: string; password: string; confirmar: string }

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const { register } = useAuth()
  const [f, setF] = useState<Campos>({ name: '', email: '', password: '', confirmar: '' })
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({})
  const [cargando, setCargando] = useState(false)
  const campo = (k: keyof Campos) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  const crear = async () => {
    const v = validar(esquemaRegistro, f)
    setErrores(v.errores)
    if (!v.ok) return
    setCargando(true)
    try {
      await register(v.datos.name, v.datos.email, v.datos.password)
    } catch (err) {
      showToast('error', MENSAJES.registroFallo, mensajeDelServidor(err, MENSAJES.registroRespaldo))
    } finally {
      setCargando(false)
    }
  }

  return (
    <Sala>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <View style={styles.cabecera} accessible accessibilityLabel="La Biblioteca AH. Crea tu cuenta de lector.">
            <Escudo tamano={84} />
            <AppText variant="title" align="center">
              Tu carné de lector
            </AppText>
          </View>
          <View
            style={[
              styles.atril,
              { backgroundColor: colors.surface, borderColor: colors.border },
              web({ boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }),
            ]}
          >
            <Input
              label="Nombre"
              value={f.name}
              onChangeText={campo('name')}
              placeholder="Cómo te llamamos"
              autoComplete="name"
              error={errores.name}
            />
            <Input
              label="Correo"
              value={f.email}
              onChangeText={campo('email')}
              placeholder="tu@correo.com"
              keyboardType="email-address"
              autoComplete="email"
              error={errores.email}
            />
            <Input
              label="Contraseña"
              value={f.password}
              onChangeText={campo('password')}
              placeholder="8 o más, con letras y números"
              secureTextEntry
              autoComplete="new-password"
              error={errores.password}
            />
            <Input
              label="Repite la contraseña"
              value={f.confirmar}
              onChangeText={campo('confirmar')}
              secureTextEntry
              autoComplete="new-password"
              error={errores.confirmar}
              onSubmitEditing={crear}
            />
            <Button title="Crear mi cuenta" onPress={crear} loading={cargando} size="large" />
          </View>
          <Pressable
            onPress={() => navigation.navigate('Entrar')}
            style={styles.enlace}
            accessibilityRole="link"
            accessibilityLabel="¿Ya tienes cuenta? Entra"
          >
            <AppText variant="body" color={colors.textSecondary}>
              ¿Ya tienes cuenta?{' '}
            </AppText>
            <AppText variant="body" color={colors.primary}>
              Entra
            </AppText>
          </Pressable>
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
  cabecera: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  atril: { borderRadius: 14, borderWidth: 1, padding: spacing.lg },
  enlace: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    alignItems: 'center',
  },
})

export default RegisterScreen
