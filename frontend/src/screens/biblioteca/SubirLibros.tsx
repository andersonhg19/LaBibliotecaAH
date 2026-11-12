import React, { useState } from 'react'

import { StyleSheet, Text, View } from 'react-native'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import Hoja from '@componentes/molecules/Hoja'
import { TOPE_ARCHIVO_MB } from '@config'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { EjemplarDTO } from '@tipos'
import { elegirArchivos, extensionAdmitida } from '@utils/elegirArchivos'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'

type EstadoArchivo = 'esperando' | 'subiendo' | 'listo' | 'repetido' | 'error'

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
  /** "Ya lo tengo": el archivo que llegue cumple este deseo (BI-15). */
  deseo?: EjemplarDTO | null
  /** v1.6: subir directamente a esta carpeta del archivador (solo documentos). */
  carpeta?: { id: string; nombre: string } | null
  /** v1.6: desde el archivador solo se traen documentos (sin elegir libro/documento). */
  soloDocumentos?: boolean
}

const tamano = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** Margen para decidir que un ejemplar "ya estaba": llegó antes de empezar a subir. */
const MARGEN_REPETIDO_MS = 120000

/**
 * ¿La subida devolvió algo que ya tenías? (BI-16) El servidor (v1.2) lo dice
 * con `yaLoTenias`; mientras tanto se deduce de la fecha de llegada.
 */
export function yaEstaba(l: EjemplarDTO | undefined, inicio: number): boolean {
  if (!l) return false
  if (typeof l.yaLoTenias === 'boolean') return l.yaLoTenias
  const llegada = Date.parse(l.fechaLlegada)
  return Number.isFinite(llegada) && llegada < inicio - MARGEN_REPETIDO_MS
}

/** Por qué un archivo no se puede subir (vacío o por encima del tope), o null si se puede. */
export function noSeSube(a: { size: number }): string | null {
  if (a.size === 0) return MENSAJES.archivoVacio
  if (a.size > TOPE_ARCHIVO_MB * 1048576) return MENSAJES.archivoGrande(`${TOPE_ARCHIVO_MB} MB`)
  return null
}

