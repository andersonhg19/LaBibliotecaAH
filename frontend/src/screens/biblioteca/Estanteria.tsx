import React, { useCallback, useEffect, useRef, useState } from 'react'

import { StyleSheet, View } from 'react-native'

import Spinner from '@componentes/atoms/Spinner'
import Atril from '@componentes/estanteria/Atril'
import Estante from '@componentes/estanteria/Estante'
import Mueble, { Modulo } from '@componentes/estanteria/Mueble'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import EstadoError from '@componentes/molecules/EstadoError'
import { useToast } from '@contextos/ToastContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
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
  const [datos, setDatos] = useState<Datos | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const ordenEnCurso = useRef(false)

  const tarea = useCallback(async () => {
    const [leyendo, recientes, estantes] = await Promise.all([
      librosService.todos({ pestana: 'LEYENDO', orden: 'ULTIMO_ABIERTO', page: 0, size: 20 }),
      pedirRecientes(),
      estantesService.todos(),
    ])
    const lista = exigir(estantes) ?? []
    const conLibros = await Promise.all(
      lista.map(async (e) => ({ estante: e, libros: exigir(await estantesService.libros(e.id)) ?? [] })),
    )
    conLibros.sort((a, b) => (a.estante.tipo === 'FAVORITOS' ? -1 : b.estante.tipo === 'FAVORITOS' ? 1 : 0))
    setDatos({
      leyendo: (exigir(leyendo)?.list ?? []).filter((l) => l.tipo === 'LIBRO'),
      recientes: recientes.libros,
      totalRecientes: recientes.total,
      estantes: conLibros,
    })
  }, [])
  const { cargando, error, cargar } = useCarga(tarea)

  useEffect(() => {
    cargar()
  }, [cargar, version])

  const reemplazar = useCallback((l: EjemplarDTO) => {
    setDatos(
      (d) =>
        d && {
          ...d,
          leyendo: d.leyendo.map((x) => (x.id === l.id ? l : x)),
          recientes: d.recientes.map((x) => (x.id === l.id ? l : x)),
          estantes: d.estantes.map((e) => ({ ...e, libros: e.libros.map((x) => (x.id === l.id ? l : x)) })),
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

  if (cargando && !datos) return <Spinner />
  if (error && !datos) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!datos) return null

  const columnas = columnasDeMueble(ancho)
  const escala = columnas > 1 ? 1.08 : 1
  const filas = filasDeModulos(1 + datos.estantes.length, columnas)
  const porFila = Math.max(...filas, 1)
  const anchoBalda = Math.max(280, (ancho - 40) / porFila - (porFila > 1 ? 12 : 0))

  const baldas: React.ReactElement[] = [
    <Estante
      key="recientes"
      id="recientes"
      indiceBalda={0}
      titulo="Recién llegados"
      libros={datos.recientes}
      total={datos.totalRecientes}
      onVerTodos={onVerCatalogo ? () => onVerCatalogo('TODO', 'RECIENTES') : undefined}
      modo={modo}
      onAbrir={onAbrir}
      anchoBalda={anchoBalda}
      escala={escala}
      vacio="Aquí aparecen los libros que vas trayendo."
      accionVacio={onTraer ? { titulo: 'Traer libros', icono: 'upload', onPress: onTraer } : undefined}
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
      <Mueble testID="mueble" grande={columnas > 1} apaisado={apaisado}>
        <Atril
          libros={datos.leyendo}
          onAbrir={onAbrir}
          onElegir={() => onVerCatalogo?.('POR_LEER', 'RECIENTES')}
          anchoPortada={apaisado ? 88 : columnas > 1 ? 140 : 104}
          onSeguir={columnas > 1 && !apaisado ? onSeguir : undefined}
          onVerTodos={() => onVerCatalogo?.('LEYENDO', 'ULTIMO_ABIERTO')}
        />
        {columnas > 1
          ? filas.map((n, f) => {
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
          : baldas}
      </Mueble>
    </View>
  )
}

const styles = StyleSheet.create({
  modulos: { flexDirection: 'row' },
})

export default Estanteria
