import React, { useEffect, useState } from 'react'

import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import Hoja from '@componentes/molecules/Hoja'
import SeccionFacetas from '@componentes/molecules/SeccionFacetas'
import Segmentos from '@componentes/molecules/Segmentos'
import { useTheme } from '@contextos/ThemeContext'
import { AGRUPACIONES, Agrupacion, ORDENES_BALDAS, PreferenciasEstanteria } from '@logica/agrupar'
import { alternar, chipsActivos, contarFiltros, limpiarFiltros } from '@logica/filtros'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import type { FacetasDTO } from '@tipos'

interface Props {
  prefs: PreferenciasEstanteria
  onCambiar: (p: PreferenciasEstanteria) => void
  /** Cambia al recargar la biblioteca: las facetas se vuelven a pedir al abrir la hoja. */
  version: number
}

/*
 * ARRIBA DE LA ESTANTERÍA, POCO Y CLARO (sin saturar): un control de latón
 * para agrupar las baldas (Colecciones · Géneros · Autores) y un botón de
 * filtro. Lo demás (por quién filtrar, cómo ordenar las baldas) vive en una
 * hoja. Los filtros activos se ven como chips con su ✕, los mismos del
 * catálogo (chipsActivos, Chip).
 */
const BarraBaldas: React.FC<Props> = ({ prefs, onCambiar, version }) => {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const [hoja, setHoja] = useState(false)
  const [facetas, setFacetas] = useState<FacetasDTO | null>(null)
  const { filtros } = prefs
  const chips = chipsActivos(filtros)
  const n = contarFiltros(filtros)
  const poner = (p: Partial<PreferenciasEstanteria>) => onCambiar({ ...prefs, ...p })

  /* Las facetas de los libros, cada vez que se abre la hoja (un género nuevo aparece sin recargar). */
  useEffect(() => {
    if (!hoja) return
    let vivo = true
    librosService
      .facetas('TODO')
      .then((r) => {
        if (vivo && r.correct) setFacetas(r.object)
      })
      .catch((e) => console.warn('[estanteria] facetas', e))
    return () => {
      vivo = false
    }
  }, [hoja, version])

  return (
    <View style={styles.barra} testID="barra-baldas">
      <View style={styles.fila}>
        {width >= 600 ? <Text style={[styles.rotulo, { color: colors.textSecondary }]}>Baldas por</Text> : null}
        <Segmentos<Agrupacion>
          etiqueta="Agrupar las baldas por"
          valor={prefs.agrupar}
          onCambiar={(agrupar) => poner({ agrupar })}
          opciones={AGRUPACIONES.map((a) => ({ ...a, testID: `agrupar-${a.clave}` }))}
          testID="agrupar-baldas"
        />
        <BotonIcono
          icono="filtro"
          etiqueta={`Filtrar la estantería${n ? `, ${n} activos` : ''}`}
          activo={n > 0}
          onPress={() => setHoja(true)}
          testID="filtrar-estanteria"
        />
      </View>
      {chips.length ? (
        <View style={styles.chips} testID="chips-estanteria">
          {chips.map((c) => (
            <Chip key={c.clave} etiqueta={c.etiqueta} quitable onPress={() => poner({ filtros: c.quitar(filtros) })} />
          ))}
          {chips.length > 1 ? (
            <Chip
              etiqueta="Quitar todos"
              quitable
              accessibilityLabel="Quitar todos los filtros de la estantería"
              onPress={() => poner({ filtros: limpiarFiltros(filtros) })}
            />
          ) : null}
        </View>
      ) : null}

      <Hoja visible={hoja} titulo="La estantería" onCerrar={() => setHoja(false)} testID="hoja-estanteria">
        {prefs.agrupar !== 'COLECCIONES' ? (
          <View style={styles.seccion}>
            <AppText variant="label">Orden de las baldas</AppText>
            <View style={styles.chips}>
              {ORDENES_BALDAS.map((o) => (
                <Chip
                  key={o.clave}
                  rol="radio"
                  etiqueta={o.nombre}
                  activo={prefs.orden === o.clave}
                  onPress={() => poner({ orden: o.clave })}
                  testID={`orden-baldas-${o.clave}`}
                />
              ))}
            </View>
          </View>
        ) : null}
        {!facetas ? (
          <Spinner />
        ) : (
          <>
            <SeccionFacetas
              titulo="Autor"
              valores={facetas.autores.slice(0, 30).map((x) => x.nombre)}
              activos={filtros.autores}
              onAlternar={(v) => poner({ filtros: { ...filtros, autores: alternar(filtros.autores, v) } })}
            />
            <SeccionFacetas
              titulo="Género"
              valores={facetas.generos.map((x) => x.nombre)}
              activos={filtros.generos}
              onAlternar={(v) => poner({ filtros: { ...filtros, generos: alternar(filtros.generos, v) } })}
            />
            <SeccionFacetas
              titulo="Formato"
              valores={facetas.formatos.map((x) => x.nombre)}
              activos={filtros.formatos}
              onAlternar={(v) => poner({ filtros: { ...filtros, formatos: alternar(filtros.formatos, v) } })}
            />
          </>
        )}
        <View style={styles.botones}>
          <Button
            title="Quitar filtros"
            variant="secondary"
            disabled={!n}
            onPress={() => poner({ filtros: limpiarFiltros(filtros) })}
            style={styles.flex}
          />
          <Button title="Ver la estantería" onPress={() => setHoja(false)} style={styles.flex} />
        </View>
      </Hoja>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: { paddingHorizontal: 16, gap: 6, marginBottom: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rotulo: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seccion: { gap: 6 },
  botones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  flex: { flex: 1 },
})

export default BarraBaldas
