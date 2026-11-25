import React, { useState } from 'react'

import { StyleSheet, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Estrellas from '@componentes/atoms/Estrellas'
import Input from '@componentes/atoms/Input'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { useAccionUnica } from '@hooks/useAccionUnica'
import { nombreEstado } from '@logica/formato'
import {
  type CamposRegistro,
  ESTADOS_REGISTRO,
  type ErroresRegistro,
  REGISTRO_INICIAL,
  validarRegistro,
} from '@logica/leyendo'
import { librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO } from '@tipos'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'

/*
 * 0.5.0 (C11) · «APUNTAR UN LIBRO QUE YA LEÍ»: para la lista de todo lo leído
 * sin subir el archivo ni preparar voz. Mismo patrón que «Añadir a deseos»:
 * una hoja corta con lo justo (título, autores, estado —Leído por defecto—,
 * cuándo lo terminaste, estrellas y una nota). Llega desde el «+».
 */
const ApuntarLeido: React.FC<{ visible: boolean; onCerrar: () => void; onCreado: (l: EjemplarDTO) => void }> = ({
  visible,
  onCerrar,
  onCreado,
}) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [f, setF] = useState<CamposRegistro>(REGISTRO_INICIAL)
  const [errores, setErrores] = useState<ErroresRegistro>({})
  const campo = (k: keyof CamposRegistro) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  /* La fecha de fin solo vale para un libro leído (C11). */
  const conFecha = f.estado === 'LEIDO'

  const { ejecutar, ejecutando } = useAccionUnica(async () => {
    const v = validarRegistro(f)
    setErrores(v.errores)
    if (!v.ok) return
    try {
      const r = await librosService.registro(v.datos)
      if (!r.correct) throw new Error(r.message)
      showToast('success', MENSAJES.registroGuardado, r.object.titulo)
      setF(REGISTRO_INICIAL)
      onCreado(r.object)
      onCerrar()
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  })

  return (
    <Hoja visible={visible} titulo="Apuntar un libro que ya leí" onCerrar={onCerrar} testID="hoja-apuntar">
      <AppText variant="body" color={colors.textSecondary}>
        Para tu lista de lecturas, sin subir el archivo. Queda en la estantería como «solo registro»: no se lee ni se
        escucha aquí.
      </AppText>
      <Input
        label="Título"
        value={f.titulo}
        onChangeText={campo('titulo')}
        error={errores.titulo}
        testID="apuntar-titulo"
      />
      <Input
        label="Autores (opcional)"
        ayuda="Si son varios, sepáralos con comas."
        value={f.autores}
        onChangeText={campo('autores')}
        error={errores.autores}
        testID="apuntar-autores"
      />
      <AppText variant="label">Cómo quedó</AppText>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Estado del libro">
        {ESTADOS_REGISTRO.map((e) => (
          <Chip
            key={e}
            rol="radio"
            etiqueta={nombreEstado(e)}
            activo={f.estado === e}
            onPress={() => setF((x) => ({ ...x, estado: e }))}
            testID={`apuntar-estado-${e}`}
          />
        ))}
      </View>
      {conFecha ? (
        <Input
          label="Cuándo lo terminaste (opcional)"
          value={f.fechaFin}
          onChangeText={campo('fechaFin')}
          placeholder="20/11/2026"
          keyboardType="numbers-and-punctuation"
          error={errores.fechaFin}
          testID="apuntar-fecha"
        />
      ) : null}
      <AppText variant="label">Tu valoración (opcional)</AppText>
      <Estrellas valor={f.calificacion} onCambiar={(v) => setF((x) => ({ ...x, calificacion: v }))} />
      <Input
        label="Nota (opcional)"
        value={f.nota}
        onChangeText={campo('nota')}
        multiline
        placeholder="Quién te lo prestó, qué te pareció…"
        error={errores.nota}
        testID="apuntar-nota"
      />
      <Button title="Apuntar" icono="check" onPress={ejecutar} loading={ejecutando} testID="apuntar-guardar" />
    </Hoja>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})

export default ApuntarLeido
