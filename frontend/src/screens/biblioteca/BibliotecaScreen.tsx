import React, { useCallback, useEffect, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import AppText from '@componentes/atoms/Text'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import Sala from '@componentes/molecules/Sala'
import { ZONA_HORARIA } from '@config'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import type { Rutas } from '@navegacion/linking'
import { Escudo } from '@pantallas/auth/LoginScreen'
import Catalogo from '@pantallas/biblioteca/Catalogo'
import Estanteria from '@pantallas/biblioteca/Estanteria'
import NuevoDeseo from '@pantallas/biblioteca/NuevoDeseo'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import FichaLibro from '@pantallas/libro/FichaLibro'
import { fontSize, fuentes } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

type Props = NativeStackScreenProps<Rutas, 'Biblioteca'>
type Vista = 'estanteria' | 'catalogo'

const CLAVE_VISTA = '@biblioteca_ah_vista'

/** "Buenas noches", según la hora de la casa. */
export function saludo(fecha: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: 'numeric', hour12: false }).format(fecha),
  )
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/*
 * MI BIBLIOTECA (prioridad #1). Dos maneras de mirarla:
 *   · la ESTANTERÍA, inmersiva: lomos (o portadas) sobre tablas de roble;
 *   · el CATÁLOGO, para buscar: pestañas, filtros, orden.
 * En el PC, al tocar un libro su ficha se abre en un panel a la derecha y la
 * estantería sigue a la vista; en el teléfono se abre la ficha completa.
 */
const BibliotecaScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme()
  const { user } = useAuth()
  const { width } = useWindowDimensions()
  const [vista, setVista] = useState<Vista>('estanteria')
  const [modo, setModo] = useState<ModoEstante>('lomo')
  const [version, setVersion] = useState(0)
  const [subir, setSubir] = useState(false)
  const [deseo, setDeseo] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const escritorio = width >= 1100
  const estrecho = width < 520

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_VISTA)
      .then((g) => {
        if (!g) return
        const [v, m] = g.split('|')
        if (v === 'estanteria' || v === 'catalogo') setVista(v)
        if (m === 'lomo' || m === 'portada') setModo(m)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    AsyncStorage.setItem(CLAVE_VISTA, `${vista}|${modo}`).catch(() => {})
  }, [vista, modo])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])
  const abrir = useCallback(
    (l: EjemplarDTO) => {
      if (escritorio) setSeleccion(l.id)
      else navigation.navigate('Libro', { id: l.id })
    },
    [escritorio, navigation],
  )

  const cabecera = (
    <View style={styles.cabecera}>
      <View style={styles.marca}>
        <Escudo tamano={estrecho ? 44 : 52} />
        <View style={styles.flex}>
          <Text style={[styles.saludo, { color: colors.textSecondary }]}>
            {saludo()}, {user?.name?.split(' ')[0] ?? 'lector'}
          </Text>
          <AppText
            variant="display"
            style={[styles.nombre, estrecho && styles.nombreEstrecho]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Mi biblioteca
          </AppText>
        </View>
        <View style={styles.acciones}>
          <BotonIcono icono="archivador" etiqueta="Mis documentos" onPress={() => navigation.navigate('Documentos')} />
          <BotonIcono icono="nota" etiqueta="Mis notas" onPress={() => navigation.navigate('Notas')} />
          <BotonIcono icono="settings" etiqueta="Ajustes" onPress={() => navigation.navigate('Ajustes')} />
        </View>
      </View>
      <View style={styles.barraAcciones}>
        <Pressable
          onPress={() => setSubir(true)}
          accessibilityRole="button"
          accessibilityLabel="Traer libros"
          testID="traer-libros"
          style={({ pressed }) => [
            styles.traer,
            { backgroundColor: colors.primary },
            web({
              backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(0,0,0,0.12))',
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              cursor: 'pointer',
            }),
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={[styles.traerTexto, { color: textoLegibleSobre(colors.primary) }]}>＋ Traer libros</Text>
        </Pressable>
        <BotonIcono icono="deseo" etiqueta="Añadir a deseos" onPress={() => setDeseo(true)} testID="nuevo-deseo" />
        <View style={styles.flex} />
        <View
          style={[styles.segmentos, { borderColor: colors.border, backgroundColor: colors.card }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Cómo ver la biblioteca"
        >
          {(
            [
              ['estanteria', 'Estantería', 'lomos'],
              ['catalogo', 'Catálogo', 'lista'],
            ] as [Vista, string, string][]
          ).map(([v, n]) => (
            <Pressable
              key={v}
              onPress={() => setVista(v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: vista === v }}
              accessibilityLabel={n}
              testID={`vista-${v}`}
              style={[
                styles.segmento,
                vista === v && { backgroundColor: colors.surfaceLight, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.segmentoTexto, { color: vista === v ? colors.primary : colors.textSecondary }]}>
                {vista === v ? '● ' : ''}
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        {vista === 'estanteria' ? (
          <BotonIcono
            icono={modo === 'lomo' ? 'rejilla' : 'lomos'}
            etiqueta={modo === 'lomo' ? 'Ver portadas' : 'Ver lomos'}
            onPress={() => setModo((m) => (m === 'lomo' ? 'portada' : 'lomo'))}
            testID="alternar-lomos"
          />
        ) : null}
      </View>
      {vista === 'estanteria' ? (
        <Text style={[styles.pista, { color: colors.textMuted }]}>
          Toca un libro para ver su ficha · mantén pulsado y arrástralo hacia arriba para sacarlo y abrirlo
        </Text>
      ) : null}
    </View>
  )

  const principal =
    vista === 'catalogo' ? (
      <Catalogo cabecera={cabecera} onAbrir={abrir} version={version} />
    ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        {cabecera}
        <View style={styles.estanteria}>
          <Estanteria modo={modo} onAbrir={abrir} version={version} />
        </View>
      </ScrollView>
    )

  return (
    <Sala testID="pantalla-biblioteca">
      <View style={styles.fila}>
        <View style={styles.flex}>{principal}</View>
        {escritorio && seleccion ? (
          <View
            style={[
              styles.panel,
              { backgroundColor: colors.surface, borderLeftColor: colors.primaryLight },
              web({ boxShadow: '-12px 0 40px rgba(0,0,0,0.35)' }),
            ]}
          >
            <View style={styles.panelBarra}>
              <AppText variant="label">Ficha</AppText>
              <View style={styles.flex} />
              <BotonIcono
                icono="libroAbierto"
                etiqueta="Abrir la ficha a pantalla completa"
                onPress={() => navigation.navigate('Libro', { id: seleccion })}
              />
              <BotonIcono icono="close" etiqueta="Cerrar la ficha" onPress={() => setSeleccion(null)} />
            </View>
            <ScrollView contentContainerStyle={styles.scroll}>
              <FichaLibro
                key={seleccion}
                ejemplarId={seleccion}
                embebida
                onCambio={recargar}
                onCerrar={() => setSeleccion(null)}
              />
            </ScrollView>
          </View>
        ) : null}
      </View>
      <SubirLibros visible={subir} onCerrar={() => setSubir(false)} onSubidos={recargar} />
      <NuevoDeseo visible={deseo} onCerrar={() => setDeseo(false)} onCreado={recargar} />
    </Sala>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flex: 1, flexDirection: 'row' },
  scroll: { paddingBottom: 120 },
  cabecera: { paddingHorizontal: 16, paddingTop: 18, gap: 10, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saludo: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
  nombre: { fontSize: 38, lineHeight: 42 },
  nombreEstrecho: { fontSize: 30, lineHeight: 34 },
  acciones: { flexDirection: 'row' },
  barraAcciones: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  traer: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' },
  traerTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
  segmentos: { flexDirection: 'row', borderWidth: 1, borderRadius: 22, padding: 2 },
  segmento: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentoTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  pista: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.sm },
  estanteria: { maxWidth: 1400, width: '100%', alignSelf: 'center', marginTop: 12 },
  panel: { width: 440, borderLeftWidth: 1 },
  panelBarra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
})

export default BibliotecaScreen
