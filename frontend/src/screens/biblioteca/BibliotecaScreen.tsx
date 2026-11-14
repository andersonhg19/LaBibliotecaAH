import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Icono from '@componentes/atoms/Icono'
import AppText from '@componentes/atoms/Text'
import GuiaSacar from '@componentes/estanteria/GuiaSacar'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import Hoja from '@componentes/molecules/Hoja'
import Sala from '@componentes/molecules/Sala'
import Segmentos from '@componentes/molecules/Segmentos'
import { ZONA_HORARIA } from '@config'
import { useAuth } from '@contextos/AuthContext'
import { useTheme } from '@contextos/ThemeContext'
import type { Rutas } from '@navegacion/linking'
import { Escudo } from '@pantallas/auth/LoginScreen'
import Catalogo, { PedidoCatalogo } from '@pantallas/biblioteca/Catalogo'
import Colecciones from '@pantallas/biblioteca/Colecciones'
import Estanteria from '@pantallas/biblioteca/Estanteria'
import NuevoDeseo from '@pantallas/biblioteca/NuevoDeseo'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import { FLOTANTE, HUECO_FLOTANTE, esApaisado } from '@pantallas/biblioteca/flotante'
import FichaLibro from '@pantallas/libro/FichaLibro'
import { fontSize, fuentes } from '@tema'
import { textoLegibleSobre } from '@tema/contraste'
import { laton } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO, Orden, Pestana } from '@tipos'

type Props = NativeStackScreenProps<Rutas, 'Biblioteca'>
type Vista = 'estanteria' | 'catalogo'

const CLAVE_VISTA = '@biblioteca_ah_vista'
export const CLAVE_GUIA = '@biblioteca_ah_guia_sacar'

/** "Buenas noches", según la hora de la casa. */
export function saludo(fecha: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: 'numeric', hour12: false }).format(fecha),
  )
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Cabecera compacta: en el teléfono y en cualquier pantalla baja (horizontal, UX-12). */
export const usaCabeceraCompacta = (ancho: number, alto: number) => ancho < 600 || alto < 520

/*
 * MI BIBLIOTECA (prioridad #1). Dos maneras de mirarla:
 *   · la ESTANTERÍA, inmersiva: un mueble de roble con su lámpara;
 *   · el CATÁLOGO, para buscar: pestañas, filtros, orden.
 * En el PC, al tocar un libro su ficha se abre en un panel a la derecha y la
 * estantería sigue a la vista; en el teléfono se abre la ficha completa.
 *
 * En el teléfono (y en horizontal) la cabecera es UNA barra de 56 px: escudo,
 * nombre, alternar vista y un menú "⋯"; "Traer libros" pasa a un botón
 * flotante de latón (plan de diseño C). Antes la cabecera se comía la pantalla.
 */
/** El «+» encogido mide 44 px (el mínimo táctil) en vez de 60. */
export const FLOTANTE_ENCOGIDO = 44 / 60

/**
 * ¿Se está bajando por la lista? Escucha el desplazamiento de cualquier lista
 * de la pantalla (fase de captura: los scroll no suben) y dice si encoger.
 */
