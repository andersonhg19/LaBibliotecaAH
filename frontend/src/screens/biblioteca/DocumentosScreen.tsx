import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import Spinner from '@componentes/atoms/Spinner'
import { BorrarCarpeta, ElegirCarpeta, NombreCarpeta } from '@componentes/documentos/DialogosCarpeta'
import MenuAcciones, { type AccionDeMenu } from '@componentes/documentos/MenuAcciones'
import TarjetaCarpeta from '@componentes/documentos/TarjetaCarpeta'
import TarjetaDocumento from '@componentes/documentos/TarjetaDocumento'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado, { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, mensajeDeError, useCarga } from '@hooks/useCarga'
import { usePreparacion } from '@hooks/usePreparacion'
import { destinoAlBorrar } from '@logica/carpetas'
import { destinoAlAbrir } from '@logica/documentos'
import { plural } from '@logica/formato'
import type { Rutas } from '@navegacion/linking'
import SubirLibros from '@pantallas/biblioteca/SubirLibros'
import { carpetasService, librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes, paleta } from '@tema'
import { archivador } from '@tema/madera'
import { placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import type { CarpetaContenidoDTO, CarpetaDTO, EjemplarDTO, OrdenCarpeta } from '@tipos'
import { confirmarAccion } from '@utils/confirmar'
import { MENSAJES } from '@utils/mensajes'

type Props = NativeStackScreenProps<Rutas, 'Documentos'>

/** Agrupa por la inicial del título (el archivador por letras de antes; se conserva para quien lo use). */
export function cajones(docs: EjemplarDTO[]): { rotulo: string; docs: EjemplarDTO[] }[] {
  const grupos = new Map<string, EjemplarDTO[]>()
  for (const d of [...docs].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))) {
    /* La Ñ es su propio cajón (BI-26): al quitar las tildes con NFD se perdía la virgulilla. */
    const inicial = (d.titulo.trim()[0] ?? '#').toUpperCase()
    const letra = inicial === 'Ñ' ? 'Ñ' : inicial.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const k = /[A-ZÑ]/.test(letra) ? letra : '#'
    grupos.set(k, [...(grupos.get(k) ?? []), d])
  }
  return [...grupos.entries()].map(([rotulo, d]) => ({ rotulo, docs: d }))
}

const ORDENES: { clave: OrdenCarpeta; nombre: string }[] = [
  { clave: 'NOMBRE', nombre: 'Por nombre' },
  { clave: 'RECIENTES', nombre: 'Más recientes primero' },
  { clave: 'ANTIGUOS', nombre: 'Más antiguos primero' },
]

type Menu = { titulo: string; acciones: AccionDeMenu[] } | null
type Mover = { titulo: string; actual: string | null; carpeta?: CarpetaDTO; documentos?: string[] } | null

/*
 * MIS DOCUMENTOS (R11, contrato v1.6): un ARCHIVADOR de metal verde con
 * carpetas colgantes de cartulina kraft y, dentro, hojas de papel con el icono
 * de su tipo. Carpetas y subcarpetas, migas de pan de latón, buscar dentro,
 * ordenar, subir directamente aquí y mover (uno o varios). A la vista, solo
 * lo de todos los días —subir, nueva carpeta, buscar— y el resto en «⋯».
 *
 * La carpeta abierta va en la URL (/documentos?carpeta=…): atrás del
 * navegador sube un nivel y recargar te deja donde estabas.
 */
const DocumentosScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, isDark } = useTheme()
  const { showToast } = useToast()
  const { width } = useWindowDimensions()
  const carpetaId = route.params?.carpeta ?? null
  const [datos, setDatos] = useState<CarpetaContenidoDTO | null>(null)
  const [orden, setOrden] = useState<OrdenCarpeta>('NOMBRE')
  const [texto, setTexto] = useState('')
  const [buscado, setBuscado] = useState('')
  const [subir, setSubir] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [nombre, setNombre] = useState<{ carpeta: CarpetaDTO | null } | null>(null)
  const [borrar, setBorrar] = useState<CarpetaDTO | null>(null)
  const [mover, setMover] = useState<Mover>(null)
  const [todas, setTodas] = useState<CarpetaDTO[]>([])
  const peticion = useRef(0)

  /* Buscar mientras se escribe, sin pedir en cada letra. */
  useEffect(() => {
    const t = setTimeout(() => setBuscado(texto.trim()), 300)
    return () => clearTimeout(t)
  }, [texto])

  const tarea = useCallback(async () => {
    const n = ++peticion.current
    const r = exigir(await carpetasService.contenido({ carpetaId, texto: buscado, orden }))
    if (n === peticion.current && r) setDatos(r)
  }, [carpetaId, buscado, orden])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])
  /* Al cambiar de carpeta se sale de la selección. */
  useEffect(() => setSeleccion(null), [carpetaId])

  const documentos = useMemo(() => datos?.documentos ?? [], [datos])
  usePreparacion(
    documentos,
    useCallback(
      (l: EjemplarDTO) =>
        setDatos((d) =>
          d ? { ...d, documentos: d.documentos.map((x) => (x.id === l.id ? { ...l, carpetaId: x.carpetaId } : x)) } : d,
        ),
      [],
    ),
  )

  const actual = datos?.carpeta ?? null
  const ruta = datos?.ruta ?? []
  const ancho = width >= 820

  // ---------------------------------------------------------------- navegar

  const abrirCarpeta = (id: string | null) => {
    if (id === carpetaId) return
    navigation.push('Documentos', id ? { carpeta: id } : undefined)
    setTexto('')
  }

  const abrirDocumento = (d: EjemplarDTO) => {
    const destino = destinoAlAbrir(d)
    navigation.navigate(destino.ruta, destino.params)
  }

  // ---------------------------------------------------------------- acciones

  const cargarTodas = async () => {
    try {
      setTodas(exigir(await carpetasService.todas()) ?? [])
    } catch (e) {
      showToast('error', mensajeDeError(e))
    }
  }

  const guardarCarpeta = async (n: string): Promise<string | null> => {
    try {
      const r = nombre?.carpeta
        ? await carpetasService.guardar({ id: nombre.carpeta.id, nombre: n })
        : await carpetasService.guardar({ nombre: n, padreId: carpetaId })
      if (!r.correct) return r.message
      showToast('success', nombre?.carpeta ? 'Carpeta renombrada' : `Carpeta «${n}» creada`)
      cargar()
      return null
    } catch (e) {
      return mensajeDeError(e)
    }
  }

  const borrarCarpeta = async (contenido?: 'SUBIR' | 'BORRAR') => {
    const c = borrar
    setBorrar(null)
    if (!c) return
    try {
      const r = exigir(await carpetasService.borrar(c.id, contenido))
      const partes = [
        r?.documentosMovidos
          ? `${plural(r.documentosMovidos, 'documento')} movido${r.documentosMovidos > 1 ? 's' : ''}`
          : null,
        r?.documentosRetirados
          ? `${plural(r.documentosRetirados, 'documento')} retirado${r.documentosRetirados > 1 ? 's' : ''}`
          : null,
      ].filter(Boolean)
      showToast('success', `Carpeta «${c.nombre}» borrada`, partes.join(' · ') || undefined)
      if (c.id === carpetaId) navigation.replace('Documentos', c.padreId ? { carpeta: c.padreId } : undefined)
      else cargar()
    } catch (e) {
      showToast('error', mensajeDeError(e))
    }
  }

  const moverA = async (destino: string | null) => {
    const m = mover
    setMover(null)
    if (!m) return
    try {
      if (m.carpeta) {
        exigir(await carpetasService.mover(m.carpeta.id, destino))
        showToast('success', `Carpeta «${m.carpeta.nombre}» movida`)
      } else if (m.documentos?.length) {
        const n = exigir(await carpetasService.moverDocumentos(m.documentos, destino)) ?? 0
        showToast('success', n === 1 ? 'Documento movido' : `${n} documentos movidos`)
        setSeleccion(null)
      }
      cargar()
    } catch (e) {
      showToast('error', mensajeDeError(e))
    }
  }

  const retirar = (d: EjemplarDTO) =>
    confirmarAccion({
      titulo: 'Retirar documento',
      mensaje: MENSAJES.retirarAviso(d.titulo),
      textoConfirmar: 'Sí, retirar',
      onConfirmar: async () => {
        try {
          exigir(await librosService.borrar(d.id))
          showToast('success', 'Documento retirado')
          cargar()
        } catch (e) {
          showToast('error', mensajeDeError(e))
        }
      },
    })

  const pedirMover = async (m: NonNullable<Mover>) => {
    await cargarTodas()
    setMover(m)
  }

  const menuDeCarpeta = (c: CarpetaDTO) =>
    setMenu({
      titulo: c.nombre,
      acciones: [
        { clave: 'abrir', etiqueta: 'Abrir', icono: 'archivador', onPress: () => abrirCarpeta(c.id) },
        { clave: 'renombrar', etiqueta: 'Renombrar', icono: 'lapiz', onPress: () => setNombre({ carpeta: c }) },
        {
          clave: 'mover',
          etiqueta: 'Mover a otra carpeta',
          icono: 'right',
          onPress: () => pedirMover({ titulo: `Mover «${c.nombre}» a…`, actual: c.padreId, carpeta: c }),
        },
        { clave: 'borrar', etiqueta: 'Borrar carpeta', icono: 'trash', peligro: true, onPress: () => setBorrar(c) },
      ],
    })

  const menuDeDocumento = (d: EjemplarDTO) =>
    setMenu({
      titulo: d.titulo,
      acciones: [
        { clave: 'abrir', etiqueta: 'Abrir', icono: 'libroAbierto', onPress: () => abrirDocumento(d) },
        {
          clave: 'ficha',
          etiqueta: 'Detalles y notas',
          icono: 'nota',
          onPress: () => navigation.navigate('Libro', { id: d.id }),
        },
        {
          clave: 'mover',
          etiqueta: 'Mover a otra carpeta',
          icono: 'right',
          onPress: () =>
            pedirMover({ titulo: `Mover «${d.titulo}» a…`, actual: d.carpetaId ?? null, documentos: [d.id] }),
        },
        {
          clave: 'seleccionar',
          etiqueta: 'Seleccionar varios',
          icono: 'check',
          onPress: () => setSeleccion(new Set([d.id])),
        },
        { clave: 'retirar', etiqueta: 'Retirar', icono: 'trash', peligro: true, onPress: () => retirar(d) },
      ],
    })

  const menuGeneral = () =>
    setMenu({
      titulo: actual ? actual.nombre : 'Archivador',
      acciones: [
        ...ORDENES.map((o) => ({
          clave: `orden-${o.clave}`,
          etiqueta: o.nombre,
          icono: 'orden',
          elegida: orden === o.clave,
          onPress: () => setOrden(o.clave),
        })),
        ...(documentos.length
          ? [
              {
                clave: 'seleccionar',
                etiqueta: 'Seleccionar varios',
                icono: 'check',
                onPress: () => setSeleccion(new Set<string>()),
              },
            ]
          : []),
        ...(actual
          ? [
              {
                clave: 'renombrar',
                etiqueta: 'Renombrar esta carpeta',
                icono: 'lapiz',
                onPress: () => setNombre({ carpeta: actual }),
              },
              {
                clave: 'borrar',
                etiqueta: 'Borrar esta carpeta',
                icono: 'trash',
                peligro: true,
                onPress: () => setBorrar(actual),
              },
            ]
          : []),
      ],
    })

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s ?? [])
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // ---------------------------------------------------------------- pintar

  const subcarpetas = datos?.subcarpetas ?? []
  const vacio = !!datos && !subcarpetas.length && !documentos.length
  const ubicaciones = datos?.ubicaciones ?? {}
  const titulo = actual ? actual.nombre : 'Mis documentos'

  return (
    <Sala>
      <Encabezado
        titulo={titulo}
        subtitulo={actual ? 'Carpeta del archivador' : 'El archivador de la casa'}
        atras
        acciones={[
          {
            icono: 'more',
            etiqueta: 'Más opciones: ordenar, seleccionar…',
            onPress: menuGeneral,
            testID: 'menu-general',
          },
        ]}
      />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: seleccion ? 160 : 120 }]}>
        {/* Migas de pan (dentro de una carpeta): placas de latón; la última es donde estás. */}
        {ruta.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.migas}>
            {[
              { id: null as string | null, nombre: 'Archivador' },
              ...ruta.map((c) => ({ id: c.id as string | null, nombre: c.nombre })),
            ].map((m, i, todas) => {
              const ultima = i === todas.length - 1
              return (
                <View key={m.id ?? 'raiz'} style={styles.miga}>
                  {i > 0 ? <Icono nombre="right" color={colors.textMuted} tamano={14} /> : null}
                  <Pressable
                    onPress={() => abrirCarpeta(m.id)}
                    disabled={ultima}
                    accessibilityRole="link"
                    accessibilityLabel={ultima ? `${m.nombre}, estás aquí` : `Ir a ${m.nombre}`}
                    style={[
                      styles.migaBoton,
                      ultima && { borderColor: colors.primaryLight, borderWidth: 1 },
                      ultima && web(placaActiva(isDark)),
                      web({ cursor: ultima ? 'default' : 'pointer' }),
                    ]}
                  >
                    {i === 0 ? <Icono nombre="archivador" color={colors.primary} tamano={16} /> : null}
                    <Text
                      style={[styles.migaTexto, { color: ultima ? colors.text : colors.primary }]}
                      numberOfLines={1}
                    >
                      {m.nombre}
                    </Text>
                  </Pressable>
                </View>
              )
            })}
          </ScrollView>
        ) : null}

        {/* Herramientas: subir aquí, nueva carpeta y buscar. */}
        <View style={[styles.herramientas, ancho && styles.herramientasAncho]}>
          <View style={styles.botones}>
            <Button title="Subir aquí" icono="upload" onPress={() => setSubir(true)} testID="subir-aqui" />
            <Button
              title="Nueva carpeta"
              icono="plus"
              variant="secondary"
              onPress={() => setNombre({ carpeta: null })}
              testID="nueva-carpeta"
            />
          </View>
          <View style={[styles.buscador, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Icono nombre="search" color={colors.textMuted} tamano={18} />
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder={actual ? `Buscar en «${actual.nombre}»` : 'Buscar en el archivador'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={
                actual ? `Buscar en ${actual.nombre} y sus subcarpetas` : 'Buscar en todo el archivador'
              }
              style={[styles.buscadorCampo, { color: colors.text }, web({ outlineStyle: 'none' })]}
              testID="buscar-documentos"
              returnKeyType="search"
            />
            {texto ? (
              <BotonIcono icono="close" etiqueta="Borrar la búsqueda" onPress={() => setTexto('')} tamano={18} />
            ) : null}
          </View>
        </View>

        {cargando && !datos ? <Spinner /> : null}
        {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}

        {datos?.busqueda ? (
          <Text style={[styles.aviso, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {subcarpetas.length + documentos.length
              ? `${plural(subcarpetas.length + documentos.length, 'resultado')} para «${buscado}»${
                  actual ? ` en «${actual.nombre}» y sus subcarpetas` : ''
                }`
              : `Nada coincide con «${buscado}».`}
          </Text>
        ) : null}

        {vacio && !datos?.busqueda ? (
          <EmptyState
            title={actual ? 'Esta carpeta está vacía' : 'El archivador está vacío'}
            message={
              actual
                ? 'Sube documentos aquí o crea subcarpetas para ordenarlos.'
                : 'Contratos, apuntes, hojas de cálculo, presentaciones: tus documentos personales viven aquí, en carpetas, aparte de los libros.'
            }
            icon="archivador"
          />
        ) : null}

        {datos && !vacio ? (
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
            {/* El tirador de latón del cajón abierto. */}
            <View
              style={[styles.tirador, web({ backgroundImage: 'linear-gradient(180deg, #F0D58A, #9C7A22)' })]}
              aria-hidden
            />
            {subcarpetas.length ? (
              <View style={[styles.rejilla]}>
                {subcarpetas.map((c) => (
                  <TarjetaCarpeta
                    key={c.id}
                    carpeta={c}
                    onAbrir={() => abrirCarpeta(c.id)}
                    onMenu={() => menuDeCarpeta(c)}
                    ubicacion={datos.busqueda && c.padreId ? ubicaciones[c.padreId] : null}
                  />
                ))}
              </View>
            ) : null}
            {documentos.length ? (
              <View style={[styles.papeles, { backgroundColor: isDark ? '#1C2A22' : '#E9E2CC' }]}>
                {documentos.map((d) => (
                  <TarjetaDocumento
                    key={d.id}
                    documento={d}
                    onAbrir={() => abrirDocumento(d)}
                    onMenu={() => menuDeDocumento(d)}
                    seleccionando={!!seleccion}
                    seleccionado={!!seleccion?.has(d.id)}
                    onSeleccionar={() => alternar(d.id)}
                    onMantener={() => setSeleccion(new Set([d.id]))}
                    ubicacion={datos.busqueda && d.carpetaId ? ubicaciones[d.carpetaId] : null}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {datos?.recortado ? (
          <Text style={[styles.aviso, { color: colors.textMuted }]}>
            Se muestran los primeros {documentos.length}. Busca o usa subcarpetas para ver el resto.
          </Text>
        ) : null}
        {datos && !datos.busqueda ? (
          <Text style={[styles.pie, { color: colors.textMuted }]}>
            {actual
              ? `${plural(actual.nDocumentos, 'documento')} en esta carpeta`
              : `${plural(datos.totalDocumentos, 'documento')} en el archivador`}
          </Text>
        ) : null}
      </ScrollView>

      {/* Mover varios: barra de abajo mientras se selecciona. */}
      {seleccion ? (
        <View
          style={[
            styles.barraSeleccion,
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web({ boxShadow: '0 -8px 24px rgba(0,0,0,0.35)' }),
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.cuentaSeleccion, { color: colors.text }]}>
            {seleccion.size ? `${seleccion.size} seleccionado${seleccion.size > 1 ? 's' : ''}` : 'Toca los documentos'}
          </Text>
          <Button
            title="Mover a…"
            icono="right"
            size="small"
            disabled={!seleccion.size}
            onPress={() =>
              pedirMover({
                titulo: `Mover ${plural(seleccion.size, 'documento')} a…`,
                actual: carpetaId,
                documentos: [...seleccion],
              })
            }
            testID="mover-seleccion"
          />
          <Button title="Cancelar" variant="ghost" size="small" onPress={() => setSeleccion(null)} />
        </View>
      ) : null}

      <SubirLibros
        visible={subir}
        tipoInicial="DOCUMENTO"
        carpeta={actual ? { id: actual.id, nombre: actual.nombre } : null}
        soloDocumentos
        onCerrar={() => setSubir(false)}
        onSubidos={() => cargar()}
      />
      <MenuAcciones
        visible={!!menu}
        titulo={menu?.titulo ?? ''}
        acciones={menu?.acciones ?? []}
        onCerrar={() => setMenu(null)}
      />
      <NombreCarpeta
        visible={!!nombre}
        carpeta={nombre?.carpeta}
        dentroDe={actual?.nombre ?? null}
        onCerrar={() => setNombre(null)}
        onGuardar={guardarCarpeta}
      />
      <BorrarCarpeta
        visible={!!borrar}
        carpeta={borrar}
        destino={
          borrar
            ? destinoAlBorrar(borrar.padreId, (id) => ruta.find((c) => c.id === id)?.nombre ?? ubicaciones[id])
            : ''
        }
        onCerrar={() => setBorrar(null)}
        onBorrar={borrarCarpeta}
      />
      <ElegirCarpeta
        visible={!!mover}
        titulo={mover?.titulo ?? ''}
        carpetas={todas}
        actual={mover?.actual ?? null}
        sinElSubarbolDe={mover?.carpeta?.id ?? null}
        onCerrar={() => setMover(null)}
        onElegir={moverA}
      />
    </Sala>
  )
}

const styles = StyleSheet.create({
  contenido: { padding: 16, gap: 14, maxWidth: 900, width: '100%', alignSelf: 'center' },
  migas: { alignItems: 'center', gap: 2, paddingVertical: 2 },
  miga: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  migaBoton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    maxWidth: 220,
  },
  migaTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.sm },
  herramientas: { gap: 10 },
  herramientasAncho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  buscador: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    borderWidth: 1,
    borderRadius: 24,
    flexGrow: 1,
    maxWidth: 420,
  },
  buscadorCampo: { flex: 1, minHeight: 46, fontFamily: fuentes.ui, fontSize: fontSize.sm },
  aviso: { fontFamily: fuentes.ui, fontSize: fontSize.sm },
  mueble: { borderRadius: 8, padding: 12, paddingTop: 22, gap: 14 },
  tirador: {
    position: 'absolute',
    top: 7,
    alignSelf: 'center',
    width: 120,
    height: 8,
    borderRadius: 4,
    backgroundColor: paleta.laton,
  },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  papeles: { padding: 8, gap: 8, borderRadius: 4 },
  pie: { textAlign: 'center', fontFamily: fuentes.ui, fontSize: fontSize.xs },
  barraSeleccion: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 640,
    alignSelf: 'center',
  },
  cuentaSeleccion: { flex: 1, fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
})

export default DocumentosScreen
