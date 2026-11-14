import React, { useCallback, useEffect, useRef, useState } from 'react'

import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Esqueleto from '@componentes/atoms/Esqueleto'
import Icono from '@componentes/atoms/Icono'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import Portada from '@componentes/estanteria/Portada'
import { etiquetaLibro } from '@componentes/estanteria/tiposLibro'
import EmptyState from '@componentes/molecules/EmptyState'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Hoja from '@componentes/molecules/Hoja'
import SeccionFacetas from '@componentes/molecules/SeccionFacetas'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import { mensajeDeError } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import {
  EstadoFiltros,
  FILTROS_INICIALES,
  ORDENES,
  PESTANAS,
  aFiltroDTO,
  alternar,
  chipsActivos,
  claveFiltros,
  contarFiltros,
  leerFiltrosGuardados,
  limpiarFiltros,
} from '@logica/filtros'
import { autoresTexto, cuentaDePestana, duracion, nombreEstado, plural } from '@logica/formato'
import { HUECO_FLOTANTE, esApaisado } from '@pantallas/biblioteca/flotante'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import type { EjemplarDTO, FacetasDTO, Orden, Pestana } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { MENSAJES } from '@utils/mensajes'

/** El borde derecho de la fila de pestañas se funde con lo que haya detrás (madera o papel), sin pintar color. */
const mascaraDerecha = {
  maskImage: 'linear-gradient(90deg, #000 calc(100% - 40px), transparent)',
  WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 40px), transparent)',
}

/** Abrir el catálogo en una pestaña y un orden ("Ver todos" de una balda). `n` cambia en cada pedido. */
export interface PedidoCatalogo {
  pestana: Pestana
  orden: Orden
  n: number
}

/** Los años de las facetas, de menor a mayor (vienen en orden descendente: BI-19). */
export function extremosDeAnios(anios: { nombre: string }[]): { min: string | undefined; max: string | undefined } {
  const n = anios.map((a) => Number(a.nombre)).filter((x) => Number.isFinite(x))
  if (!n.length) return { min: undefined, max: undefined }
  return { min: String(Math.min(...n)), max: String(Math.max(...n)) }
}

interface Props {
  cabecera: React.ReactElement
  onAbrir: (l: EjemplarDTO) => void
  version: number
  pedido?: PedidoCatalogo | null
}

/*
 * EL CATÁLOGO: el fichero de la biblioteca. Pestañas rápidas, búsqueda,
 * filtros que se combinan (alimentados por /libros/facetas), orden, y la
 * lista en rejilla de portadas o en fichas. Los filtros se recuerdan por
 * usuario: al volver, el catálogo está como lo dejaste.
 */
