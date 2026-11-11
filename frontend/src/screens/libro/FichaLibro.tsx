import React, { useCallback, useEffect, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Estrellas from '@componentes/atoms/Estrellas'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { nombreColor, nombreTipo, ordenarAnotaciones } from '@logica/anotaciones'
import {
  ESTADOS,
  autoresTexto,
  duracion,
  fechaCorta,
  fechaRelativa,
  seEstaPreparando,
  sePuedeLeer,
} from '@logica/formato'
import { idDeFrase } from '@logica/tiempos'
import type { Rutas } from '@navegacion/linking'
import { anotacionesService, comentariosService, estantesService, librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes, spacing } from '@tema'
import { luzLampara } from '@tema/madera'
import { web } from '@tema/web'
import type {
  AnotacionDTO,
  ComentarioDTO,
  EjemplarDetalleDTO,
  EstadoLectura,
  EstanteDTO,
  GuardarEjemplarDTO,
} from '@tipos'
import { confirmarAccion } from '@utils/confirmar'
import { escucharLibro } from '@utils/escuchar'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { esquemaComentario, esquemaDatosLibro, validar } from '@validaciones/index'

type Pestana = 'capitulos' | 'notas' | 'diario' | 'datos'

interface Props {
  ejemplarId: string
  /** Dentro del panel lateral del PC (sin su propio scroll de pantalla completa). */
  embebida?: boolean
  onCambio?: () => void
  onCerrar?: () => void
}

/*
 * LA FICHA DEL LIBRO (plan §8.3): portada grande con su luz, los datos, el
 * estado, las estrellas, el favorito, el avance, y "Leer" / "Escuchar".
 * Debajo, el índice con minutos, las notas y resaltados, el diario de lectura
 * y los datos para corregir a mano.
 */
const FichaLibro: React.FC<Props> = ({ ejemplarId, embebida, onCambio, onCerrar }) => {
  const { colors, isDark } = useTheme()
  const { prefs } = usePreferencias()
  const { showToast } = useToast()
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const { width } = useWindowDimensions()
  const [libro, setLibro] = useState<EjemplarDetalleDTO | null>(null)
  const [pestana, setPestana] = useState<Pestana>('capitulos')

  const tarea = useCallback(async () => {
    setLibro(exigir(await librosService.detalle(ejemplarId)) ?? null)
  }, [ejemplarId])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  /* Mientras el taller lo prepara, se vuelve a preguntar. */
  useEffect(() => {
    if (!libro || !seEstaPreparando(libro)) return
    const t = setTimeout(cargar, 4000)
    return () => clearTimeout(t)
  }, [libro, cargar])

  const guardar = async (cambio: Omit<GuardarEjemplarDTO, 'id'>, aviso?: string) => {
    if (!libro) return
    const antes = libro
    setLibro({ ...libro, ...cambio } as EjemplarDetalleDTO)
    try {
      const r = await librosService.guardar({ id: libro.id, ...cambio })
      if (!r.correct) throw new Error(r.message)
      setLibro((l) => (l ? { ...l, ...r.object } : l))
      if (aviso) showToast('success', aviso)
      onCambio?.()
    } catch (e) {
      setLibro(antes)
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  }

  if (cargando && !libro) return <Spinner fullScreen />
  if (error && !libro) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!libro) return null

  const ancho = embebida ? 380 : width
  const portadaAncha = ancho >= 720
  const anchoPortada = portadaAncha ? 220 : Math.min(200, ancho * 0.52)
  const legible = sePuedeLeer(libro)
  const leer = (frase?: string) => navigation.navigate('Leer', { id: libro.id, ...(frase ? { frase } : {}) })
  const escuchar = (desdeFrase?: string) => {
    escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad, desdeFrase: desdeFrase ?? null })
    navigation.navigate('Escuchar', { id: libro.id })
  }

  const motivoNoLegible =
    libro.tipo === 'DESEO'
      ? 'Es un deseo: cuando tengas el archivo, tráelo a la biblioteca.'
      : seEstaPreparando(libro)
        ? MENSAJES.preparandoLibro
        : libro.estadoConversion === 'ERROR'
          ? MENSAJES.conversionFallo
          : null

  const Contenido = (
    <View style={[styles.contenido, embebida && styles.contenidoEmbebido]}>
      <View style={[styles.cabecera, portadaAncha && styles.cabeceraAncha]}>
        <View style={[styles.marcoPortada, web({ backgroundImage: luzLampara(isDark) })]}>
          <Portada libro={libro} ancho={anchoPortada} />
        </View>
        <View style={[styles.datos, portadaAncha && styles.datosAncha]}>
          <AppText variant="display" align={portadaAncha ? 'left' : 'center'} style={styles.titulo}>
            {libro.titulo}
          </AppText>
          {libro.subtitulo ? (
            <AppText variant="subtitle" align={portadaAncha ? 'left' : 'center'} color={colors.textSecondary}>
              {libro.subtitulo}
            </AppText>
          ) : null}
          <Text style={[styles.autores, { color: colors.primary, textAlign: portadaAncha ? 'left' : 'center' }]}>
            {autoresTexto(libro.autores)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary, textAlign: portadaAncha ? 'left' : 'center' }]}>
            {[
              libro.anio,
              libro.editorial,
              libro.formatoOriginal,
              libro.minutosEstimados ? `${duracion(libro.minutosEstimados)} de voz` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={[styles.fila, !portadaAncha && styles.centrado]}>
            <BotonIcono
              icono="heart"
              etiqueta={libro.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              activo={libro.favorito}
              color={libro.favorito ? colors.danger : colors.text}
              onPress={() =>
                guardar(
                  { favorito: !libro.favorito },
                  libro.favorito ? MENSAJES.favoritoQuitado : MENSAJES.favoritoPuesto,
                )
              }
              testID="favorito"
            />
            <Estrellas valor={libro.calificacion} onCambiar={(v) => guardar({ calificacion: v })} />
          </View>
          {libro.tipo === 'LIBRO' ? (
            <View style={[styles.estados, !portadaAncha && styles.centrado]} accessibilityLabel="Estado de lectura">
              {ESTADOS.map((e) => (
                <Chip
                  key={e.clave}
                  etiqueta={e.nombre}
                  activo={libro.estado === e.clave}
                  onPress={() => guardar({ estado: e.clave as EstadoLectura })}
                />
              ))}
            </View>
          ) : null}
          {libro.porcentaje > 0 ? (
            <View style={styles.avance}>
              <Barra porcentaje={libro.porcentaje} alto={6} etiqueta="Tu avance" />
              <Text style={[styles.avanceTexto, { color: colors.textSecondary }]}>
                Vas por el {Math.round(libro.porcentaje)} %
                {libro.ultimaApertura ? ` · abierto ${fechaRelativa(libro.ultimaApertura)}` : ''}
              </Text>
            </View>
          ) : null}
          <View style={styles.botones}>
            <Button
              title={libro.porcentaje > 0 ? 'Seguir leyendo' : 'Leer'}
              icono="libroAbierto"
              onPress={() => leer()}
              disabled={!legible}
              size="large"
              style={styles.flex}
              testID="boton-leer"
            />
            <Button
              title="Escuchar"
              icono="auriculares"
              variant="secondary"
              onPress={() => escuchar()}
              disabled={!legible}
              size="large"
              style={styles.flex}
              testID="boton-escuchar"
            />
          </View>
          {motivoNoLegible ? <Text style={[styles.aviso, { color: colors.warning }]}>⏳ {motivoNoLegible}</Text> : null}
        </View>
      </View>

      {libro.sinopsis ? <Text style={[styles.sinopsis, { color: colors.text }]}>{libro.sinopsis}</Text> : null}
      {libro.generos.length || libro.etiquetas.length ? (
        <View style={styles.estados}>
          {libro.generos.map((g) => (
            <View key={g} style={[styles.etiqueta, { borderColor: colors.border }]}>
              <Text style={[styles.etiquetaTexto, { color: colors.textSecondary }]}>{g}</Text>
            </View>
          ))}
          {libro.etiquetas.map((g) => (
            <View key={g} style={[styles.etiqueta, { borderColor: colors.border }]}>
              <Text style={[styles.etiquetaTexto, { color: colors.textSecondary }]}>#{g}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.pestanas, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
        {(
          [
            ['capitulos', 'Índice'],
            ['notas', `Notas${libro.nNotas ? ` (${libro.nNotas})` : ''}`],
            ['diario', 'Diario'],
            ['datos', 'Datos'],
          ] as [Pestana, string][]
        ).map(([k, n]) => (
          <Pressable
            key={k}
            onPress={() => setPestana(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: pestana === k }}
            accessibilityLabel={n}
            style={[styles.pestana, pestana === k && { borderBottomColor: colors.primary }]}
          >
            <Text style={[styles.pestanaTexto, { color: pestana === k ? colors.primary : colors.textSecondary }]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      {pestana === 'capitulos' ? (
        <View>
          {libro.capitulos.length === 0 ? (
            <AppText variant="caption">El índice aparece cuando el libro está preparado.</AppText>
          ) : null}
          {libro.capitulos.map((c) => {
            const actual = libro.progreso?.capitulo === c.indice
            return (
              <View key={c.indice} style={[styles.capitulo, { borderBottomColor: colors.border }]}>
                <Pressable
                  style={styles.capituloTexto}
                  onPress={() => legible && leer(idDeFrase(c.indice, 0))}
                  accessibilityRole="button"
                  accessibilityLabel={`Leer el capítulo ${c.indice + 1}: ${c.titulo}${actual ? ', vas por aquí' : ''}`}
                >
                  <Text style={[styles.capNum, { color: colors.primaryLight }]}>
                    {String(c.indice + 1).padStart(2, '0')}
                  </Text>
                  <Text style={[styles.capTitulo, { color: colors.text }]} numberOfLines={2}>
                    {c.titulo}
                    {actual ? '  ◂ vas aquí' : ''}
                  </Text>
                  <Text style={[styles.capMin, { color: colors.textMuted }]}>{duracion(c.minutos)}</Text>
                </Pressable>
                <BotonIcono
                  icono="play"
                  etiqueta={`Escuchar el capítulo ${c.indice + 1}`}
                  onPress={() => legible && escuchar(idDeFrase(c.indice, 0))}
                />
              </View>
            )
          })}
        </View>
      ) : null}
      {pestana === 'notas' ? (
        <NotasDelLibro
          ejemplarId={libro.id}
          onIr={(a) =>
            navigation.navigate('Leer', {
              id: libro.id,
              ...(a.fraseInicio ? { frase: a.fraseInicio } : {}),
              ...(a.cfi ? { cfi: a.cfi } : {}),
            })
          }
        />
      ) : null}
      {pestana === 'diario' ? <Diario ejemplarId={libro.id} /> : null}
      {pestana === 'datos' ? (
        <DatosLibro
          libro={libro}
          onGuardar={(c) => guardar(c, MENSAJES.guardado)}
          onBorrar={() =>
            confirmarAccion({
              titulo: 'Retirar de la biblioteca',
              mensaje: `«${libro.titulo}» saldrá de tu biblioteca. Tus notas se conservan en el servidor.`,
              textoConfirmar: 'Sí, retirar',
              onConfirmar: async () => {
                try {
                  const r = await librosService.borrar(libro.id)
                  if (!r.correct) throw new Error(r.message)
                  showToast('success', MENSAJES.libroBorrado)
                  onCambio?.()
                  if (onCerrar) onCerrar()
                  else navigation.navigate('Biblioteca')
                } catch (e) {
                  showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
                }
              },
            })
          }
        />
      ) : null}
    </View>
  )

  if (embebida) return Contenido
  return <ScrollView contentContainerStyle={styles.scroll}>{Contenido}</ScrollView>
}

/** Notas y resaltados del libro, en orden de lectura. */
const NotasDelLibro: React.FC<{ ejemplarId: string; onIr: (a: AnotacionDTO) => void }> = ({ ejemplarId, onIr }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [lista, setLista] = useState<AnotacionDTO[]>([])
  const tarea = useCallback(
    async () => setLista(ordenarAnotaciones(exigir(await anotacionesService.todas(ejemplarId)) ?? [])),
    [ejemplarId],
  )
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])
  if (cargando) return <Spinner />
  if (error) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!lista.length)
    return <AppText variant="caption">Aún no hay notas. Selecciona texto en el lector para resaltar o anotar.</AppText>
  return (
    <View style={styles.lista}>
      {lista.map((a) => (
        <View
          key={a.id}
          style={[styles.nota, { borderLeftColor: a.color ?? colors.primary, backgroundColor: colors.card }]}
        >
          <Pressable
            onPress={() => onIr(a)}
            accessibilityRole="button"
            accessibilityLabel={`${nombreTipo(a)} en ${nombreColor(a.color)}: ${a.textoCitado ?? ''}. Ir al texto`}
            style={styles.tocable}
          >
            <Text style={[styles.notaTipo, { color: colors.textSecondary }]}>
              {nombreTipo(a)} · {nombreColor(a.color)} · cap. {(a.capitulo ?? 0) + 1}
            </Text>
            {a.textoCitado ? <Text style={[styles.cita, { color: colors.text }]}>«{a.textoCitado}»</Text> : null}
            {a.nota ? <Text style={[styles.notaTexto, { color: colors.primary }]}>✎ {a.nota}</Text> : null}
          </Pressable>
          <BotonIcono
            icono="trash"
            etiqueta="Borrar esta nota"
            onPress={() =>
              confirmarAccion({
                titulo: 'Borrar nota',
                mensaje: '¿Seguro?',
                textoConfirmar: 'Sí, borrar',
                onConfirmar: async () => {
                  const r = await anotacionesService.borrar(a.id as string)
                  if (r.correct) {
                    setLista((l) => l.filter((x) => x.id !== a.id))
                    showToast('success', MENSAJES.borrado)
                  }
                },
              })
            }
          />
        </View>
      ))}
    </View>
  )
}

/** El diario de lectura: "lo empecé en el bus…". */
const Diario: React.FC<{ ejemplarId: string }> = ({ ejemplarId }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [lista, setLista] = useState<ComentarioDTO[]>([])
  const [texto, setTexto] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const tarea = useCallback(
    async () => setLista(exigir(await comentariosService.todos(ejemplarId)) ?? []),
    [ejemplarId],
  )
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])
  const guardar = async () => {
    const v = validar(esquemaComentario, { texto })
    setErr(v.errores.texto)
    if (!v.ok) return
    try {
      const r = await comentariosService.guardar({ ejemplarId, texto: v.datos.texto })
      if (!r.correct) throw new Error(r.message)
      setLista((l) => [r.object, ...l])
      setTexto('')
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  }
  return (
    <View style={styles.lista}>
      <Input
        label="Escribe en tu diario"
        value={texto}
        onChangeText={setTexto}
        multiline
        placeholder="Dónde lo leíste, qué sentiste…"
        error={err}
      />
      <Button title="Anotar en el diario" icono="lapiz" onPress={guardar} variant="secondary" />
      {cargando ? <Spinner /> : null}
      {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}
      {lista.map((c) => (
        <View key={c.id} style={[styles.entrada, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.entradaFecha, { color: colors.textMuted }]}>{fechaCorta(c.creado)}</Text>
          <Text style={[styles.entradaTexto, { color: colors.text }]}>{c.texto}</Text>
          <BotonIcono
            icono="trash"
            etiqueta="Borrar esta entrada del diario"
            onPress={async () => {
              const r = await comentariosService.borrar(c.id as string)
              if (r.correct) setLista((l) => l.filter((x) => x.id !== c.id))
            }}
          />
        </View>
      ))}
    </View>
  )
}

type CamposDatos = {
  titulo: string
  autores: string
  anio: string
  editorial: string
  sinopsis: string
  generos: string
  etiquetas: string
}

/** Corregir los datos a mano (y elegir colecciones). */
const DatosLibro: React.FC<{
  libro: EjemplarDetalleDTO
  onGuardar: (c: Omit<GuardarEjemplarDTO, 'id'>) => void
  onBorrar: () => void
}> = ({ libro, onGuardar, onBorrar }) => {
  const { colors } = useTheme()
  const [f, setF] = useState<CamposDatos>({
    titulo: libro.titulo,
    autores: libro.autores.join(', '),
    anio: libro.anio ? String(libro.anio) : '',
    editorial: libro.editorial ?? '',
    sinopsis: libro.sinopsis ?? '',
    generos: libro.generos.join(', '),
    etiquetas: libro.etiquetas.join(', '),
  })
  const [errores, setErrores] = useState<Partial<Record<keyof CamposDatos, string>>>({})
  const [estantes, setEstantes] = useState<{ e: EstanteDTO; tiene: boolean }[]>([])
  const campo = (k: keyof CamposDatos) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await estantesService.todos()
        const colecciones = (r.object ?? []).filter((e) => e.tipo === 'COLECCION')
        const con = await Promise.all(
          colecciones.map(async (e) => ({
            e,
            tiene: ((await estantesService.libros(e.id)).object ?? []).some((l) => l.id === libro.id),
          })),
        )
        if (vivo) setEstantes(con)
      } catch (e) {
        console.warn('[ficha] colecciones', e)
      }
    })()
    return () => {
      vivo = false
    }
  }, [libro.id])

  const enviar = () => {
    const v = validar(esquemaDatosLibro, f)
    setErrores(v.errores)
    if (v.ok) onGuardar(v.datos)
  }

  return (
    <View style={styles.lista}>
      <AppText variant="caption">Origen de los datos: {libro.fuenteMetadatos.replace('_', ' ').toLowerCase()}</AppText>
      <Input label="Título" value={f.titulo} onChangeText={campo('titulo')} error={errores.titulo} />
      <Input
        label="Autores (separados por coma)"
        value={f.autores}
        onChangeText={campo('autores')}
        error={errores.autores}
      />
      <Input label="Año" value={f.anio} onChangeText={campo('anio')} keyboardType="number-pad" error={errores.anio} />
      <Input label="Editorial" value={f.editorial} onChangeText={campo('editorial')} error={errores.editorial} />
      <Input label="Sinopsis" value={f.sinopsis} onChangeText={campo('sinopsis')} multiline error={errores.sinopsis} />
      <Input
        label="Géneros (separados por coma)"
        value={f.generos}
        onChangeText={campo('generos')}
        error={errores.generos}
      />
      <Input
        label="Etiquetas (separadas por coma)"
        value={f.etiquetas}
        onChangeText={campo('etiquetas')}
        error={errores.etiquetas}
      />
      <Button title="Guardar datos" onPress={enviar} testID="guardar-datos" />
      {estantes.length ? (
        <View style={styles.lista}>
          <AppText variant="label">Colecciones</AppText>
          <View style={styles.estados}>
            {estantes.map(({ e, tiene }) => (
              <Chip
                key={e.id}
                etiqueta={e.nombre}
                activo={tiene}
                onPress={async () => {
                  const r = tiene
                    ? await estantesService.quitar(e.id, libro.id)
                    : await estantesService.agregar(e.id, libro.id)
                  if (r.correct) setEstantes((l) => l.map((x) => (x.e.id === e.id ? { ...x, tiene: !tiene } : x)))
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={[styles.peligro, { borderColor: colors.border }]}>
        <Button title="Retirar de la biblioteca" variant="outline" icono="trash" onPress={onBorrar} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tocable: { flex: 1, minHeight: 44 },
  scroll: { paddingBottom: 120 },
  contenido: { padding: spacing.md, gap: spacing.md, maxWidth: 980, width: '100%', alignSelf: 'center' },
  contenidoEmbebido: { padding: spacing.md },
  cabecera: { alignItems: 'center', gap: spacing.md },
  cabeceraAncha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  marcoPortada: { padding: 24, alignItems: 'center', borderRadius: 999 },
  datos: { alignItems: 'stretch', gap: 8, width: '100%' },
  datosAncha: { flex: 1, paddingTop: 12 },
  titulo: { lineHeight: 48 },
  autores: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.xl },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centrado: { justifyContent: 'center' },
  estados: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avance: { gap: 6, marginTop: 4 },
  avanceTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  botones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  aviso: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  sinopsis: { fontFamily: fuentes.lectura, fontSize: fontSize.md, lineHeight: 28 },
  etiqueta: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  etiquetaTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  pestanas: { flexDirection: 'row', borderBottomWidth: 1, marginTop: spacing.sm },
  pestana: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  pestanaTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
  capitulo: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  capituloTexto: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  capNum: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, width: 30 },
  capTitulo: { flex: 1, fontFamily: fuentes.titulo, fontSize: fontSize.md },
  capMin: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  lista: { gap: 10 },
  nota: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderRadius: 6, padding: 10, gap: 6 },
  notaTipo: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  cita: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 22, marginTop: 4 },
  notaTexto: { fontFamily: fuentes.ui, fontSize: fontSize.sm, marginTop: 4 },
  entrada: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  entradaFecha: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  entradaTexto: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 22 },
  peligro: { borderTopWidth: 1, paddingTop: spacing.md, marginTop: spacing.md },
})

export default FichaLibro
