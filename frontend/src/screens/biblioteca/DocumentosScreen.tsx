import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Spinner from '@componentes/atoms/Spinner'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import { fechaCorta, seEstaPreparando } from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import { librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes, paleta } from '@tema'
import { archivador } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

type Props = NativeStackScreenProps<Rutas, 'Documentos'>

/** Agrupa por la inicial del título: cada cajón del archivador es una letra (o un rango). */
export function cajones(docs: EjemplarDTO[]): { rotulo: string; docs: EjemplarDTO[] }[] {
  const grupos = new Map<string, EjemplarDTO[]>()
  for (const d of [...docs].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))) {
    const letra = (d.titulo.trim()[0] ?? '#').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    const k = /[A-Z]/.test(letra) ? letra : '#'
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  return [...grupos.entries()].map(([rotulo, d]) => ({ rotulo, docs: d }))
}

/*
 * MIS DOCUMENTOS (R11): no son libros de autor, así que no van en un estante
 * sino en un ARCHIVADOR de metal verde con cajones; cada cajón tiene su
 * tarjetero de latón con la letra y, dentro, las carpetas con pestaña.
 */
const DocumentosScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme()
  const [docs, setDocs] = useState<EjemplarDTO[]>([])
  const [subir, setSubir] = useState(false)
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})

  const tarea = useCallback(async () => {
    setDocs(
      exigir(await librosService.todos({ pestana: 'DOCUMENTOS', orden: 'TITULO', page: 0, size: 200 }))?.list ?? [],
    )
  }, [])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])
  usePreparacion(
    docs,
    useCallback((l: EjemplarDTO) => setDocs((d) => d.map((x) => (x.id === l.id ? l : x))), []),
  )

  const grupos = useMemo(() => cajones(docs), [docs])

  return (
    <Sala>
      <Encabezado titulo="Mis documentos" subtitulo="El archivador de la casa" atras />
      <ScrollView contentContainerStyle={styles.contenido}>
        <Button title="Traer documentos" icono="upload" onPress={() => setSubir(true)} />
        {cargando && !docs.length ? <Spinner /> : null}
        {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}
        {!cargando && !error && !docs.length ? (
          <EmptyState
            title="El archivador está vacío"
            message="Contratos, apuntes, recetas: tus documentos personales viven aquí, aparte de los libros."
            icon="archivador"
          />
        ) : null}
        <View
          style={[
            styles.mueble,
            { backgroundColor: paleta.cueroVerde },
            web({
              backgroundImage: archivador(isDark),
              boxShadow: '0 20px 40px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(0,0,0,0.25)',
            }),
          ]}
        >
          {grupos.map((g) => {
            const abierto = abiertos[g.rotulo] ?? grupos.length <= 3
            return (
              <View key={g.rotulo} style={styles.cajon}>
                <Pressable
                  onPress={() => setAbiertos((a) => ({ ...a, [g.rotulo]: !abierto }))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: abierto }}
                  accessibilityLabel={`Cajón ${g.rotulo}, ${g.docs.length} documentos. ${abierto ? 'Cerrar' : 'Abrir'}`}
                  style={[
                    styles.frente,
                    web({
                      backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.25))',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 3px 0 rgba(0,0,0,0.35)',
                      cursor: 'pointer',
                    }),
                  ]}
                >
                  <View style={[styles.tarjetero, { borderColor: '#C9A227' }]}>
                    <Text style={styles.rotulo}>{g.rotulo}</Text>
                  </View>
                  <View
                    style={[styles.tirador, web({ backgroundImage: 'linear-gradient(180deg, #F0D58A, #9C7A22)' })]}
                  />
                  <Text style={styles.cuenta}>
                    {g.docs.length} {abierto ? '▾' : '▸'}
                  </Text>
                </Pressable>
                {abierto ? (
                  <View style={[styles.interior, { backgroundColor: isDark ? '#1C2A22' : '#E9E2CC' }]}>
                    {g.docs.map((d) => (
                      <Pressable
                        key={d.id}
                        onPress={() => navigation.navigate('Libro', { id: d.id })}
                        accessibilityRole="button"
                        accessibilityLabel={`Documento ${d.titulo}${seEstaPreparando(d) ? ', preparando' : ''}`}
                        style={[
                          styles.carpeta,
                          { backgroundColor: paleta.pergamino },
                          web({ boxShadow: '0 2px 4px rgba(0,0,0,0.3)', cursor: 'pointer' }),
                        ]}
                      >
                        <View style={[styles.pestanaCarpeta, { backgroundColor: paleta.pergamino }]} />
                        <Text style={styles.carpetaTitulo} numberOfLines={1}>
                          {d.titulo}
                        </Text>
                        <Text style={styles.carpetaMeta}>
                          {[d.formatoOriginal, fechaCorta(d.fechaLlegada), seEstaPreparando(d) ? 'preparando…' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
        <Text style={[styles.pie, { color: colors.textMuted }]}>{docs.length} documentos</Text>
      </ScrollView>
      <SubirLibros visible={subir} tipoInicial="DOCUMENTO" onCerrar={() => setSubir(false)} onSubidos={cargar} />
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 16, paddingBottom: 120, maxWidth: 760, width: '100%', alignSelf: 'center' },
  mueble: { borderRadius: 8, padding: 12, gap: 12 },
  cajon: { gap: 0 },
  frente: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: '#3C5A48',
    gap: 14,
  },
  tarjetero: {
    borderWidth: 2,
    borderRadius: 3,
    backgroundColor: '#F3E9D2',
    minWidth: 46,
    alignItems: 'center',
    paddingVertical: 2,
  },
  rotulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, color: '#2B1A10' },
  tirador: {
    flex: 1,
    height: 10,
    marginHorizontal: 30,
    borderRadius: 5,
    backgroundColor: '#C9A227',
    maxWidth: 140,
    alignSelf: 'center',
  },
  cuenta: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm, color: '#F3E9D2', marginLeft: 'auto' },
  interior: { padding: 10, gap: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  carpeta: { padding: 12, paddingTop: 16, borderRadius: 3, minHeight: 56 },
  pestanaCarpeta: {
    position: 'absolute',
    top: -8,
    left: 14,
    width: 70,
    height: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  carpetaTitulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md, color: '#2B1A10' },
  carpetaMeta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, color: '#4A2E1C' },
  pie: { textAlign: 'center', fontFamily: fuentes.ui, fontSize: fontSize.xs },
})

export default DocumentosScreen
