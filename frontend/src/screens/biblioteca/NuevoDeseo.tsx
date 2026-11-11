import React, { useState } from 'react'

import Button from '@componentes/atoms/Button'
import Input from '@componentes/atoms/Input'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { useAccionUnica } from '@hooks/useAccionUnica'
import { librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO } from '@tipos'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { esquemaDeseo, validar } from '@validaciones/index'

type Campos = { titulo: string; autor: string; nota: string }

/** "Añadir a deseos": un libro que aún no tienes (sin archivo). */
const NuevoDeseo: React.FC<{ visible: boolean; onCerrar: () => void; onCreado: (l: EjemplarDTO) => void }> = ({
  visible,
  onCerrar,
  onCreado,
}) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [f, setF] = useState<Campos>({ titulo: '', autor: '', nota: '' })
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({})

  const { ejecutar, ejecutando } = useAccionUnica(async () => {
    const v = validar(esquemaDeseo, f)
    setErrores(v.errores)
    if (!v.ok) return
    try {
      const r = await librosService.deseo(v.datos)
      if (!r.correct) throw new Error(r.message)
      showToast('success', MENSAJES.deseoGuardado, r.object.titulo)
      setF({ titulo: '', autor: '', nota: '' })
      onCreado(r.object)
      onCerrar()
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  })

  return (
    <Hoja visible={visible} titulo="Añadir a deseos" onCerrar={onCerrar} testID="hoja-deseo">
      <AppText variant="body" color={colors.textSecondary}>
        Un libro que quieres tener. Cuando llegue el archivo, lo traes y queda en tu biblioteca.
      </AppText>
      <Input
        label="Título"
        value={f.titulo}
        onChangeText={(t) => setF((x) => ({ ...x, titulo: t }))}
        error={errores.titulo}
        testID="deseo-titulo"
      />
      <Input
        label="Autor (opcional)"
        value={f.autor}
        onChangeText={(t) => setF((x) => ({ ...x, autor: t }))}
        error={errores.autor}
      />
      <Input
        label="Nota (opcional)"
        value={f.nota}
        onChangeText={(t) => setF((x) => ({ ...x, nota: t }))}
        multiline
        placeholder="Dónde lo vi, qué edición…"
        error={errores.nota}
      />
      <Button title="Guardar deseo" icono="deseo" onPress={ejecutar} loading={ejecutando} testID="deseo-guardar" />
    </Hoja>
  )
}

export default NuevoDeseo
