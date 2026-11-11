import React, { useState } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { EjemplarDTO } from '@tipos'
import { elegirArchivos, extensionAdmitida } from '@utils/elegirArchivos'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'

type EstadoArchivo = 'esperando' | 'subiendo' | 'listo' | 'error'

interface Fila {
  clave: string
  archivo: File
  progreso: number
  estado: EstadoArchivo
  mensaje?: string
}

interface Props {
  visible: boolean
  onCerrar: () => void
  onSubidos: (libros: EjemplarDTO[]) => void
  /** Tipo con el que se abre (desde el archivador: DOCUMENTO). */
  tipoInicial?: 'LIBRO' | 'DOCUMENTO'
}

const tamano = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/*
 * "TRAER LIBROS": se eligen uno o varios archivos (EPUB, PDF, DOCX, DOC, TXT),
 * se dice si son libros o documentos personales y se suben de uno en uno, cada
 * uno con su barra. Al terminar aparecen en la biblioteca "preparando…".
 */
const SubirLibros: React.FC<Props> = ({ visible, onCerrar, onSubidos, tipoInicial = 'LIBRO' }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [tipo, setTipo] = useState<'LIBRO' | 'DOCUMENTO'>(tipoInicial)
  const [filas, setFilas] = useState<Fila[]>([])
  const [subiendo, setSubiendo] = useState(false)

  const elegir = async () => {
    const lista = await elegirArchivos()
    const validos = lista.filter((f) => extensionAdmitida(f.name))
    if (lista.length !== validos.length) showToast('warning', MENSAJES.formatoNoAdmitido)
    setFilas((prev) => [
      ...prev,
      ...validos.map((archivo, i) => ({
        clave: `${Date.now()}-${i}-${archivo.name}`,
        archivo,
        progreso: 0,
        estado: 'esperando' as const,
      })),
    ])
  }

  const actualizar = (clave: string, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))

  const subir = async () => {
    setSubiendo(true)
    const subidos: EjemplarDTO[] = []
    for (const f of filas.filter((x) => x.estado === 'esperando' || x.estado === 'error')) {
      actualizar(f.clave, { estado: 'subiendo', progreso: 0, mensaje: undefined })
      try {
        const r = await librosService.subir(f.archivo, tipo, (p) => actualizar(f.clave, { progreso: p }))
        if (!r.correct) throw new Error(r.message)
        subidos.push(...(r.object ?? []))
        actualizar(f.clave, { estado: 'listo', progreso: 1 })
      } catch (e) {
        actualizar(f.clave, { estado: 'error', mensaje: mensajeDelServidor(e, MENSAJES.subidaFallo) })
      }
    }
    setSubiendo(false)
    if (subidos.length) {
      showToast('success', MENSAJES.subidaListo, MENSAJES.subidaPreparando)
      onSubidos(subidos)
    }
  }

  const cerrar = () => {
    if (subiendo) return
    setFilas([])
    onCerrar()
  }

  const pendientes = filas.filter((f) => f.estado === 'esperando' || f.estado === 'error').length
  const terminados = filas.length > 0 && filas.every((f) => f.estado === 'listo')

  return (
    <Hoja visible={visible} titulo="Traer libros" onCerrar={cerrar} testID="hoja-subir">
      <AppText variant="body" color={colors.textSecondary}>
        Elige archivos EPUB, PDF, Word (DOCX o DOC) o de texto. En el iPhone puedes traerlos de iCloud Drive o Google
        Drive.
      </AppText>
      <View style={styles.tipos} accessibilityRole="radiogroup" accessibilityLabel="Qué vas a traer">
        <Chip etiqueta="Libros" icono="book" activo={tipo === 'LIBRO'} onPress={() => setTipo('LIBRO')} />
        <Chip
          etiqueta="Documentos personales"
          icono="archivador"
          activo={tipo === 'DOCUMENTO'}
          onPress={() => setTipo('DOCUMENTO')}
        />
      </View>
      <Button
        title={filas.length ? 'Añadir más archivos' : 'Elegir archivos'}
        icono="upload"
        variant={filas.length ? 'secondary' : 'primary'}
        onPress={elegir}
        disabled={subiendo}
        testID="elegir-archivos"
      />
      {filas.map((f) => (
        <View key={f.clave} style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.filaCabeza}>
            <Icono
              nombre={f.estado === 'listo' ? 'check' : f.estado === 'error' ? 'close' : 'book'}
              color={f.estado === 'error' ? colors.danger : colors.primary}
              tamano={20}
            />
            <Text style={[styles.nombre, { color: colors.text }]} numberOfLines={1}>
              {f.archivo.name}
            </Text>
            <Text style={[styles.peso, { color: colors.textMuted }]}>{tamano(f.archivo.size)}</Text>
          </View>
          <Barra
            porcentaje={f.progreso * 100}
            etiqueta={`Subida de ${f.archivo.name}`}
            color={f.estado === 'error' ? colors.danger : undefined}
          />
          <Text style={[styles.estado, { color: f.estado === 'error' ? colors.danger : colors.textSecondary }]}>
            {f.estado === 'esperando' && 'Listo para subir'}
            {f.estado === 'subiendo' && `Subiendo… ${Math.round(f.progreso * 100)} %`}
            {f.estado === 'listo' && '✓ Subido — preparando…'}
            {f.estado === 'error' && `⚠ ${f.mensaje ?? MENSAJES.subidaFallo}`}
          </Text>
        </View>
      ))}
      {filas.length > 0 && !terminados ? (
        <Button
          title={pendientes > 1 ? `Subir ${pendientes} archivos` : 'Subir'}
          onPress={subir}
          loading={subiendo}
          disabled={pendientes === 0}
          testID="subir"
        />
      ) : null}
      {terminados ? <Button title="Listo" onPress={cerrar} /> : null}
    </Hoja>
  )
}

const styles = StyleSheet.create({
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fila: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  filaCabeza: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  peso: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  estado: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
})

export default SubirLibros
