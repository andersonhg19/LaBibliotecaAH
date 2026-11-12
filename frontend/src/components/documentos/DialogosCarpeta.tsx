import React, { useEffect, useMemo, useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import Input from '@componentes/atoms/Input'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { arbolPlano, cuentaDeCarpeta } from '@logica/carpetas'
import { plural } from '@logica/formato'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { CarpetaDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'

// ---------------------------------------------------------------- nombre (crear / renombrar)

interface NombreProps {
  visible: boolean
  /** Con carpeta: renombrar; sin ella: crear dentro de `dentroDe` (o en la raíz). */
  carpeta?: CarpetaDTO | null
  dentroDe?: string | null
  onCerrar: () => void
  onGuardar: (nombre: string) => Promise<string | null>
}

export const MAX_NOMBRE_CARPETA = 100

/** Crear o renombrar: un campo y un botón. El error del servidor (nombre repetido…) se muestra en el campo. */
export const NombreCarpeta: React.FC<NombreProps> = ({ visible, carpeta, dentroDe, onCerrar, onGuardar }) => {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (visible) {
      setNombre(carpeta?.nombre ?? '')
      setError(undefined)
    }
  }, [visible, carpeta])

  const guardar = async () => {
    const limpio = nombre.replace(/\s+/g, ' ').trim()
    if (!limpio) return setError('Escribe un nombre.')
    if (limpio.length > MAX_NOMBRE_CARPETA) return setError(`Como mucho ${MAX_NOMBRE_CARPETA} caracteres.`)
    setGuardando(true)
    const fallo = await onGuardar(limpio)
    setGuardando(false)
    if (fallo) setError(fallo)
    else onCerrar()
  }

  return (
    <Hoja
      visible={visible}
      titulo={carpeta ? 'Renombrar carpeta' : 'Nueva carpeta'}
      onCerrar={onCerrar}
      ancho={440}
      testID="hoja-nombre-carpeta"
    >
      {!carpeta && dentroDe ? <AppText variant="caption">Dentro de «{dentroDe}»</AppText> : null}
      <Input
        label="Nombre de la carpeta"
        value={nombre}
        onChangeText={(t) => {
          setNombre(t)
          setError(undefined)
        }}
        placeholder="Por ejemplo: Proyectos 2026"
        error={error}
        autoFocus
        autoCapitalize="sentences"
        onSubmitEditing={guardar}
        testID="campo-nombre-carpeta"
      />
      <Button
        title={carpeta ? 'Guardar' : 'Crear carpeta'}
        onPress={guardar}
        loading={guardando}
        testID="guardar-carpeta"
      />
    </Hoja>
  )
}

// ---------------------------------------------------------------- borrar

interface BorrarProps {
  visible: boolean
  carpeta: CarpetaDTO | null
  /** «Proyectos» o «la raíz del archivador»: adónde sube lo de dentro. */
  destino: string
  onCerrar: () => void
  onBorrar: (contenido?: 'SUBIR' | 'BORRAR') => void
}

/*
 * Borrar una carpeta. Vacía: una confirmación. Con algo dentro: se ELIGE qué
 * pasa con ello —subirlo a la carpeta de arriba (lo seguro, primero) o
 * retirarlo todo— y la segunda opción dice exactamente cuánto se va.
 */
export const BorrarCarpeta: React.FC<BorrarProps> = ({ visible, carpeta, destino, onCerrar, onBorrar }) => {
  const { colors } = useTheme()
  if (!carpeta) return null
  const vacia = carpeta.nDocumentos === 0 && carpeta.nSubcarpetas === 0
  const cuenta = cuentaDeCarpeta(carpeta).toLowerCase()
  return (
    <Hoja
      visible={visible}
      titulo={`Borrar «${carpeta.nombre}»`}
      onCerrar={onCerrar}
      ancho={460}
      testID="hoja-borrar-carpeta"
    >
      {vacia ? (
        <>
          <AppText variant="body" color={colors.textSecondary}>
            La carpeta está vacía.
          </AppText>
          <Button title="Borrar carpeta" variant="danger" onPress={() => onBorrar()} testID="borrar-vacia" />
        </>
      ) : (
        <>
          <AppText variant="body" color={colors.textSecondary}>
            Tiene {cuenta}. ¿Qué hacemos con lo de dentro?
          </AppText>
          <Button
            title={`Pasarlo a ${destino}`}
            icono="up"
            onPress={() => onBorrar('SUBIR')}
            accessibilityHint="Borra solo la carpeta; sus documentos y subcarpetas no se pierden"
            testID="borrar-subir"
          />
          <Button
            title={
              carpeta.nDocumentos > 0 ? `Borrar también ${plural(carpeta.nDocumentos, 'documento')}` : 'Borrar todo'
            }
            variant="danger"
            icono="trash"
            onPress={() => onBorrar('BORRAR')}
            accessibilityHint="Retira los documentos y borra las subcarpetas; tus notas se conservan si vuelves a subirlos"
            testID="borrar-todo"
          />
          <AppText variant="caption">
            Retirar un documento conserva tus notas y subrayados: si lo vuelves a subir, reaparecen.
          </AppText>
        </>
      )}
      <Button title="Cancelar" variant="ghost" onPress={onCerrar} />
    </Hoja>
  )
}