function useFlotanteEncogido(activo: boolean): boolean {
  const [encogido, setEncogido] = useState(false)
  useEffect(() => {
    if (!activo || typeof document === 'undefined' || typeof window === 'undefined') return
    const ultimos = new WeakMap<EventTarget, number>()
    const alDesplazar = (e: Event) => {
      const t = e.target as (HTMLElement & Document) | null
      if (!t) return
      const y = (t as HTMLElement).scrollTop ?? window.scrollY ?? 0
      const antes = ultimos.get(t) ?? 0
      ultimos.set(t, y)
      if (y - antes > 6 && y > 40) setEncogido(true)
      else if (antes - y > 6 || y <= 40) setEncogido(false)
    }
    document.addEventListener('scroll', alDesplazar, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', alDesplazar, { capture: true } as EventListenerOptions)
  }, [activo])
  return encogido
}

const BibliotecaScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme()
  const { user } = useAuth()
  const { width, height } = useWindowDimensions()
  const [vista, setVista] = useState<Vista>('estanteria')
  const [modo, setModo] = useState<ModoEstante>('lomo')
  const [version, setVersion] = useState(0)
  const [subir, setSubir] = useState(false)
  const [deseo, setDeseo] = useState(false)
  const [colecciones, setColecciones] = useState(false)
  const [menu, setMenu] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [pedido, setPedido] = useState<PedidoCatalogo | null>(null)
  const [guia, setGuia] = useState(false)
  const escritorio = width >= 1100
  const compacta = usaCabeceraCompacta(width, height)
  const horizontal = compacta && esApaisado(height)
  /*
   * E6 (validación 0.4.0): en un teléfono pequeño (SE, 320) el «+» flotante caía encima de la primera balda y
   * tapaba un libro. Ahí va en la cabecera, junto a las otras dos acciones, y no flota.
   */
  const masEnCabecera = compacta && !horizontal && (width < 360 || height < 700)
  /* UX5-06: al bajar por la lista el «+» se encoge (tapa menos); al subir vuelve. */
  const encogido = useFlotanteEncogido(compacta)

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_VISTA)
      .then((g) => {
        if (!g) return
        const [v, m] = g.split('|')
        if (v === 'estanteria' || v === 'catalogo') setVista(v)
        if (m === 'lomo' || m === 'portada') setModo(m)
      })
      .catch(() => {})
    AsyncStorage.getItem(CLAVE_GUIA)
      .then((g) => setGuia(!g))
      .catch(() => {})
  }, [])
  useEffect(() => {
    AsyncStorage.setItem(CLAVE_VISTA, `${vista}|${modo}`).catch(() => {})
  }, [vista, modo])

  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  /* Al volver de la ficha o del lector, la estantería se pone al día (BI-03):
     en el teléfono la ficha es otra pantalla y no avisaba de sus cambios. */
  const primerFoco = useRef(true)
  useEffect(() => {
    const quitar = navigation.addListener?.('focus', () => {
      if (primerFoco.current) {
        primerFoco.current = false
        return
      }
      recargar()
    })
    return () => quitar?.()
  }, [navigation, recargar])

  const abrir = useCallback(
    (l: EjemplarDTO) => {
      if (escritorio) setSeleccion(l.id)
      else navigation.navigate('Libro', { id: l.id })
    },
    [escritorio, navigation],
  )

  const verCatalogo = useCallback((pestana: Pestana, orden: Orden) => {
    setPedido((p) => ({ pestana, orden, n: (p?.n ?? 0) + 1 }))
    setVista('catalogo')
  }, [])

  const entendido = () => {
    setGuia(false)
    AsyncStorage.setItem(CLAVE_GUIA, 'visto').catch(() => {})
  }

  const nombre = user?.name?.split(' ')[0] ?? 'lector'

  const segmentos = (
    <Segmentos<Vista>
      etiqueta="Cómo ver la biblioteca"
      valor={vista}
      onCambiar={setVista}
      opciones={[
        { clave: 'estanteria', nombre: 'Estantería', testID: 'vista-estanteria' },
        { clave: 'catalogo', nombre: 'Catálogo', testID: 'vista-catalogo' },
      ]}
    />
  )

  const botonTraer = (flotante: boolean) => (
    <Pressable
      onPress={() => setSubir(true)}
      accessibilityRole="button"
      accessibilityLabel="Traer libros"
      testID="traer-libros"
      style={({ pressed }) => [
        flotante ? styles.flotante : styles.traer,
        { backgroundColor: colors.primary },
        web({
          backgroundImage: isDark
            ? `linear-gradient(180deg, rgba(255,255,255,0.25), rgba(0,0,0,0.12)), ${laton}`
            : 'linear-gradient(180deg, #A9603A 0%, #8E4A22 50%, #6F3717 100%)',
          boxShadow: '0 8px 22px rgba(20,10,4,0.5), inset 0 1px 0 rgba(255,245,215,0.6)',
          cursor: 'pointer',
        }),
        pressed && { opacity: 0.85 },
      ]}
    >
      {flotante ? (
        <Icono nombre="plus" color={isDark ? '#2B1A10' : textoLegibleSobre(colors.primary)} tamano={26} />
      ) : (
        <Text style={[styles.traerTexto, { color: isDark ? '#2B1A10' : textoLegibleSobre(colors.primary) }]}>
          ＋ Traer libros
        </Text>
      )}
    </Pressable>
  )

  const cabecera = compacta ? (
    <View style={[styles.compacta, horizontal && styles.compactaBaja]} testID="cabecera-compacta">
      <Escudo tamano={horizontal ? 32 : 40} />
      <View style={horizontal ? undefined : styles.flex}>
        {!horizontal ? (
          <Text style={[styles.saludoCompacto, { color: colors.textSecondary }]} numberOfLines={1}>
            {/* E8: en 320 px, con el «+» en la cabecera, el nombre no cabe: solo el saludo. */}
            {width < 360 ? saludo() : `${saludo()}, ${nombre}`}
          </Text>
        ) : null}
        <AppText
          variant="display"
          style={horizontal || width < 360 ? styles.nombreBajo : styles.nombreCompacto}
          numberOfLines={1}
        >
          Mi biblioteca
        </AppText>
      </View>
      {horizontal && vista === 'estanteria' ? <View style={styles.flex} /> : null}
      {masEnCabecera ? (
        <BotonIcono icono="plus" etiqueta="Traer libros" onPress={() => setSubir(true)} testID="traer-libros" />
      ) : null}
      <BotonIcono
        icono={vista === 'estanteria' ? 'lista' : 'lomos'}
        etiqueta={vista === 'estanteria' ? 'Ver el catálogo' : 'Ver la estantería'}
        onPress={() => setVista((v) => (v === 'estanteria' ? 'catalogo' : 'estanteria'))}
        testID="vista-alternar"
      />
      <BotonIcono icono="more" etiqueta="Más opciones" onPress={() => setMenu(true)} testID="menu-biblioteca" />
    </View>
  ) : (
    <View style={styles.cabecera}>
      <View style={styles.marca}>
        <Escudo tamano={52} />
        <View style={styles.flex}>
          <Text style={[styles.saludo, { color: colors.textSecondary }]}>
            {saludo()}, {nombre}
          </Text>
          <AppText variant="display" style={styles.nombre} numberOfLines={1} adjustsFontSizeToFit>
            Mi biblioteca
          </AppText>
        </View>
        <View style={styles.acciones}>
          <BotonIcono icono="archivador" etiqueta="Mis documentos" onPress={() => navigation.navigate('Documentos')} />
          <BotonIcono icono="nota" etiqueta="Mis notas" onPress={() => navigation.navigate('Notas')} />
          <BotonIcono
            icono="barras"
            etiqueta="Tus lecturas"
            onPress={() => navigation.navigate('Estadisticas')}
            testID="abrir-estadisticas"
          />
          <BotonIcono icono="settings" etiqueta="Ajustes" onPress={() => navigation.navigate('Ajustes')} />
        </View>
      </View>
      <View style={styles.barraAcciones}>
        {botonTraer(false)}
        <BotonIcono icono="deseo" etiqueta="Añadir a deseos" onPress={() => setDeseo(true)} testID="nuevo-deseo" />
        <BotonIcono
          icono="lomos"
          etiqueta="Tus colecciones"
          onPress={() => setColecciones(true)}
          testID="abrir-colecciones"
        />
        <View style={styles.flex} />
        {segmentos}
        {vista === 'estanteria' ? (
          <BotonIcono
            icono={modo === 'lomo' ? 'rejilla' : 'lomos'}
            etiqueta={modo === 'lomo' ? 'Ver portadas' : 'Ver lomos'}
            onPress={() => setModo((m) => (m === 'lomo' ? 'portada' : 'lomo'))}
            testID="alternar-lomos"
          />
        ) : null}
      </View>
    </View>
  )

  const anchoEstanteria = Math.min(1400, escritorio && seleccion ? width - 440 : width)

  const principal =
    vista === 'catalogo' ? (
      <Catalogo cabecera={cabecera} onAbrir={abrir} version={version} pedido={pedido} />
    ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        {cabecera}
        {/* UX5-07: en horizontal la pista no se enseña (vuelve en vertical hasta tocar «Entendido»). */}
        {guia && !horizontal ? <GuiaSacar onEntendido={entendido} compacta={compacta} /> : null}
        <View style={styles.estanteria}>
          <Estanteria
            modo={modo}
            onAbrir={abrir}
            version={version}
            ancho={anchoEstanteria}
            apaisado={horizontal}
            onVerCatalogo={verCatalogo}
            onTraer={() => setSubir(true)}
          />
        </View>
      </ScrollView>
    )

  const opcionesMenu: { icono: string; nombre: string; accion: () => void; testID?: string }[] = [
    { icono: 'archivador', nombre: 'Mis documentos', accion: () => navigation.navigate('Documentos') },
    { icono: 'nota', nombre: 'Mis notas', accion: () => navigation.navigate('Notas') },
    {
      icono: 'barras',
      nombre: 'Tus lecturas',
      accion: () => navigation.navigate('Estadisticas'),
      testID: 'abrir-estadisticas',
    },
    { icono: 'lomos', nombre: 'Tus colecciones', accion: () => setColecciones(true), testID: 'abrir-colecciones' },
    { icono: 'deseo', nombre: 'Añadir a deseos', accion: () => setDeseo(true), testID: 'nuevo-deseo' },
    {
      icono: modo === 'lomo' ? 'rejilla' : 'lomos',
      nombre: modo === 'lomo' ? 'Ver portadas en la estantería' : 'Ver lomos en la estantería',
      accion: () => {
        setModo((m) => (m === 'lomo' ? 'portada' : 'lomo'))
        setVista('estanteria')
      },
    },
    { icono: 'settings', nombre: 'Ajustes', accion: () => navigation.navigate('Ajustes') },
  ]

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
      {compacta && !masEnCabecera ? (
        <View
          style={[
            styles.flotanteHueco,
            horizontal && styles.flotanteBajo,
            web({
              transform: encogido ? `scale(${FLOTANTE_ENCOGIDO})` : 'none',
              transformOrigin: 'bottom right',
              transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)',
            }),
          ]}
          testID="flotante-traer"
        >
          {botonTraer(true)}
        </View>
      ) : null}
      <Hoja visible={menu} titulo="Mi biblioteca" onCerrar={() => setMenu(false)} testID="hoja-menu">
        {opcionesMenu.map((o) => (
          <Pressable
            key={o.nombre}
            onPress={() => {
              setMenu(false)
              o.accion()
            }}
            accessibilityRole="button"
            accessibilityLabel={o.nombre}
            testID={o.testID ? `menu-${o.testID}` : undefined}
            style={({ pressed }) => [
              styles.opcion,
              { borderBottomColor: colors.border },
              pressed && { opacity: 0.7 },
              web({ cursor: 'pointer' }),
            ]}
          >
            <Icono nombre={o.icono} color={colors.primary} />
            <Text style={[styles.opcionTexto, { color: colors.text }]}>{o.nombre}</Text>
            <Icono nombre="right" color={colors.textMuted} />
          </Pressable>
        ))}
      </Hoja>
      <SubirLibros visible={subir} onCerrar={() => setSubir(false)} onSubidos={recargar} />
      <NuevoDeseo visible={deseo} onCerrar={() => setDeseo(false)} onCreado={recargar} />
      <Colecciones visible={colecciones} onCerrar={() => setColecciones(false)} onCambio={recargar} />
    </Sala>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flex: 1, flexDirection: 'row' },
  scroll: { paddingBottom: HUECO_FLOTANTE },
  cabecera: { paddingHorizontal: 16, paddingTop: 18, gap: 10, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  compacta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 56,
  },
  compactaBaja: { paddingTop: 2, paddingBottom: 2, paddingHorizontal: 6, minHeight: 48, gap: 4 },
  nombreBajo: { fontSize: 22, lineHeight: 26 },
  saludoCompacto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.sm, lineHeight: 18 },
  nombreCompacto: { fontSize: 28, lineHeight: 32 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saludo: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
  nombre: { fontSize: 38, lineHeight: 42 },
  acciones: { flexDirection: 'row' },
  barraAcciones: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  traer: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center' },
  traerTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
  flotanteHueco: { position: 'absolute', right: FLOTANTE.derecha, bottom: FLOTANTE.abajo },
  /* En horizontal el «+» baja a la esquina: a 96 px quedaba en mitad de una pantalla de 390. */
  flotanteBajo: { bottom: 20 },
  flotante: {
    width: FLOTANTE.tamano,
    height: FLOTANTE.tamano,
    borderRadius: FLOTANTE.tamano / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estanteria: { maxWidth: 1400, width: '100%', alignSelf: 'center', marginTop: 12 },
  panel: { width: 440, borderLeftWidth: 1 },
  panelBarra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  opcionTexto: { flex: 1, fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
})

export default BibliotecaScreen
