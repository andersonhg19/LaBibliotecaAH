import React, { useCallback, useEffect, useState } from 'react'

import { View } from 'react-native'

import Spinner from '@componentes/atoms/Spinner'
import Estante from '@componentes/estanteria/Estante'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import EstadoError from '@componentes/molecules/EstadoError'
import { useToast } from '@contextos/ToastContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import { movimientoDeOrden } from '@logica/orden'
import { estantesService, librosService } from '@servicios/bibliotecaService'
import type { EjemplarDTO, EstanteDTO } from '@tipos'
import { MENSAJES } from '@utils/mensajes'

interface Props {
  modo: ModoEstante
  onAbrir: (l: EjemplarDTO) => void
  /** Cambia para pedir que se recargue (tras subir, borrar, etc.). */
  version: number
}

interface Datos {
  leyendo: EjemplarDTO[]
  recientes: EjemplarDTO[]
  estantes: { estante: EstanteDTO; libros: EjemplarDTO[] }[]
}

/*
 * LA ESTANTERÍA: arriba "Leyendo ahora" (de frente, con su avance), luego
 * "Recién llegados" (por fecha de llegada), "Favoritos" (en el orden que tú
 * decidas, arrastrando) y tus colecciones.
 */
const Estanteria: React.FC<Props> = ({ modo, onAbrir, version }) => {
  const { showToast } = useToast()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [ordenando, setOrdenando] = useState(false)

  const tarea = useCallback(async () => {
    const [leyendo, recientes, estantes] = await Promise.all([
      librosService.todos({ pestana: 'LEYENDO', orden: 'ULTIMO_ABIERTO', page: 0, size: 20 }),
      librosService.todos({ pestana: 'TODO', orden: 'RECIENTES', page: 0, size: 30 }),
      estantesService.todos(),
    ])
    const lista = exigir(estantes) ?? []
    const conLibros = await Promise.all(
      lista.map(async (e) => ({ estante: e, libros: exigir(await estantesService.libros(e.id)) ?? [] })),
    )
    conLibros.sort((a, b) => (a.estante.tipo === 'FAVORITOS' ? -1 : b.estante.tipo === 'FAVORITOS' ? 1 : 0))
    setDatos({
      leyendo: exigir(leyendo)?.list ?? [],
      recientes: (exigir(recientes)?.list ?? []).filter((l) => l.tipo === 'LIBRO').slice(0, 24),
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
          leyendo: d.leyendo.map((x) => (x.id === l.id ? l : x)),
          recientes: d.recientes.map((x) => (x.id === l.id ? l : x)),
          estantes: d.estantes.map((e) => ({ ...e, libros: e.libros.map((x) => (x.id === l.id ? l : x)) })),
        },
    )
  }, [])
  usePreparacion(datos?.recientes ?? [], reemplazar)

  const reordenar = async (estanteId: string, desde: number, hasta: number) => {
    const actual = datos?.estantes.find((e) => e.estante.id === estanteId)
    if (!actual) return
    const mov = movimientoDeOrden(actual.libros, desde, hasta)
    if (!mov) return
    const antes = actual.libros
    const poner = (libros: EjemplarDTO[]) =>
      setDatos(
        (d) => d && { ...d, estantes: d.estantes.map((e) => (e.estante.id === estanteId ? { ...e, libros } : e)) },
      )
    poner(mov.lista)
    try {
      const r = await estantesService.ordenar(estanteId, mov.cuerpo)
      if (!r.correct) throw new Error(r.message)
    } catch (e) {
      console.error('[estanteria] no se pudo ordenar', e)
      poner(antes)
      showToast('error', MENSAJES.ordenFallo)
    }
  }

  if (cargando && !datos) return <Spinner />
  if (error && !datos) return <EstadoError mensaje={error} onReintentar={cargar} />
  if (!datos) return null

  return (
    <View testID="estanteria">
      <Estante
        id="leyendo"
        titulo="Leyendo ahora"
        libros={datos.leyendo}
        modo="portada"
        conProgreso
        onAbrir={onAbrir}
        vacio="Nada abierto todavía. Saca un libro y empieza."
      />
      <Estante
        id="recientes"
        titulo="Recién llegados"
        libros={datos.recientes}
        modo={modo}
        onAbrir={onAbrir}
        vacio="Trae tus primeros libros con «Traer libros»."
      />
      {datos.estantes.map(({ estante, libros }) => (
        <Estante
          key={estante.id}
          id={estante.id}
          titulo={estante.nombre}
          libros={libros}
          modo={modo}
          colorMadera={estante.colorMadera}
          onAbrir={onAbrir}
          ordenable={estante.tipo === 'FAVORITOS'}
          ordenando={estante.tipo === 'FAVORITOS' && ordenando}
          onAlternarOrden={() => setOrdenando((o) => !o)}
          onReordenar={(d, h) => reordenar(estante.id, d, h)}
          vacio={estante.tipo === 'FAVORITOS' ? 'Marca un libro con ♥ y aparecerá aquí.' : undefined}
        />
      ))}
    </View>
  )
}

export default Estanteria
