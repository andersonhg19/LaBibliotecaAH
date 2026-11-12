import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { StyleSheet, View } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'

import Spinner from '@componentes/atoms/Spinner'
import Atril from '@componentes/estanteria/Atril'
import BarraBaldas from '@componentes/estanteria/BarraBaldas'
import Estante from '@componentes/estanteria/Estante'
import Mueble, { Modulo } from '@componentes/estanteria/Mueble'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import { useAuth } from '@contextos/AuthContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import {
  Agrupacion,
  PREFERENCIAS_INICIALES,
  PreferenciasEstanteria,
  agruparLibros,
  claveEstanteria,
  leerPreferenciasEstanteria,
} from '@logica/agrupar'
import { EstadoFiltros, aFiltroDTO, contarFiltros } from '@logica/filtros'
import { movimientoDeOrden } from '@logica/orden'
import { estantesService, librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO, EstanteDTO, Orden, Pestana } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

interface Props {
  modo: ModoEstante
  onAbrir: (l: EjemplarDTO) => void
  /** Cambia para pedir que se recargue (tras subir, borrar, volver de la ficha…). */
  version: number
  /** El ancho que tiene la estantería (sin el panel de la ficha del PC). */
  ancho: number
  /** "Ver todos" de una balda, o "Elegir un libro" del atril: abre el catálogo así. */
  onVerCatalogo?: (pestana: Pestana, orden: Orden) => void
  /** "Traer libros" desde una balda vacía. */
  onTraer?: () => void
  /** "Seguir leyendo" desde la tarjeta del atril (PC). */
  onSeguir?: (l: EjemplarDTO) => void
  /** Pantalla baja (horizontal): el mueble sin lámpara, solo el haz (UX-12). */
  apaisado?: boolean
}

interface Datos {
  leyendo: EjemplarDTO[]
  recientes: EjemplarDTO[]
  /** Cuántos libros hay en total (para "24 de 40"); null si no se sabe. */
  totalRecientes: number | null
  estantes: { estante: EstanteDTO; libros: EjemplarDTO[] }[]
  /** Todos los libros (con los filtros puestos): solo al agrupar por género/autor o al filtrar. */
  todos: EjemplarDTO[] | null
  /** Con qué agrupación se pidieron (al cambiarla, hasta que llegan los nuevos, se espera). */
  agrupar: Agrupacion
}

/** Página grande (el máximo del servidor) y tope de páginas al traer toda la biblioteca. */
const PAGINA_TODOS = 200
const MAX_PAGINAS_TODOS = 10

/**
 * TODOS LOS LIBROS (con los filtros de la estantería) para agrupar en el
 * cliente: hasta 2000, en páginas de 200. Solo libros (sin documentos ni deseos).
 */
export async function pedirTodos(filtros: EstadoFiltros): Promise<EjemplarDTO[]> {
  const libros: EjemplarDTO[] = []
  for (let page = 0; page < MAX_PAGINAS_TODOS; page++) {
    const r = exigir(await librosService.todos(aFiltroDTO(filtros, page, PAGINA_TODOS)))
    if (!r) break
    libros.push(...r.list.filter((l) => l.tipo === 'LIBRO'))
    if (page + 1 >= (r.totalPage ?? 1) || !r.list.length) break
  }
  return libros
}

/** Cuántos se enseñan en "Recién llegados". */
export const EN_RECIENTES = 24
const POR_PAGINA = 48

/**
 * RECIÉN LLEGADOS SOLO CON LIBROS (BI-02). Antes se pedían los 30 más recientes
 * de TODO y se quitaban los documentos DESPUÉS: con 32 documentos subidos al
 * final, la balda salía vacía aunque hubiera libros. Ahora, si el servidor aún
 * mezcla documentos en "Todo" (contrato v1.1), se siguen pidiendo páginas hasta
 * reunir 24 libros, y el total se corrige restando los documentos. Con el
 * contrato v1.2 (documentos fuera de las pestañas) basta la primera página.
 */