const Catalogo: React.FC<Props> = ({ cabecera, onAbrir, version, pedido }) => {
  const { colors, isDark } = useTheme()
  const { user } = useAuth()
  const { width, height } = useWindowDimensions()
  const apaisado = esApaisado(height)
  const [lupaAbierta, setLupaAbierta] = useState(false)
  const [fila, setFila] = useState({ ancho: 0, contenido: 0, x: 0 })
  const [filtros, setFiltros] = useState<EstadoFiltros>(FILTROS_INICIALES)
  const [listos, setListos] = useState(false)
  const [texto, setTexto] = useState('')
  const [libros, setLibros] = useState<EjemplarDTO[]>([])
  const [pagina, setPagina] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejilla, setRejilla] = useState(true)
  const [hoja, setHoja] = useState<'filtros' | 'orden' | null>(null)
  const [facetas, setFacetas] = useState<FacetasDTO | null>(null)
  const turno = useRef(0)
  const filaPestanas = useRef<ScrollView>(null)
  const posiciones = useRef<Record<string, number>>({})

  /* Los filtros guardados de ESTE usuario. */
  useEffect(() => {
    AsyncStorage.getItem(claveFiltros(user?.userId))
      .then((g) => {
        const f = leerFiltrosGuardados(g ?? null)
        setFiltros(f)
        setTexto(f.texto)
      })
      .catch(() => {})
      .finally(() => setListos(true))
  }, [user?.userId])

  /* "Ver todos ›" de una balda: el catálogo se abre en esa pestaña y orden. */
  useEffect(() => {
    if (!pedido || !listos) return
    setFiltros((f) => ({ ...f, pestana: pedido.pestana, orden: pedido.orden }))
  }, [pedido, listos])

  /* La pestaña activa siempre a la vista (UX-01): la fila se desplaza hasta ella. */
  useEffect(() => {
    const x = posiciones.current[filtros.pestana]
    if (x != null) filaPestanas.current?.scrollTo({ x: Math.max(0, x - 24), animated: true })
  }, [filtros.pestana])

  useEffect(() => {
    if (!listos) return
    AsyncStorage.setItem(claveFiltros(user?.userId), JSON.stringify(filtros)).catch(() => {})
  }, [filtros, listos, user?.userId])

  /* La búsqueda espera a que dejes de escribir. */
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.texto === texto ? f : { ...f, texto })), 350)
    return () => clearTimeout(t)
  }, [texto])

  const pedir = useCallback(
    async (page: number) => {
      const mio = ++turno.current
      setCargando(true)
      setError(null)
      try {
        const r = await librosService.todos(aFiltroDTO(filtros, page))
        if (mio !== turno.current) return
        if (!r.correct) throw new Error(r.message)
        /* Los documentos tienen su archivador (BI-12): si el servidor aún los mezcla
           en las pestañas de libros (contrato v1.1), aquí no se pintan. */
        const lista =
          filtros.pestana === 'DOCUMENTOS' ? r.object.list : r.object.list.filter((l) => l.tipo !== 'DOCUMENTO')
        setLibros((prev) => (page === 0 ? lista : [...prev, ...lista.filter((l) => !prev.some((p) => p.id === l.id))]))
        setPagina(r.object.page)
        setTotalPaginas(r.object.totalPage)
        setTotal(r.object.totalElements ?? null)
      } catch (e) {
        if (mio === turno.current) setError(mensajeDeError(e))
      } finally {
        if (mio === turno.current) setCargando(false)
      }
    },
    [filtros],
  )

  useEffect(() => {
    if (listos) pedir(0)
  }, [pedir, listos, version])

  /* Las facetas de la pestaña actual (BI-13) se piden CADA VEZ que se abre la hoja (BI-14): un género o una
     etiqueta nuevos aparecen sin recargar la página. Mientras llegan, se ven las
     anteriores. */
  useEffect(() => {
    if (hoja !== 'filtros') return
    let vivo = true
    librosService
      .facetas(filtros.pestana)
      .then((r) => {
        if (vivo && r.correct) setFacetas(r.object)
      })
      .catch((e) => console.warn('[catalogo] facetas', e))
    return () => {
      vivo = false
    }
  }, [hoja, version, filtros.pestana])

  const reemplazar = useCallback((l: EjemplarDTO) => setLibros((prev) => prev.map((x) => (x.id === l.id ? l : x))), [])
  usePreparacion(libros, reemplazar)

  const columnas = rejilla ? Math.max(2, Math.min(8, Math.floor((width - 24) / 128))) : 1
  const anchoPortada = rejilla ? Math.floor((Math.min(width, 1400) - 24) / columnas) - 24 : 56
  const chips = chipsActivos(filtros)
  const nFiltros = contarFiltros(filtros)
  const ordenActual = ORDENES.find((o) => o.clave === filtros.orden)?.nombre ?? ''

  /* La fila de pestañas se desvanece por la derecha SOLO si sigue (QA RW-05): con una máscara, no con un bloque de color. */
  const desvanecer = fila.contenido > fila.ancho + 2 && fila.x + fila.ancho < fila.contenido - 2
  const pestanas = (
    <ScrollView
      ref={filaPestanas}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pestanas}
      accessibilityRole="tablist"
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width
        setFila((f) => (Math.abs(f.ancho - w) > 1 ? { ...f, ancho: w } : f))
      }}
      onContentSizeChange={(w) => setFila((f) => (Math.abs(f.contenido - w) > 1 ? { ...f, contenido: w } : f))}
      onScroll={(e) => {
        const x = e.nativeEvent.contentOffset.x
        setFila((f) => (Math.abs(f.x - x) > 4 ? { ...f, x } : f))
      }}
      scrollEventThrottle={64}
      style={[apaisado && styles.flex, desvanecer && web(mascaraDerecha)]}
      testID="fila-pestanas"
    >
      {PESTANAS.map((p) => {
        const activa = filtros.pestana === p.clave
        return (
          <Pressable
            key={p.clave}
            onPress={() => setFiltros((f) => ({ ...f, pestana: p.clave }))}
            onLayout={(e) => {
              posiciones.current[p.clave] = e.nativeEvent.layout.x
            }}
            {...estadoElegible('tab', activa)}
            accessibilityLabel={p.nombre}
            testID={`pestana-${p.clave}`}
            style={[
              styles.pestana,
              activa && { borderColor: colors.primaryLight },
              activa && web(placaActiva(isDark)),
              web({ cursor: 'pointer' }),
            ]}
          >
            <Text
              style={[
                styles.pestanaTexto,
                {
                  color: activa ? colors.text : colors.textSecondary,
                  fontFamily: activa ? fuentes.uiSemi : fuentes.ui,
                },
              ]}
            >
              {p.nombre}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )

  const campoBusqueda = (
    <Input
      label=""
      accessibilityLabel="Buscar en tu biblioteca"
      value={texto}
      onChangeText={setTexto}
      placeholder="Buscar por título, autor, etiqueta…"
      testID="buscar"
      autoFocus={apaisado}
      compacto
    />
  )

  const cuenta =
    total != null ? (
      <Text style={[styles.cuenta, { color: colors.textSecondary }]} numberOfLines={1} testID="cuenta-catalogo">
        {cuentaDePestana(filtros.pestana, total)}
      </Text>
    ) : null

  const chipsFiltros = chips.length ? (
    <View style={styles.chips}>
      {chips.map((c) => (
        <Chip key={c.clave} etiqueta={c.etiqueta} quitable onPress={() => setFiltros(c.quitar)} />
      ))}
      <Chip
        etiqueta="Limpiar"
        quitable
        accessibilityLabel="Quitar todos los filtros"
        onPress={() => setFiltros(limpiarFiltros)}
      />
    </View>
  ) : null

  const botonVista = (
    <BotonIcono
      icono={rejilla ? 'lista' : 'rejilla'}
      etiqueta={rejilla ? 'Ver como lista' : 'Ver como rejilla'}
      onPress={() => setRejilla((r) => !r)}
    />
  )

  /*
   * En horizontal (alto < 500, UX-12 y diseño 3) todo va en UNA fila junto a la
   * cabecera: la búsqueda plegada en una lupa, las pestañas, filtros y orden.
   * Así la cabecera del catálogo no pasa del 25 % del alto.
   */
  const buscando = apaisado && (lupaAbierta || !!texto)
  const controles = apaisado ? (
    <View style={styles.controlesApaisado} testID="controles-apaisados">
      <View style={styles.filaApaisada}>
        <View style={styles.cabeceraApaisada}>{cabecera}</View>
        {buscando ? (
          <>
            <View style={styles.flex}>{campoBusqueda}</View>
            <BotonIcono
              icono="close"
              etiqueta="Cerrar la búsqueda"
              onPress={() => {
                setTexto('')
                setLupaAbierta(false)
              }}
              testID="cerrar-busqueda"
            />
          </>
        ) : (
          <>
            <BotonIcono icono="search" etiqueta="Buscar" onPress={() => setLupaAbierta(true)} testID="abrir-busqueda" />
            {pestanas}
            <BotonIcono
              icono="filtro"
              etiqueta={`Filtros${nFiltros ? `, ${nFiltros} activos` : ''}`}
              activo={nFiltros > 0}
              onPress={() => setHoja('filtros')}
              testID="abrir-filtros"
            />
            <BotonIcono
              icono="orden"
              etiqueta={`Ordenar: ${ordenActual}`}
              onPress={() => setHoja('orden')}
              testID="abrir-orden"
            />
            {botonVista}
          </>
        )}
      </View>
      {chipsFiltros}
    </View>
  ) : (
    <>
      {cabecera}
      <View style={styles.controles}>
        {campoBusqueda}
        {pestanas}
        <View style={styles.herramientas}>
          <Chip
            etiqueta={nFiltros ? `Filtros (${nFiltros})` : 'Filtros'}
            icono="filtro"
            activo={nFiltros > 0}
            onPress={() => setHoja('filtros')}
            accessibilityLabel={`Filtros${nFiltros ? `, ${nFiltros} activos` : ''}`}
            testID="abrir-filtros"
          />
          <Chip
            etiqueta={ordenActual}
            icono="orden"
            onPress={() => setHoja('orden')}
            accessibilityLabel={`Ordenar: ${ordenActual}`}
            testID="abrir-orden"
          />
          <View style={styles.flex} />
          {botonVista}
        </View>
        {chipsFiltros}
        {cuenta}
      </View>
    </>
  )

  const renderLibro = ({ item }: { item: EjemplarDTO }) =>
    rejilla ? (
      <Pressable
        onPress={() => onAbrir(item)}
        accessibilityRole="button"
        accessibilityLabel={etiquetaLibro(item)}
        testID={`catalogo-${item.id}`}
        style={({ pressed }) => [
          styles.celda,
          { width: anchoPortada + 24 },
          pressed && { opacity: 0.8 },
          web({ cursor: 'pointer' }),
        ]}
      >
        <Portada libro={item} ancho={anchoPortada} />
        <Text numberOfLines={2} style={[styles.celdaTitulo, { color: colors.text }]}>
          {item.titulo}
        </Text>
        <Text numberOfLines={1} style={[styles.celdaAutor, { color: colors.textSecondary }]}>
          {autoresTexto(item.autores)}
        </Text>
        {item.porcentaje > 0 && item.porcentaje < 100 ? (
          <Barra porcentaje={item.porcentaje} etiqueta={`Progreso de ${item.titulo}`} />
        ) : null}
      </Pressable>
    ) : (
      <Pressable
        onPress={() => onAbrir(item)}
        accessibilityRole="button"
        accessibilityLabel={etiquetaLibro(item)}
        testID={`catalogo-${item.id}`}
        style={({ pressed }) => [
          styles.ficha,
          { borderColor: colors.border, backgroundColor: colors.card },
          pressed && { opacity: 0.85 },
          web({ cursor: 'pointer' }),
        ]}
      >
        <Portada libro={item} ancho={56} sombra={false} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.fichaTitulo, { color: colors.text }]}>
            {item.titulo}
          </Text>
          <Text numberOfLines={1} style={[styles.celdaAutor, { color: colors.textSecondary }]}>
            {autoresTexto(item.autores)}
            {item.anio ? ` · ${item.anio}` : ''}
          </Text>
          <Text style={[styles.fichaMeta, { color: colors.textMuted }]}>
            {item.tipo === 'LIBRO' ? nombreEstado(item.estado) : item.tipo === 'DESEO' ? 'Deseo' : 'Documento'}
            {item.formatoOriginal ? ` · ${item.formatoOriginal}` : ''}
            {item.minutosEstimados ? ` · ${duracion(item.minutosEstimados)}` : ''}
            {item.favorito ? ' · ♥ favorito' : ''}
            {item.nNotas ? ` · ${plural(item.nNotas, 'nota')}` : ''}
          </Text>
          {item.porcentaje > 0 ? <Barra porcentaje={item.porcentaje} etiqueta={`Progreso de ${item.titulo}`} /> : null}
        </View>
        <Icono nombre="right" color={colors.textMuted} />
      </Pressable>
    )

  return (
    <>
      <FlatList
        key={`cols-${columnas}`}
        testID="catalogo"
        data={libros}
        keyExtractor={(l) => l.id}
        numColumns={columnas}
        renderItem={renderLibro}
        columnWrapperStyle={columnas > 1 ? styles.filaRejilla : undefined}
        contentContainerStyle={styles.contenido}
        ListHeaderComponent={controles}
        ListEmptyComponent={
          cargando ? (
            <Esqueleto variante="portadas" ancho={width} />
          ) : error ? (
            <EstadoError mensaje={error} onReintentar={() => pedir(0)} />
          ) : (
            <EmptyState
              title={filtros.texto ? `Nada coincide con «${filtros.texto}»` : 'Nada aquí todavía'}
              message={
                filtros.texto && nFiltros
                  ? `Ni el texto ni los ${plural(nFiltros, 'filtro')} dan resultados juntos.`
                  : filtros.texto
                    ? 'Prueba con otra palabra; da igual si escribes con tildes o mayúsculas.'
                    : nFiltros
                      ? 'Prueba quitando algún filtro.'
                      : 'Esta parte de la biblioteca aún está vacía.'
              }
              icon="search"
            >
              {filtros.texto ? (
                <Button
                  title="Limpiar la búsqueda"
                  variant="secondary"
                  onPress={() => {
                    setTexto('')
                    setFiltros((f) => ({ ...f, texto: '' }))
                  }}
                  testID="limpiar-busqueda"
                />
              ) : null}
              {nFiltros ? (
                <Button title="Quitar los filtros" variant="secondary" onPress={() => setFiltros(limpiarFiltros)} />
              ) : null}
            </EmptyState>
          )
        }
        ListFooterComponent={cargando && libros.length ? <Spinner /> : <View style={styles.pie} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (!cargando && pagina + 1 < totalPaginas) pedir(pagina + 1)
        }}
      />

      <Hoja visible={hoja === 'orden'} titulo="Ordenar por" onCerrar={() => setHoja(null)}>
        {ORDENES.map((o) => (
          <Chip
            key={o.clave}
            rol="radio"
            etiqueta={o.nombre}
            activo={filtros.orden === o.clave}
            onPress={() => {
              setFiltros((f) => ({ ...f, orden: o.clave }))
              setHoja(null)
            }}
          />
        ))}
      </Hoja>

      <Hoja visible={hoja === 'filtros'} titulo="Filtros" onCerrar={() => setHoja(null)} testID="hoja-filtros">
        {!facetas ? (
          <Spinner />
        ) : (
          <>
            <SeccionFacetas
              titulo="Autor"
              valores={facetas.autores.slice(0, 30).map((x) => x.nombre)}
              activos={filtros.autores}
              onAlternar={(v) => setFiltros((f) => ({ ...f, autores: alternar(f.autores, v) }))}
            />
            <SeccionFacetas
              titulo="Género"
              valores={facetas.generos.map((x) => x.nombre)}
              activos={filtros.generos}
              onAlternar={(v) => setFiltros((f) => ({ ...f, generos: alternar(f.generos, v) }))}
            />
            <SeccionFacetas
              titulo="Formato"
              valores={facetas.formatos.map((x) => x.nombre)}
              activos={filtros.formatos}
              onAlternar={(v) => setFiltros((f) => ({ ...f, formatos: alternar(f.formatos, v) }))}
            />
            <SeccionFacetas
              titulo="Etiqueta"
              valores={facetas.etiquetas.map((x) => x.nombre)}
              activos={filtros.etiquetas}
              onAlternar={(v) => setFiltros((f) => ({ ...f, etiquetas: alternar(f.etiquetas, v) }))}
            />
            <AppText variant="label">Año</AppText>
            {filtros.anioDesde != null && filtros.anioHasta != null && filtros.anioDesde > filtros.anioHasta ? (
              <Text style={[styles.aviso, { color: colors.warning }]}>⚠ {MENSAJES.rangoAniosInvertido}</Text>
            ) : null}
            <View style={styles.anios}>
              <View style={styles.flex}>
                <Input
                  label="Desde"
                  keyboardType="number-pad"
                  value={filtros.anioDesde != null ? String(filtros.anioDesde) : ''}
                  onChangeText={(t) => setFiltros((f) => ({ ...f, anioDesde: /^\d{1,4}$/.test(t) ? Number(t) : null }))}
                  placeholder={extremosDeAnios(facetas.anios).min}
                />
              </View>
              <View style={styles.flex}>
                <Input
                  label="Hasta"
                  keyboardType="number-pad"
                  value={filtros.anioHasta != null ? String(filtros.anioHasta) : ''}
                  onChangeText={(t) => setFiltros((f) => ({ ...f, anioHasta: /^\d{1,4}$/.test(t) ? Number(t) : null }))}
                  placeholder={extremosDeAnios(facetas.anios).max}
                />
              </View>
            </View>
            <AppText variant="label">Calificación mínima</AppText>
            <View style={styles.chips}>
              {[3, 3.5, 4, 4.5, 5].map((c) => (
                <Chip
                  key={c}
                  etiqueta={`${String(c).replace('.', ',')}★`}
                  activo={filtros.calificacionMin === c}
                  onPress={() => setFiltros((f) => ({ ...f, calificacionMin: f.calificacionMin === c ? null : c }))}
                />
              ))}
            </View>
            <View style={styles.chips}>
              <Chip
                etiqueta="Con notas"
                icono="nota"
                activo={filtros.conNotas}
                onPress={() => setFiltros((f) => ({ ...f, conNotas: !f.conNotas }))}
              />
            </View>
            <View style={styles.anios}>
              <Button
                title="Limpiar"
                variant="secondary"
                onPress={() => setFiltros(limpiarFiltros)}
                style={styles.flex}
              />
              <Button title="Ver libros" onPress={() => setHoja(null)} style={styles.flex} />
            </View>
          </>
        )}
      </Hoja>
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { paddingBottom: HUECO_FLOTANTE, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  controles: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  pestanas: { gap: 6, paddingBottom: 4, paddingRight: 28 },
  pestana: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  aviso: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  pestanaTexto: { fontSize: fontSize.sm },
  herramientas: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  cuenta: {
    fontFamily: fuentes.ui,
    fontSize: fontSize.xs,
    fontVariant: ['lining-nums'],
    marginTop: 6,
    marginBottom: 2,
  },
  controlesApaisado: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
  filaApaisada: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cabeceraApaisada: { flexShrink: 0 },
  filaRejilla: { paddingHorizontal: 12, gap: 0 },
  celda: { padding: 12, gap: 6, alignItems: 'flex-start', minHeight: 44 },
  celdaTitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md, lineHeight: 20 },
  celdaAutor: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  ficha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 44,
  },
  fichaTitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  fichaMeta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, marginVertical: 3 },
  anios: { flexDirection: 'row', gap: 10 },
  pie: { height: 40 },
})

export default Catalogo