// ---------------------------------------------------------------- elegir destino (mover)

interface ElegirProps {
  visible: boolean
  titulo: string
  carpetas: CarpetaDTO[]
  /** Donde está ahora lo que se mueve (se marca y no se puede elegir). */
  actual: string | null
  /** Al mover una carpeta: no puede ir dentro de sí misma. */
  sinElSubarbolDe?: string | null
  onCerrar: () => void
  onElegir: (destinoId: string | null) => void
}

/*
 * ¿A qué carpeta? El árbol completo con sangría por nivel (y la raíz arriba).
 * Si hay muchas, se filtra escribiendo. Donde ya está lo que se mueve sale
 * marcado y desactivado.
 */
export const ElegirCarpeta: React.FC<ElegirProps> = ({
  visible,
  titulo,
  carpetas,
  actual,
  sinElSubarbolDe,
  onCerrar,
  onElegir,
}) => {
  const { colors } = useTheme()
  const [filtro, setFiltro] = useState('')
  useEffect(() => {
    if (visible) setFiltro('')
  }, [visible])
  const arbol = useMemo(() => arbolPlano(carpetas, sinElSubarbolDe), [carpetas, sinElSubarbolDe])
  const clave = filtro.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const visibles = clave
    ? arbol.filter((c) => c.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(clave))
    : arbol
  const opciones = [{ id: null as string | null, nombre: 'Raíz del archivador', nivel: 0, cuenta: '' }].concat(
    visibles.map((c) => ({
      id: c.id as string | null,
      nombre: c.nombre,
      nivel: clave ? 0 : c.nivel + 1,
      cuenta: cuentaDeCarpeta(c),
    })),
  )
  return (
    <Hoja visible={visible} titulo={titulo} onCerrar={onCerrar} ancho={480} testID="hoja-elegir-carpeta">
      {carpetas.length > 8 ? (
        <Input label="Buscar carpeta" value={filtro} onChangeText={setFiltro} compacto testID="filtro-carpetas" />
      ) : null}
      <View style={styles.arbol} accessibilityRole="radiogroup" accessibilityLabel={titulo}>
        {opciones.map((o) => {
          const aqui = o.id === actual
          return (
            <Pressable
              key={o.id ?? 'raiz'}
              {...estadoElegible('radio', aqui, aqui)}
              disabled={aqui}
              accessibilityLabel={`${o.nombre}${aqui ? ', está aquí' : ''}`}
              onPress={() => onElegir(o.id)}
              testID={`destino-${o.id ?? 'raiz'}`}
              style={({ pressed }) => [
                styles.opcion,
                { paddingLeft: 12 + Math.min(o.nivel, 8) * 18, borderColor: colors.border },
                aqui && { opacity: 0.55 },
                pressed && { backgroundColor: colors.surfaceLight },
                web({ cursor: aqui ? 'default' : 'pointer' }),
              ]}
            >
              <Icono nombre={o.id ? 'archivador' : 'libroAbierto'} color={colors.primary} tamano={18} />
              <Text style={[styles.opcionTexto, { color: colors.text }]} numberOfLines={1}>
                {o.nombre}
              </Text>
              {aqui ? (
                <Text style={[styles.opcionCuenta, { color: colors.textMuted }]}>aquí</Text>
              ) : o.cuenta ? (
                <Text style={[styles.opcionCuenta, { color: colors.textMuted }]}>{o.cuenta}</Text>
              ) : null}
            </Pressable>
          )
        })}
        {clave && !visibles.length ? <AppText variant="caption">Ninguna carpeta se llama así.</AppText> : null}
      </View>
    </Hoja>
  )
}

const styles = StyleSheet.create({
  arbol: { gap: 4 },
  opcion: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 12,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  opcionTexto: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  opcionCuenta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
})