export async function pedirRecientes(): Promise<{ libros: EjemplarDTO[]; total: number | null }> {
  const libros: EjemplarDTO[] = []
  let total: number | null = null
  let mezcla = false
  for (let page = 0; page < 4; page++) {
    const r = exigir(await librosService.todos({ pestana: 'TODO', orden: 'RECIENTES', page, size: POR_PAGINA }))
    if (!r) break
    if (page === 0) total = r.totalElements ?? null
    if (r.list.some((l) => l.tipo !== 'LIBRO')) mezcla = true
    libros.push(...r.list.filter((l) => l.tipo === 'LIBRO'))
    if (libros.length >= EN_RECIENTES || page + 1 >= (r.totalPage ?? 1) || !mezcla) break
  }
  if (mezcla && total != null) {
    try {
      const docs = exigir(await librosService.todos({ pestana: 'DOCUMENTOS', orden: 'RECIENTES', page: 0, size: 1 }))
      total = docs?.totalElements != null ? Math.max(libros.length, total - docs.totalElements) : null
    } catch (e) {
      console.warn('[estanteria] no se pudo contar los documentos', e)
      total = null
    }
  }
  return { libros: libros.slice(0, EN_RECIENTES), total }
}

/** Cuántas columnas de mueble caben (módulos de ~420 px en el PC; una en el teléfono). */
export const columnasDeMueble = (ancho: number) => (ancho >= 1240 ? 3 : ancho >= 820 ? 2 : 1)

/**
 * Cómo se reparten n baldas en filas de como mucho `columnas` módulos, LLENANDO
 * cada fila (sin huecos a la derecha) y equilibradas: 4 en 3 columnas → 2 + 2.
 */
export function filasDeModulos(n: number, columnas: number): number[] {
  if (n <= 0) return []
  const c = Math.max(1, Math.min(columnas, n))
  const filas = Math.ceil(n / c)
  const base = Math.floor(n / filas)
  const resto = n % filas
  return Array.from({ length: filas }, (_, i) => base + (i < resto ? 1 : 0))
}

/*
 * LA ESTANTERÍA: un mueble de verdad. Arriba el ATRIL con lo que estás
 * leyendo; debajo las baldas: "Recién llegados" (por fecha de llegada),
 * "Favoritos" (en el orden que tú decidas, arrastrando) y tus colecciones. En
 * el PC las baldas se reparten en módulos lado a lado.
 */