/** El mensaje de una subida que falló: tope de tamaño (413), validación (400) o lo que diga el servidor. */
export function mensajeDeSubida(e: unknown): string {
  const r = (e as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response
  if (r?.status === 413 && typeof r.data?.message !== 'string') return MENSAJES.archivoGrande(`${TOPE_ARCHIVO_MB} MB`)
  return mensajeDelServidor(e, MENSAJES.subidaFallo)
}

/*
 * "TRAER LIBROS": se eligen uno o varios archivos (EPUB, PDF, DOCX, DOC, TXT),
 * se dice si son libros o documentos personales y se suben de uno en uno, cada
 * uno con su barra. Al terminar aparecen en la biblioteca "preparando…".
 * Lo que ya tenías se dice ("Ya estaba en tu biblioteca"), no "Subido".
 */
const SubirLibros: React.FC<Props> = ({
  visible,
  onCerrar,
  onSubidos,
  tipoInicial = 'LIBRO',
  deseo,
  carpeta,
  soloDocumentos,
}) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [tipo, setTipo] = useState<'LIBRO' | 'DOCUMENTO'>(tipoInicial)
  const [filas, setFilas] = useState<Fila[]>([])
  const [subiendo, setSubiendo] = useState(false)

  const elegir = async () => {
    /* «Ya lo tengo» es UN archivo: el selector no ofrece elegir varios. */
    const lista = await elegirArchivos(!deseo)
    const validos = lista.filter((f) => extensionAdmitida(f.name))
    if (lista.length !== validos.length) showToast('warning', MENSAJES.formatoNoAdmitido)
    /* «Ya lo tengo» cumple el deseo con UN archivo (contrato v1.3.2): el último elegido sustituye al anterior. */
    const elegidos = deseo ? validos.slice(0, 1) : validos
    setFilas((prev) => [
      ...(deseo && elegidos.length ? [] : prev),
      ...elegidos.map((archivo, i) => {
        /* El tope se comprueba antes de subir: no se gastan 300 MB de datos para oír "no". */
        const motivo = noSeSube(archivo)
        return {
          clave: `${Date.now()}-${i}-${archivo.name}`,
          archivo,
          progreso: 0,
          estado: motivo ? ('error' as const) : ('esperando' as const),
          mensaje: motivo ?? undefined,
        }
      }),
    ])
  }

  const actualizar = (clave: string, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))

  const subir = async () => {
    setSubiendo(true)
    const subidos: EjemplarDTO[] = []
    let deseoCumplido = false
    const porSubir = filas.filter((x) => x.estado === 'esperando' || (x.estado === 'error' && !noSeSube(x.archivo)))
    for (const f of porSubir) {
      actualizar(f.clave, { estado: 'subiendo', progreso: 0, mensaje: undefined })
      const inicio = Date.now()
      try {
        const r = await librosService.subir(
          f.archivo,
          deseo ? 'LIBRO' : tipo,
          (p) => actualizar(f.clave, { progreso: p }),
          deseo && !deseoCumplido
            ? { deseoId: deseo.id }
            : carpeta && tipo === 'DOCUMENTO'
              ? { carpetaId: carpeta.id }
              : undefined,
        )
        if (!r.correct) throw new Error(r.message)
        const llegado = r.object?.[0]
        subidos.push(...(r.object ?? []))
        if (yaEstaba(llegado, inicio)) {
          const comoLibro = tipo === 'DOCUMENTO' && llegado?.tipo === 'LIBRO'
          actualizar(f.clave, {
            estado: 'repetido',
            progreso: 1,
            mensaje: comoLibro
              ? MENSAJES.yaLoTeniasComoLibro
              : /^ya ten/i.test(r.message ?? '')
                ? r.message
                : MENSAJES.yaLoTenias,
          })
        } else {
          actualizar(f.clave, { estado: 'listo', progreso: 1 })
        }
        /* Contrato v1.3.2 (BI-15): con `deseoId` el servidor convierte el deseo en este ejemplar
           (hereda nota, etiquetas, colecciones, favorito e ISBN) y BORRA el deseo. La web no borra nada. */
        if (deseo && !deseoCumplido && llegado) deseoCumplido = true
      } catch (e) {
        actualizar(f.clave, { estado: 'error', mensaje: mensajeDeSubida(e) })
      }
    }
    setSubiendo(false)
    if (subidos.length) {
      if (deseoCumplido) showToast('success', MENSAJES.deseoCumplido)
      else showToast('success', MENSAJES.subidaListo, MENSAJES.subidaPreparando)
      onSubidos(subidos)
    }
  }

  const cerrar = () => {
    if (subiendo) return
    setFilas([])
    onCerrar()
  }

  const pendientes = filas.filter(
    (f) => f.estado === 'esperando' || (f.estado === 'error' && !noSeSube(f.archivo)),
  ).length
  const terminados =
    filas.length > 0 && filas.every((f) => f.estado === 'listo' || f.estado === 'repetido' || f.estado === 'error')
      ? pendientes === 0 && filas.some((f) => f.estado !== 'error')
      : false

  return (
    <Hoja
      visible={visible}
      titulo={
        deseo
          ? 'Ya lo tengo'
          : carpeta
            ? `Subir a «${carpeta.nombre}»`
            : soloDocumentos
              ? 'Traer documentos'
              : 'Traer libros'
      }
      onCerrar={cerrar}
      testID="hoja-subir"
    >
      <AppText variant="body" color={colors.textSecondary}>
        {deseo
          ? `Elige el archivo de «${deseo.titulo}». Al subirlo, el deseo se cumple y el libro entra en tu biblioteca.`
          : soloDocumentos
            ? 'Word, PDF, Markdown, texto, HTML, RTF, ODT o PowerPoint se leen en el lector; Excel, ODS y CSV se abren en el visor de hojas. En el iPhone puedes traerlos de iCloud Drive o Google Drive.'
            : 'Elige archivos EPUB, PDF, Word (DOCX o DOC), Markdown o de texto. En el iPhone puedes traerlos de iCloud Drive o Google Drive.'}
      </AppText>
      {!deseo && !soloDocumentos ? (
        <View style={styles.tipos} accessibilityRole="radiogroup" accessibilityLabel="Qué vas a traer">
          <Chip rol="radio" etiqueta="Libros" icono="book" activo={tipo === 'LIBRO'} onPress={() => setTipo('LIBRO')} />
          <Chip
            rol="radio"
            etiqueta="Documentos personales"
            icono="archivador"
            activo={tipo === 'DOCUMENTO'}
            onPress={() => setTipo('DOCUMENTO')}
          />
        </View>
      ) : null}
      <Button
        title={filas.length ? 'Añadir más archivos' : 'Elegir archivos'}
        icono="upload"
        variant={filas.length ? 'secondary' : 'primary'}
        onPress={elegir}
        disabled={subiendo}
        testID="elegir-archivos"
      />
      <AppText variant="caption">Hasta {TOPE_ARCHIVO_MB} MB por archivo.</AppText>
      {filas.map((f) => (
        <View key={f.clave} style={[styles.fila, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.filaCabeza}>
            <Icono
              nombre={
                f.estado === 'listo' || f.estado === 'repetido' ? 'check' : f.estado === 'error' ? 'close' : 'book'
              }
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
            {f.estado === 'repetido' && `✓ ${f.mensaje ?? MENSAJES.yaLoTenias}`}
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
