import React, { useCallback, useEffect, useRef, useState } from 'react'

import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'

import Barra from '@componentes/atoms/Barra'
import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
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
import { autoresTexto, duracion, nombreEstado } from '@logica/formato'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { EjemplarDTO, FacetasDTO } from '@tipos'

interface Props {
  cabecera: React.ReactElement
  onAbrir: (l: EjemplarDTO) => void
  version: number
}

/*
 * EL CATÁLOGO: el fichero de la biblioteca. Pestañas rápidas, búsqueda,
 * filtros que se combinan (alimentados por /libros/facetas), orden, y la
 * lista en rejilla de portadas o en fichas. Los filtros se recuerdan por
 * usuario: al volver, el catálogo está como lo dejaste.
 */
const Catalogo: React.FC<Props> = ({ cabecera, onAbrir, version }) => {
  const { colors } = useTheme()
  const { user } = useAuth()
  const { width } = useWindowDimensions()
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
        setLibros((prev) =>
          page === 0 ? r.object.list : [...prev, ...r.object.list.filter((l) => !prev.some((p) => p.id === l.id))],
        )
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

  useEffect(() => {
    if (hoja === 'filtros' && !facetas) {
      librosService
        .facetas()
        .then((r) => r.correct && setFacetas(r.object))
        .catch((e) => console.warn('[catalogo] facetas', e))
    }
  }, [hoja, facetas])

  const reemplazar = useCallback((l: EjemplarDTO) => setLibros((prev) => prev.map((x) => (x.id === l.id ? l : x))), [])
  usePreparacion(libros, reemplazar)

  const columnas = rejilla ? Math.max(2, Math.min(8, Math.floor((width - 24) / 128))) : 1
  const anchoPortada = rejilla ? Math.floor((Math.min(width, 1400) - 24) / columnas) - 24 : 56
  const chips = chipsActivos(filtros)
  const nFiltros = contarFiltros(filtros)
  const ordenActual = ORDENES.find((o) => o.clave === filtros.orden)?.nombre ?? ''

  const controles = (
    <View style={styles.controles}>
      <Input
        label=""
        accessibilityLabel="Buscar en tu biblioteca"
        value={texto}
        onChangeText={setTexto}
        placeholder="Buscar por título, autor, etiqueta…"
        testID="buscar"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pestanas}
        accessibilityRole="tablist"
      >
        {PESTANAS.map((p) => {
          const activa = filtros.pestana === p.clave
          return (
            <Pressable
              key={p.clave}
              onPress={() => setFiltros((f) => ({ ...f, pestana: p.clave }))}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={p.nombre}
              testID={`pestana-${p.clave}`}
              style={[styles.pestana, activa && { borderBottomColor: colors.primary }, web({ cursor: 'pointer' })]}
            >
              <Text
                style={[
                  styles.pestanaTexto,
                  {
                    color: activa ? colors.primary : colors.textSecondary,
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
        <BotonIcono
          icono={rejilla ? 'lista' : 'rejilla'}
          etiqueta={rejilla ? 'Ver como lista' : 'Ver como rejilla'}
          onPress={() => setRejilla((r) => !r)}
        />
      </View>
      {chips.length ? (
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
      ) : null}
      {total != null ? (
        <AppText variant="caption" style={styles.total}>
          {total === 1 ? '1 libro' : `${total} libros`}
        </AppText>
      ) : null}
    </View>
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
            {item.nNotas ? ` · ${item.nNotas} notas` : ''}
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
        ListHeaderComponent={
          <>
            {cabecera}
            {controles}
          </>
        }
        ListEmptyComponent={
          cargando ? (
            <Spinner />
          ) : error ? (
            <EstadoError mensaje={error} onReintentar={() => pedir(0)} />
          ) : (
            <EmptyState
              title="Ningún libro aquí"
              message={
                nFiltros || filtros.texto
                  ? 'Prueba quitando algún filtro.'
                  : 'Esta parte de la biblioteca aún está vacía.'
              }
              icon="search"
            />
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
            <View style={styles.anios}>
              <View style={styles.flex}>
                <Input
                  label="Desde"
                  keyboardType="number-pad"
                  value={filtros.anioDesde != null ? String(filtros.anioDesde) : ''}
                  onChangeText={(t) => setFiltros((f) => ({ ...f, anioDesde: /^\d{1,4}$/.test(t) ? Number(t) : null }))}
                  placeholder={facetas.anios[0]?.nombre}
                />
              </View>
              <View style={styles.flex}>
                <Input
                  label="Hasta"
                  keyboardType="number-pad"
                  value={filtros.anioHasta != null ? String(filtros.anioHasta) : ''}
                  onChangeText={(t) => setFiltros((f) => ({ ...f, anioHasta: /^\d{1,4}$/.test(t) ? Number(t) : null }))}
                  placeholder={facetas.anios[facetas.anios.length - 1]?.nombre}
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

const SeccionFacetas: React.FC<{
  titulo: string
  valores: string[]
  activos: string[]
  onAlternar: (v: string) => void
}> = ({ titulo, valores, activos, onAlternar }) =>
  valores.length ? (
    <View style={styles.seccion}>
      <AppText variant="label">{titulo}</AppText>
      <View style={styles.chips}>
        {valores.map((v) => (
          <Chip key={v} etiqueta={v} activo={activos.includes(v)} onPress={() => onAlternar(v)} />
        ))}
      </View>
    </View>
  ) : null

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { paddingBottom: 120, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  controles: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  pestanas: { gap: 4, paddingBottom: 4 },
  pestana: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  pestanaTexto: { fontSize: fontSize.sm },
  herramientas: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  total: { marginTop: 8, marginBottom: 4 },
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
  seccion: { gap: 2 },
  anios: { flexDirection: 'row', gap: 10 },
  pie: { height: 40 },
})

export default Catalogo
