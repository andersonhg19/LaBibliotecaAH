import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Esqueleto from '@componentes/atoms/Esqueleto'
import Estrellas from '@componentes/atoms/Estrellas'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import LamparaCasa from '@componentes/molecules/LamparaCasa'
import PrepararLibro from '@componentes/molecules/PrepararLibro'
import { elevarAvisos } from '@componentes/organisms/ToastContainer'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { useAccionUnica } from '@hooks/useAccionUnica'
import { exigir, useCarga } from '@hooks/useCarga'
import { nombreColor, nombreTipo, ordenarAnotaciones } from '@logica/anotaciones'
import { esHojaDeCalculo } from '@logica/documentos'
import {
  ESTADOS,
  autoresTexto,
  duracion,
  fechaCorta,
  fechaRelativa,
  seAplico,
  seEstaPreparando,
  sePuedeLeer,
} from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import IndiceLibro from '@pantallas/libro/IndiceLibro'
import { anotacionesService, comentariosService, estantesService, librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes, spacing } from '@tema'
import { luzLampara } from '@tema/madera'
import { placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import type {
  AnotacionDTO,
  ComentarioDTO,
  EjemplarDTO,
  EjemplarDetalleDTO,
  EstadoLectura,
  EstanteDTO,
  FuenteMetadatos,
  GuardarEjemplarDTO,
} from '@tipos'
import { estadoElegible } from '@utils/aria'
import { celebrarFin } from '@utils/confeti'
import { confirmarAccion } from '@utils/confirmar'
import { escucharLibro } from '@utils/escuchar'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'
import { hayVueloPara, volarPortada } from '@utils/vuelo'
import { esquemaComentario, esquemaDatosLibro, validar } from '@validaciones/index'

type Pestana = 'capitulos' | 'notas' | 'diario' | 'datos'

/** UX5-02: por debajo de este ancho, «Seguir leyendo / Escuchar» van en una barra fija abajo. */
export const ANCHO_BARRA_ACCIONES = 720
/** Por debajo de este alto (teléfono en horizontal) también va la barra fija. */
export const ALTO_MINIMO_SIN_BARRA = 500
/** Alto de esa barra (sin la zona segura). */
const ALTO_BARRA_ACCIONES = 76

interface Props {
  ejemplarId: string
  /** Dentro del panel lateral del PC (sin su propio scroll de pantalla completa). */
  embebida?: boolean
  onCambio?: () => void
  onCerrar?: () => void
}

/** El tamaño del título según lo largo que sea (UX-10): un título de 200 letras no puede ocupar la pantalla. */
export const tamanoTitulo = (titulo: string): number =>
  titulo.length > 140 ? 24 : titulo.length > 80 ? 28 : titulo.length > 40 ? 34 : fontSize.title

/** Dónde buscar un deseo: Google Libros por ISBN, o por título y autor. */
export const urlDondeConseguirlo = (l: Pick<EjemplarDTO, 'isbn' | 'titulo' | 'autores'>): string => {
  const q = l.isbn ? `isbn:${l.isbn.replace(/[^0-9Xx]/g, '')}` : [l.titulo, ...(l.autores ?? [])].join(' ')
  return `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(q)}`
}

/** De dónde salieron los datos, dicho como lo diría un bibliotecario (UX-29). */
const ORIGEN: Record<FuenteMetadatos, string> = {
  NOMBRE_ARCHIVO: 'Estos datos salen del nombre del archivo: corrígelos si hace falta.',
  ARCHIVO: 'Estos datos vienen dentro del propio archivo.',
  MANUAL: 'Estos datos los corregiste a mano.',
  OPEN_LIBRARY: 'Estos datos vienen de Open Library.',
  IA: 'Estos datos los sugirió el bibliotecario: revísalos.',
}

/*
 * LA FICHA DEL LIBRO (plan §8.3): portada grande con su luz, los datos, el
 * estado, las estrellas, el favorito, el avance, y "Leer" / "Escuchar".
 * Debajo, el índice con minutos, las notas y resaltados, el diario de lectura
 * y los datos para corregir a mano. Un deseo dice su nota y su ISBN, dónde
 * conseguirlo y "Ya lo tengo".
 */
const FichaLibro: React.FC<Props> = ({ ejemplarId, embebida, onCambio, onCerrar }) => {
  const { colors, isDark } = useTheme()
  const { prefs } = usePreferencias()
  const { showToast } = useToast()
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const { width, height } = useWindowDimensions()
  const [libro, setLibro] = useState<EjemplarDetalleDTO | null>(null)
  const [pestana, setPestana] = useState<Pestana>('capitulos')
  const [guardando, setGuardando] = useState(false)
  const [tituloEntero, setTituloEntero] = useState(false)
  const [yaLoTengo, setYaLoTengo] = useState(false)
  const enCurso = useRef(false)
  /* F2: la tapa vuela desde la portada que se tocó (sin la llegada de siempre). */
  const refTapa = useRef<View>(null)
  const [vuela] = useState(() => hayVueloPara(ejemplarId))
  /* También con el teléfono en horizontal (poco alto): ahí los botones quedaban bajo el pliegue. */
  const conBarra = !embebida && (width < ANCHO_BARRA_ACCIONES || height < ALTO_MINIMO_SIN_BARRA)

  const tarea = useCallback(async () => {
    setLibro(exigir(await librosService.detalle(ejemplarId)) ?? null)
  }, [ejemplarId])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (libro && vuela) volarPortada(libro.id, refTapa.current)
    // Solo al llegar el libro por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro?.id])

  /* UX5-13: con la barra de acciones abajo, los avisos suben por encima. */
  useEffect(() => (conBarra ? elevarAvisos(ALTO_BARRA_ACCIONES + 8) : undefined), [conBarra])

  /* Mientras el taller lo prepara, se vuelve a preguntar. */
  useEffect(() => {
    if (!libro || !seEstaPreparando(libro)) return
    const t = setTimeout(cargar, 4000)
    return () => clearTimeout(t)
  }, [libro, cargar])

  /*
   * Guardar un cambio. Un cambio a la vez (BI-09: los toques repetidos en ♥
   * daban error), y solo se dice "Guardado" si el servidor lo aplicó de verdad
   * (BI-07/08: quitar la calificación o vaciar el año se ignoraban y la app
   * decía "Guardado"). Con el contrato v1.2 el null explícito vacía el campo.
   */
  const guardar = async (cambio: Omit<GuardarEjemplarDTO, 'id'>, aviso?: string) => {
    if (!libro || enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    const antes = libro
    setLibro({ ...libro, ...cambio } as EjemplarDetalleDTO)
    try {
      const r = await librosService.guardar({ id: libro.id, ...cambio })
      if (!r.correct) throw Object.assign(new Error(r.message), { codigo: r.errorCode })
      setLibro((l) => (l ? { ...l, ...r.object } : l))
      if (!seAplico(cambio, r.object)) showToast('warning', MENSAJES.noSeAplico)
      else if (cambio.estado === 'LEIDO' && antes.estado !== 'LEIDO') terminado(antes)
      else if (aviso) showToast('success', aviso)
      onCambio?.()
    } catch (e) {
      setLibro(antes)
      /* 101 conflictoConcurrente (v1.2): otro cambio llegó a la vez; se recarga lo que quedó. */
      if ((e as { codigo?: number }).codigo === 101) {
        showToast('warning', MENSAJES.conflicto)
        cargar()
      } else showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  /* F5: terminar un libro se celebra una vez (confeti de papel; con reducir movimiento, solo la placa). */
  const terminado = (l: EjemplarDetalleDTO) => {
    celebrarFin(l.id, refTapa.current)
      .then((r) => {
        if (r.primera)
          showToast('success', '¡Libro terminado!', `«${l.titulo}», ${fechaCorta(new Date().toISOString())}.`)
      })
      .catch(() => {})
  }

  if (cargando && !libro) return <Esqueleto variante="ficha" ancho={embebida ? 380 : width} />
  if (error && !libro) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!libro) return null

  const ancho = embebida ? 380 : width
  const portadaAncha = ancho >= 720
  const anchoPortada = portadaAncha ? 220 : Math.min(200, ancho * 0.52)
  const legible = sePuedeLeer(libro)
  /* v1.6: una hoja de cálculo no se lee ni se escucha: se abre en el visor de hojas. */
  const esHoja = esHojaDeCalculo(libro.formatoOriginal)
  const esDeseo = libro.tipo === 'DESEO'
  const leer = (frase?: string) => navigation.navigate('Leer', { id: libro.id, ...(frase ? { frase } : {}) })
  const escuchar = (desdeFrase?: string) => {
    escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad, desdeFrase: desdeFrase ?? null })
    navigation.navigate('Escuchar', { id: libro.id })
  }
  const alinear = portadaAncha ? 'left' : 'center'
  const tam = tamanoTitulo(libro.titulo)
  const tituloLargo = libro.titulo.length > 90

  const motivoNoLegible = esDeseo
    ? 'Es un deseo: cuando tengas el archivo, tráelo con «Ya lo tengo».'
    : seEstaPreparando(libro)
      ? MENSAJES.preparandoLibro
      : libro.estadoConversion === 'ERROR'
        ? MENSAJES.conversionFallo
        : null

  const Contenido = (
    <View style={[styles.contenido, embebida && styles.contenidoEmbebido]}>
      <View style={[styles.cabecera, portadaAncha && styles.cabeceraAncha]}>
        <View
          style={[
            styles.marcoPortada,
            web({
              backgroundImage: luzLampara(isDark),
              ...(vuela ? {} : { animationName: 'bah-llega', animationDuration: '420ms', animationFillMode: 'both' }),
            }),
          ]}
        >
          <View ref={refTapa}>
            <Portada libro={libro} ancho={anchoPortada} />
          </View>
        </View>
        <View style={[styles.datos, portadaAncha && styles.datosAncha]}>
          <AppText
            variant="display"
            nivel={2}
            align={alinear}
            style={[styles.titulo, { fontSize: tam, lineHeight: Math.round(tam * 1.12) }]}
            numberOfLines={tituloEntero ? undefined : 4}
          >
            {libro.titulo}
          </AppText>
          {tituloLargo ? (
            <Pressable
              onPress={() => setTituloEntero((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={tituloEntero ? 'Ver el título recogido' : 'Ver el título completo'}
              style={[styles.verTitulo, !portadaAncha && styles.centrado]}
            >
              <Text style={[styles.verTituloTexto, { color: colors.primary }]}>
                {tituloEntero ? 'Recoger el título' : 'Ver el título completo'}
              </Text>
            </Pressable>
          ) : null}
          {libro.subtitulo ? (
            <AppText variant="subtitle" align={alinear} color={colors.textSecondary} numberOfLines={3}>
              {libro.subtitulo}
            </AppText>
          ) : null}
          <Text
            style={[styles.autores, { color: colors.primary, textAlign: alinear }]}
            numberOfLines={tituloEntero ? undefined : 3}
          >
            {autoresTexto(libro.autores)}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary, textAlign: alinear }]}>
            {[
              libro.anio,
              libro.editorial,
              libro.formatoOriginal,
              libro.isbn ? `ISBN ${libro.isbn}` : null,
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
              disabled={guardando}
              color={libro.favorito ? colors.danger : colors.text}
              onPress={() =>
                guardar(
                  { favorito: !libro.favorito },
                  libro.favorito ? MENSAJES.favoritoQuitado : MENSAJES.favoritoPuesto,
                )
              }
              testID="favorito"
            />
            <Estrellas
              valor={libro.calificacion}
              disabled={guardando}
              onCambiar={(v) => guardar({ calificacion: v }, v === null ? MENSAJES.calificacionQuitada : undefined)}
            />
          </View>
          {libro.tipo === 'LIBRO' ? (
            <View
              style={[styles.segmentado, { borderColor: colors.border, backgroundColor: colors.card }]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Estado de lectura"
            >
              {ESTADOS.map((e) => {
                const activo = libro.estado === e.clave
                return (
                  <Pressable
                    key={e.clave}
                    onPress={() => !activo && guardar({ estado: e.clave as EstadoLectura })}
                    disabled={guardando}
                    {...estadoElegible('radio', activo, guardando)}
                    accessibilityLabel={e.nombre}
                    testID={`estado-${e.clave}`}
                    style={[
                      styles.segmento,
                      activo && { borderColor: colors.primaryLight },
                      activo && web(placaActiva(isDark)),
                      web({ cursor: 'pointer' }),
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.segmentoTexto,
                        { color: activo ? colors.text : colors.textSecondary },
                        activo && styles.segmentoActivo,
                      ]}
                    >
                      {e.nombre}
                    </Text>
                  </Pressable>
                )
              })}
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
          {esDeseo ? (
            <View style={styles.deseo}>
              {libro.nota ? (
                <View style={[styles.notaDeseo, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.notaDeseoRotulo, { color: colors.textMuted }]}>Tu nota</Text>
                  <Text style={[styles.notaDeseoTexto, { color: colors.text }]}>{libro.nota}</Text>
                </View>
              ) : null}
              <View style={styles.botones}>
                <Button
                  title="Ya lo tengo"
                  icono="upload"
                  onPress={() => setYaLoTengo(true)}
                  style={styles.flex}
                  testID="ya-lo-tengo"
                />
                <Button
                  title="Dónde conseguirlo"
                  icono="search"
                  variant="secondary"
                  onPress={() => {
                    Linking.openURL(urlDondeConseguirlo(libro)).catch((e) =>
                      console.warn('[ficha] no se pudo abrir la búsqueda', e),
                    )
                  }}
                  style={styles.flex}
                  testID="donde-conseguirlo"
                />
              </View>
            </View>
          ) : null}
          {/* Un deseo no se lee ni se escucha todavía: sus botones son «Ya lo tengo» y «Dónde conseguirlo» (QA RW-07). */}
          {esHoja ? (
            <View style={styles.botones}>
              <Button
                title="Abrir hoja"
                icono="rejilla"
                onPress={() => navigation.navigate('Hoja', { id: libro.id })}
                disabled={!legible}
                size="large"
                style={styles.flex}
                testID="boton-abrir-hoja"
              />
            </View>
          ) : null}
          {!esDeseo && !esHoja && !conBarra ? (
            <View style={styles.botones}>
              <Button
                title={libro.porcentaje > 0 ? 'Seguir' : 'Leer'}
                accessibilityLabel={libro.porcentaje > 0 ? 'Seguir leyendo' : 'Leer'}
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
          ) : null}
          {motivoNoLegible && !esDeseo ? (
            <Text style={[styles.aviso, { color: colors.warning }]}>⏳ {motivoNoLegible}</Text>
          ) : null}
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
            ['capitulos', esHoja ? 'Hojas' : 'Índice'],
            ['notas', `Notas${libro.nNotas ? ` (${libro.nNotas})` : ''}`],
            ['diario', 'Diario'],
            ['datos', 'Datos'],
          ] as [Pestana, string][]
        ).map(([k, n]) => (
          <Pressable
            key={k}
            onPress={() => setPestana(k)}
            {...estadoElegible('tab', pestana === k)}
            accessibilityLabel={n}
            testID={`ficha-pestana-${k}`}
            style={[styles.pestana, pestana === k && { borderBottomColor: colors.primary }, web({ cursor: 'pointer' })]}
          >
            <Text style={[styles.pestanaTexto, { color: pestana === k ? colors.primary : colors.textSecondary }]}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      {pestana === 'capitulos' ? (
        <View style={styles.lista}>
          {libro.capitulos.length === 0 ? (
            <AppText variant="caption">
              {esDeseo ? 'Un deseo aún no tiene índice.' : 'El índice aparece cuando el libro está preparado.'}
            </AppText>
          ) : null}
          {esHoja
            ? libro.capitulos.map((c) => (
                <View key={c.indice} style={[styles.capitulo, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.capTitulo, { color: colors.text }]} numberOfLines={2}>
                    {c.titulo}
                  </Text>
                </View>
              ))
            : null}
          {!esHoja && !esDeseo && legible && libro.capitulos.some((c) => typeof c.enVoz === 'boolean') ? (
            <View style={styles.lista}>
              <PrepararLibro ejemplarId={libro.id} vozId={prefs.vozId} />
              <LamparaCasa />
            </View>
          ) : null}
          {!esHoja && libro.capitulos.length ? (
            <IndiceLibro
              libro={libro}
              legible={legible}
              onLeer={(f) => leer(f)}
              onEscuchar={(f) => escuchar(f)}
              onCapitulos={(capitulos) => setLibro((l) => (l ? { ...l, capitulos } : l))}
              onRecargar={cargar}
            />
          ) : null}
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
          guardando={guardando}
          onGuardar={(c) => guardar(c, MENSAJES.guardado)}
          onBorrar={() =>
            confirmarAccion({
              titulo: 'Retirar de la biblioteca',
              mensaje: MENSAJES.retirarAviso(libro.titulo),
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
      {esDeseo ? (
        <SubirLibros
          visible={yaLoTengo}
          deseo={libro}
          onCerrar={() => setYaLoTengo(false)}
          onSubidos={(nuevos) => {
            onCambio?.()
            const nuevo = nuevos[0]
            setYaLoTengo(false)
            if (!nuevo || nuevo.id === libro.id) cargar()
            else if (onCerrar) onCerrar()
            else navigation.navigate('Libro', { id: nuevo.id })
          }}
        />
      ) : null}
    </View>
  )

  if (embebida) return Contenido
  const barra =
    conBarra && !esDeseo && !esHoja ? (
      <View
        style={[
          styles.barraAcciones,
          { backgroundColor: colors.surface, borderTopColor: colors.primaryLight },
          web({
            position: 'fixed',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
            boxShadow: '0 -6px 18px rgba(0,0,0,0.28)',
          }),
        ]}
        testID="barra-acciones-ficha"
      >
        <Button
          title={libro.porcentaje > 0 ? 'Seguir leyendo' : 'Leer'}
          accessibilityLabel={libro.porcentaje > 0 ? 'Seguir leyendo' : 'Leer'}
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
    ) : null
  return (
    <View style={styles.flex}>
      {/* Z5 (validación web r2): en el iPhone (390×844) las pestañas quedaban DEBAJO de la barra fija y un toque en
          ellas abría el lector («Seguir leyendo»). Con scroll-padding, lo que recibe el foco o se lleva a la vista
          (teclado, VoiceOver, scrollIntoView) se coloca por encima de la barra. */}
      <ScrollView
        style={barra ? web({ scrollPaddingBottom: ALTO_BARRA_ACCIONES + 24 }) : undefined}
        contentContainerStyle={[styles.scroll, barra ? styles.scrollConBarra : null]}
        testID="ficha-scroll"
      >
        {Contenido}
      </ScrollView>
      {barra}
    </View>
  )
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

/** El diario, de lo más nuevo a lo más viejo: el mismo orden al escribir y al recargar (BI-11). */
export const ordenarDiario = (l: ComentarioDTO[]) =>
  [...l].sort((a, b) => (b.creado ?? '').localeCompare(a.creado ?? ''))

/** El diario de lectura: "lo empecé en el bus…". */
const Diario: React.FC<{ ejemplarId: string }> = ({ ejemplarId }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [lista, setLista] = useState<ComentarioDTO[]>([])
  const [texto, setTexto] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const tarea = useCallback(
    async () => setLista(ordenarDiario(exigir(await comentariosService.todos(ejemplarId)) ?? [])),
    [ejemplarId],
  )
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])
  /* Un doble clic no escribe dos veces la misma entrada (BI-10). */
  const { ejecutar: anotar, ejecutando } = useAccionUnica(async () => {
    const v = validar(esquemaComentario, { texto })
    setErr(v.errores.texto)
    if (!v.ok) return
    try {
      const r = await comentariosService.guardar({ ejemplarId, texto: v.datos.texto })
      if (!r.correct) throw new Error(r.message)
      /* El servidor devuelve la misma entrada si llega dos veces en 10 s (v1.2): no se duplica. */
      setLista((l) => ordenarDiario([r.object, ...l.filter((x) => x.id !== r.object.id)]))
      setTexto('')
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
    }
  })
  /* Borrar una entrada pide confirmación y, si falla, lo dice (BI-20). */
  const borrar = (c: ComentarioDTO) =>
    confirmarAccion({
      titulo: 'Borrar del diario',
      mensaje: `¿Borrar la entrada del ${fechaCorta(c.creado)}? No se puede deshacer.`,
      textoConfirmar: 'Sí, borrar',
      onConfirmar: async () => {
        try {
          const r = await comentariosService.borrar(c.id as string)
          if (!r.correct) throw new Error(r.message)
          setLista((l) => l.filter((x) => x.id !== c.id))
          showToast('success', MENSAJES.borrado)
        } catch (e) {
          showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
        }
      },
    })
  return (
    <View style={styles.lista}>
      <Input
        label="Escribe en tu diario"
        value={texto}
        onChangeText={setTexto}
        multiline
        placeholder="Dónde lo leíste, qué sentiste…"
        error={err}
        testID="diario-texto"
      />
      <Button
        title="Anotar en el diario"
        icono="lapiz"
        onPress={anotar}
        loading={ejecutando}
        variant="secondary"
        testID="diario-anotar"
      />
      {cargando ? <Spinner /> : null}
      {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}
      {lista.map((c) => (
        <View key={c.id} style={[styles.entrada, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.entradaFecha, { color: colors.textMuted }]}>{fechaCorta(c.creado)}</Text>
          <Text style={[styles.entradaTexto, { color: colors.text }]}>{c.texto}</Text>
          <BotonIcono icono="trash" etiqueta="Borrar esta entrada del diario" onPress={() => borrar(c)} />
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
  guardando: boolean
  onGuardar: (c: Omit<GuardarEjemplarDTO, 'id'>) => void
  onBorrar: () => void
}> = ({ libro, guardando, onGuardar, onBorrar }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
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
  const [ocupadas, setOcupadas] = useState<Record<string, boolean>>({})
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

  /* Poner o quitar de una colección: un toque a la vez por colección (BI-09). */
  const alternarColeccion = async (e: EstanteDTO, tiene: boolean) => {
    if (ocupadas[e.id]) return
    setOcupadas((o) => ({ ...o, [e.id]: true }))
    try {
      const r = tiene ? await estantesService.quitar(e.id, libro.id) : await estantesService.agregar(e.id, libro.id)
      if (!r.correct) throw new Error(r.message)
      setEstantes((l) => l.map((x) => (x.e.id === e.id ? { ...x, tiene: !tiene } : x)))
    } catch (err) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(err, MENSAJES.errorGuardar))
    } finally {
      setOcupadas((o) => ({ ...o, [e.id]: false }))
    }
  }

  return (
    <View style={styles.lista}>
      <AppText variant="caption">{ORIGEN[libro.fuenteMetadatos] ?? ''}</AppText>
      <Input label="Título" value={f.titulo} onChangeText={campo('titulo')} error={errores.titulo} />
      <Input
        label="Autores"
        ayuda="Si son varios, sepáralos con comas."
        value={f.autores}
        onChangeText={campo('autores')}
        error={errores.autores}
      />
      <Input
        label="Año"
        ayuda="Déjalo vacío si no lo sabes."
        value={f.anio}
        onChangeText={campo('anio')}
        keyboardType="number-pad"
        error={errores.anio}
      />
      <Input label="Editorial" value={f.editorial} onChangeText={campo('editorial')} error={errores.editorial} />
      <Input label="Sinopsis" value={f.sinopsis} onChangeText={campo('sinopsis')} multiline error={errores.sinopsis} />
      <Input
        label="Géneros"
        ayuda="Separados por comas: novela, poesía…"
        value={f.generos}
        onChangeText={campo('generos')}
        error={errores.generos}
      />
      <Input
        label="Etiquetas"
        ayuda="Separadas por comas: verano, regalo…"
        value={f.etiquetas}
        onChangeText={campo('etiquetas')}
        error={errores.etiquetas}
      />
      <Button title="Guardar datos" onPress={enviar} loading={guardando} testID="guardar-datos" />
      {estantes.length ? (
        <View style={styles.lista}>
          <AppText variant="label">Colecciones</AppText>
          <View style={styles.estados}>
            {estantes.map(({ e, tiene }) => (
              <Chip
                key={e.id}
                etiqueta={e.nombre}
                activo={tiene}
                disabled={!!ocupadas[e.id]}
                onPress={() => alternarColeccion(e, tiene)}
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
  scrollConBarra: { paddingBottom: 120 + ALTO_BARRA_ACCIONES },
  barraAcciones: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  contenido: { padding: spacing.md, gap: spacing.md, maxWidth: 980, width: '100%', alignSelf: 'center' },
  contenidoEmbebido: { padding: spacing.md },
  cabecera: { alignItems: 'center', gap: spacing.md },
  cabeceraAncha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  marcoPortada: { padding: 24, alignItems: 'center', borderRadius: 999 },
  datos: { alignItems: 'stretch', gap: 8, width: '100%' },
  datosAncha: { flex: 1, paddingTop: 12 },
  titulo: { fontVariant: ['lining-nums'] },
  verTitulo: { minHeight: 44, justifyContent: 'center', flexDirection: 'row' },
  verTituloTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, textDecorationLine: 'underline' },
  autores: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.xl },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  centrado: { justifyContent: 'center' },
  estados: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  /* E8 (320 px): si las cuatro palabras no caben en una fila, pasan a dos; nunca se cortan con «…». */
  segmentado: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 12, padding: 2, gap: 2 },
  /* Cada estado ocupa lo que mide su palabra (QA UX-28: «Abandonado» se cortaba en 87 px). */
  segmento: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 6,
  },
  segmentoTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  segmentoActivo: { fontFamily: fuentes.uiSemi },
  avance: { gap: 6, marginTop: 4 },
  avanceTexto: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums', 'tabular-nums'] },
  botones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  deseo: { gap: 4 },
  notaDeseo: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4, marginTop: 4 },
  notaDeseoRotulo: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  notaDeseoTexto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
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
  capNum: {
    fontFamily: fuentes.tituloNegrita,
    fontSize: fontSize.lg,
    width: 34,
    fontVariant: ['lining-nums', 'tabular-nums'],
  },
  rombo: { width: 8, height: 8, marginLeft: 6, transform: [{ rotate: '45deg' }] },
  capTitulo: { flex: 1, fontFamily: fuentes.titulo, fontSize: fontSize.md, fontVariant: ['lining-nums'] },
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
