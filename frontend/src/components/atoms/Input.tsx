import React, { useState } from 'react'

import { KeyboardTypeOptions, StyleSheet, Text, TextInput, View } from 'react-native'

import { useTheme } from '@contextos/ThemeContext'
import { fontSize, fontWeight, fuentes, spacing } from '@tema'
import { web } from '@tema/web'

interface InputProps {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  error?: string
  keyboardType?: KeyboardTypeOptions
  multiline?: boolean
  /** El nombre que se OYE cuando no hay etiqueta visible (p. ej. el buscador). */
  accessibilityLabel?: string
  autoComplete?: 'email' | 'password' | 'name' | 'off' | 'new-password'
  testID?: string
  onSubmitEditing?: () => void
}

/*
 * Campo de texto. La etiqueta y el error van también en el nombre accesible:
 * el error no puede ser solo el borde rojo (estándar 35, nada solo por color).
 */
const Input: React.FC<InputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  error,
  keyboardType = 'default',
  multiline = false,
  accessibilityLabel,
  autoComplete,
  testID,
  onSubmitEditing,
}) => {
  const { colors } = useTheme()
  const [foco, setFoco] = useState(false)
  const borde = error ? colors.danger : foco ? colors.primary : colors.border
  const nombre = accessibilityLabel || label

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: foco ? colors.primary : colors.textSecondary }]}>{label}</Text>
      ) : null}
      <TextInput
        testID={testID}
        accessibilityLabel={error ? `${nombre}. Error: ${error}` : nombre}
        accessibilityHint={placeholder}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: borde },
          multiline && styles.multiline,
          web({ outlineStyle: 'none', boxShadow: foco ? `0 0 0 3px ${colors.primary}33` : 'none' }),
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoComplete={autoComplete}
        autoCapitalize={keyboardType === 'email-address' || secureTextEntry ? 'none' : 'sentences'}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onSubmitEditing={onSubmitEditing}
      />
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">
          ⚠ {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: {
    fontSize: fontSize.xs,
    fontFamily: fuentes.uiMedia,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    marginLeft: 2,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    fontFamily: fuentes.ui,
    minHeight: 48,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { fontSize: fontSize.xs, marginTop: spacing.xs, marginLeft: 2, fontFamily: fuentes.ui },
})

export default Input