const Estanteria: React.FC<Props> = ({
  modo,
  onAbrir,
  version,
  ancho,
  onVerCatalogo,
  onTraer,
  onSeguir,
  apaisado = false,
}) => {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const ordenEnCurso = useRef(false)
  /* Cómo agrupar y filtrar las baldas: se recuerda POR USUARIO, como los filtros del catálogo. */
  const [prefs, setPrefs] = useState<PreferenciasEstanteria>(PREFERENCIAS_INICIALES)
  const [listos, setListos] = useState(false)
  const { agrupar, filtros } = prefs
  const filtrando = contarFiltros(filtros) > 0
  /* Lo que cambia QUÉ se pide (el orden de las baldas solo cambia cómo se pinta). */
  const claveFiltros = JSON.stringify([filtros.autores, filtros.generos, filtros.formatos])

  useEffect(() => {
    AsyncStorage.getItem(claveEstanteria(user?.userId))
      .then((g) => setPrefs(leerPreferenciasEstanteria(g)))
      .catch(() => {})
      .finally(() => setListos(true))
  }, [user?.userId])

  const cambiarPrefs = useCallback(
    (p: PreferenciasEstanteria) => {
      setPrefs(p)
      AsyncStorage.setItem(claveEstanteria(user?.userId), JSON.stringify(p)).catch(() => {})
    },
    [user?.userId],
  )

  const tarea = useCallback(async () => {
    const porColecciones = agrupar === 'COLECCIONES'
    const [leyendo, recientes, estantes, todos] = await Promise.all([
      librosService.todos({ pestana: 'LEYENDO', orden: 'ULTIMO_ABIERTO', page: 0, size: 20 }),
      porColecciones && !filtrando ? pedirRecientes() : null,
      porColecciones ? estantesService.todos() : null,
      !porColecciones || filtrando ? pedirTodos(filtros) : null,
    ])
    const lista = estantes ? (exigir(estantes) ?? []) : []
    const conLibros = await Promise.all(
      lista.map(async (e) => ({ estante: e, libros: exigir(await estantesService.libros(e.id)) ?? [] })),
    )
    conLibros.sort((a, b) => (a.estante.tipo === 'FAVORITOS' ? -1 : b.estante.tipo === 'FAVORITOS' ? 1 : 0))
    /* Filtrando por colecciones: cada balda enseña solo los libros que pasan el filtro. */
    const pasan = todos ? new Set(todos.map((l) => l.id)) : null
    setDatos({
      leyendo: (exigir(leyendo)?.list ?? []).filter((l) => l.tipo === 'LIBRO'),
      recientes: recientes ? recientes.libros : (todos ?? []).slice(0, EN_RECIENTES),
      totalRecientes: recientes ? recientes.total : (todos?.length ?? null),
      estantes: pasan ? conLibros.map((e) => ({ ...e, libros: e.libros.filter((l) => pasan.has(l.id)) })) : conLibros,
      todos,
      agrupar,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claveFiltros resume autores/géneros/formatos
  }, [agrupar, claveFiltros])
  const { cargando, error, cargar } = useCarga(tarea)

  useEffect(() => {
    if (listos) cargar()
  }, [cargar, version, listos])

  const reemplazar = useCallback((l: EjemplarDTO) => {
    setDatos(
      (d) =>
        d && {
          ...d,
          leyendo: d.leyendo.map((x) => (x.id === l.id ? l : x)),
          recientes: d.recientes.map((x) => (x.id === l.id ? l : x)),
          estantes: d.estantes.map((e) => ({ ...e, libros: e.libros.map((x) => (x.id === l.id ? l : x)) })),
          todos: d.todos && d.todos.map((x) => (x.id === l.id ? l : x)),
        },
    )
  }, [])
  usePreparacion(datos?.recientes ?? [], reemplazar)

  const reordenar = async (estanteId: string, desde: number, hasta: number) => {
    /* Un movimiento a la vez (BI-28): dos toques seguidos no mandan dos órdenes cruzadas. */
    if (ordenEnCurso.current) return
    const actual = datos?.estantes.find((e) => e.estante.id === estanteId)
    if (!actual) return
    const mov = movimientoDeOrden(actual.libros, desde, hasta)
    if (!mov) return
    const antes = actual.libros
    const poner = (libros: EjemplarDTO[]) =>
      setDatos(
        (d) => d && { ...d, estantes: d.estantes.map((e) => (e.estante.id === estanteId ? { ...e, libros } : e)) },
      )
    ordenEnCurso.current = true
    poner(mov.lista)
    try {
      const r = await estantesService.ordenar(estanteId, mov.cuerpo)
      if (!r.correct) throw new Error(r.message)
    } catch (e) {
      console.error('[estanteria] no se pudo ordenar', e)
      poner(antes)
      showToast('error', MENSAJES.ordenFallo)
    } finally {
      ordenEnCurso.current = false
    }
  }

  /* Por género o autor: las baldas salen de agrupar todos los libros (si el filtro es de
     ese mismo tipo, solo sus baldas). */
  const grupos = useMemo(() => {
    if (agrupar === 'COLECCIONES' || !datos?.todos || datos.agrupar !== agrupar) return null
    return agruparLibros(datos.todos, agrupar, prefs.orden, agrupar === 'GENERO' ? filtros.generos : filtros.autores)
  }, [agrupar, datos?.todos, datos?.agrupar, prefs.orden, filtros.generos, filtros.autores])

  const barra = <BarraBaldas prefs={prefs} onCambiar={cambiarPrefs} version={version} />
  const quitarFiltros = () => cambiarPrefs({ ...prefs, filtros: PREFERENCIAS_INICIALES.filtros })

  if (cargando && !datos)
    return (
      <View testID="estanteria">
        {barra}
        <Spinner />
      </View>
    )
  if (error && !datos)
    return (
      <View testID="estanteria">
        {barra}
        <EstadoError mensaje={error} onReintentar={cargar} />
      </View>
    )
  if (!datos) return null

  const columnas = columnasDeMueble(ancho)
  const escala = columnas > 1 ? 1.08 : 1
  const anchoDe = (n: number) => {
    const filas = filasDeModulos(n, columnas)
    const porFila = Math.max(...filas, 1)
    return { filas, anchoBalda: Math.max(280, (ancho - 40) / porFila - (porFila > 1 ? 12 : 0)) }
  }

  /* Cambiando de agrupación, mientras llegan los libros, una espera y no baldas vacías. */
  const esperando = datos.agrupar !== agrupar || (agrupar !== 'COLECCIONES' && !grupos)
  const nBaldas = grupos ? Math.max(1, grupos.length) : 1 + datos.estantes.length
  const { filas, anchoBalda } = anchoDe(nBaldas)

  const baldasPorGrupo = (gs: NonNullable<typeof grupos>): React.ReactElement[] =>
    gs.length
      ? gs.map((g, i) => (
          <Estante
            key={`grupo-${g.clave}`}
            id={`grupo-${g.clave}`}
            indiceBalda={i}
            titulo={g.nombre}
            libros={g.libros}
            modo={modo}
            onAbrir={onAbrir}
            anchoBalda={anchoBalda}
            escala={escala}
            acciones={
              g.resto || gs.length < 2 ? null : (
                <BotonIcono
                  icono="filtro"
                  etiqueta={`Ver solo ${g.nombre}`}
                  onPress={() =>
                    cambiarPrefs({
                      ...prefs,
                      filtros:
                        agrupar === 'GENERO'
                          ? { ...filtros, generos: [g.nombre] }
                          : { ...filtros, autores: [g.nombre] },
                    })
                  }
                  testID={`solo-${g.clave}`}
                  tamano={20}
                />
              )
            }
          />
        ))
      : [
          <Estante
            key="nada"
            id="nada"
            titulo={filtrando ? 'Nada coincide' : 'Sin libros'}
            libros={[]}
            modo={modo}
            onAbrir={onAbrir}
            anchoBalda={anchoBalda}
            escala={escala}
            vacio={
              filtrando
                ? 'Ningún libro pasa estos filtros. Prueba quitando alguno.'
                : 'Aquí aparecen los libros que vas trayendo.'
            }
            accionVacio={
              filtrando
                ? { titulo: 'Quitar filtros', icono: 'close', onPress: quitarFiltros }
                : onTraer
                  ? { titulo: 'Traer libros', icono: 'upload', onPress: onTraer }
                  : undefined
            }
          />,
        ]

  const baldas: React.ReactElement[] = grupos
    ? baldasPorGrupo(grupos)
    : [
        <Estante
          key="recientes"
          id="recientes"
          indiceBalda={0}
          titulo={filtrando ? 'Lo que coincide' : 'Recién llegados'}
          libros={datos.recientes}
          total={datos.totalRecientes}
          onVerTodos={onVerCatalogo && !filtrando ? () => onVerCatalogo('TODO', 'RECIENTES') : undefined}
          modo={modo}
          onAbrir={onAbrir}
          anchoBalda={anchoBalda}
          escala={escala}
          vacio={filtrando ? 'Ningún libro pasa estos filtros.' : 'Aquí aparecen los libros que vas trayendo.'}
          accionVacio={
            filtrando
              ? { titulo: 'Quitar filtros', icono: 'close', onPress: quitarFiltros }
              : onTraer
                ? { titulo: 'Traer libros', icono: 'upload', onPress: onTraer }
                : undefined
          }
        />,
        ...datos.estantes.map(({ estante, libros }, i) => (
          <Estante
            key={estante.id}
            indiceBalda={i + 1}
            id={estante.id}
            titulo={estante.nombre}
            libros={libros}
            modo={modo}
            colorMadera={estante.colorMadera}
            onAbrir={onAbrir}
            anchoBalda={anchoBalda}
            escala={escala}
            ordenable={estante.tipo === 'FAVORITOS'}
            ordenando={estante.tipo === 'FAVORITOS' && ordenando}
            onAlternarOrden={() => setOrdenando((o) => !o)}
            onReordenar={(d, h) => reordenar(estante.id, d, h)}
            vacio={
              estante.tipo === 'FAVORITOS'
                ? 'Marca un libro con ♥ y aparecerá aquí.'
                : 'Añade libros a esta colección desde su ficha, en «Datos».'
            }
          />
        )),
      ]

  return (
    <View testID="estanteria">
      {barra}
      <Mueble testID="mueble" grande={columnas > 1} apaisado={apaisado}>
        <Atril
          libros={datos.leyendo}
          onAbrir={onAbrir}
          onElegir={() => onVerCatalogo?.('POR_LEER', 'RECIENTES')}
          anchoPortada={apaisado ? 88 : columnas > 1 ? 140 : 104}
          onSeguir={columnas > 1 && !apaisado ? onSeguir : undefined}
          onVerTodos={() => onVerCatalogo?.('LEYENDO', 'ULTIMO_ABIERTO')}
        />
        {esperando ? (
          <Spinner />
        ) : columnas > 1 ? (
          filas.map((n, f) => {
            const desde = filas.slice(0, f).reduce((a, b) => a + b, 0)
            return (
              <View key={f} style={styles.modulos}>
                {baldas.slice(desde, desde + n).map((b, i) => (
                  <Modulo key={b.key} ancho={`${100 / n}%`} conSeparador={i > 0}>
                    {b}
                  </Modulo>
                ))}
              </View>
            )
          })
        ) : (
          baldas
        )}
      </Mueble>
    </View>
  )
}

const styles = StyleSheet.create({
  modulos: { flexDirection: 'row' },
})

export default Estanteria
