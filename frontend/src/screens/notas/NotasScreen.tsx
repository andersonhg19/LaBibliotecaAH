import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import Portada from '@componentes/estanteria/Portada'
import EmptyState from '@componentes/molecules/EmptyState'
import Encabezado, { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Sala from '@componentes/molecules/Sala'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { exigir, useCarga } from '@hooks/useCarga'
import { COLORES_RESALTADO, nombreColor, nombreTipo, ordenarAnotaciones } from '@logica/anotaciones'
import { autoresTexto, fechaCorta, plural } from '@logica/formato'
import {
  FILTRO_NOTAS_INICIAL,
  FiltroNotas,
  GrupoNotas,
  citaParaCompartir,
  filtrarGrupos,
  porFecha,
  totalNotas,
} from '@logica/notas'
import type { Rutas } from '@navegacion/linking'
import { anotacionesService, librosService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { cuero, fibraPapel } from '@tema/madera'
import { SOMBRA, placaActiva } from '@tema/materiales'
import { web } from '@tema/web'
import type { AnotacionDTO, EjemplarDTO, TipoAnotacion } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { confirmarAccion } from '@utils/confirmar'
import { MENSAJES, mensajeDelServidor } from '@utils/mensajes'

type Props = NativeStackScreenProps<Rutas, 'Notas'>
type Vista = 'libros' | 'todas'

const TIPOS: { clave: TipoAnotacion | null; nombre: string }[] = [
  { clave: null, nombre: 'Todo' },
  { clave: 'RESALTADO', nombre: 'Subrayados' },
  { clave: 'NOTA', nombre: 'Notas' },
  { clave: 'MARCADOR', nombre: 'Marcadores' },
]

/** Copiar (o compartir, en el teléfono) una cita. Devuelve si se pudo. */
async function compartirCita(texto: string): Promise<'compartida' | 'copiada' | false> {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav?.share && /Mobi|Android|iPhone/i.test(nav.userAgent)) {
      await nav.share({ text: texto })
      return 'compartida'
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(texto)
      return 'copiada'
    }
  } catch (e) {
    console.warn('[notas] no se pudo compartir la cita', e)
  }
  return false
}

/*
 * MIS NOTAS, el cuaderno de la casa. Cada libro es un CUADERNO DE CUERO con su
 * portada; dentro, las citas en PERGAMINO con una cinta del color con que las
 * subrayaste. Se busca dentro de las notas (sin tildes), se filtra por tipo y
 * por color, se ve "por libro" o "todas" por fecha, y cada cita tiene "Ir al
 * lugar" (abre el lector exactamente ahí), copiar/compartir, editar la nota,
 * cambiar el color y borrar. Las acciones secundarias son iconos discretos: la
 * principal es leer la cita.
 */
const NotasScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme()
  const { showToast } = useToast()
  const [grupos, setGrupos] = useState<GrupoNotas[]>([])
  const [filtro, setFiltro] = useState<FiltroNotas>(FILTRO_NOTAS_INICIAL)
  const [vista, setVista] = useState<Vista>('libros')

  const tarea = useCallback(async () => {
    const libros =
      exigir(
        await librosService.todos({ pestana: 'TODO', conNotas: true, orden: 'ULTIMO_ABIERTO', page: 0, size: 100 }),
      )?.list ?? []
    const con = await Promise.all(
      libros.map(async (l) => ({
        libro: l,
        notas: ordenarAnotaciones(exigir(await anotacionesService.todas(l.id)) ?? []),
      })),
    )
    setGrupos(con.filter((g) => g.notas.length))
  }, [])
  const { cargando, error, cargar } = useCarga(tarea)
  useEffect(() => {
    cargar()
  }, [cargar])

  const visibles = useMemo(() => filtrarGrupos(grupos, filtro), [grupos, filtro])
  const n = totalNotas(visibles)
  const hayFiltro = !!(filtro.texto.trim() || filtro.color || filtro.tipo)

  const irAlLugar = (libro: EjemplarDTO, a: AnotacionDTO) =>
    navigation.navigate('Leer', {
      id: libro.id,
      ...(a.fraseInicio ? { frase: a.fraseInicio } : {}),
      ...(a.cfi ? { cfi: a.cfi } : {}),
    })

  const reemplazar = (a: AnotacionDTO) =>
    setGrupos((gs) => gs.map((g) => ({ ...g, notas: g.notas.map((x) => (x.id === a.id ? a : x)) })))

  const guardar = async (a: AnotacionDTO, cambio: Partial<AnotacionDTO>, aviso: string) => {
    try {
      const r = await anotacionesService.guardar({ ...a, ...cambio })
      if (!r.correct) throw new Error(r.message)
      reemplazar({ ...a, ...cambio, ...r.object })
      showToast('success', aviso)
      return true
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
      return false
    }
  }

  const borrar = (a: AnotacionDTO) =>
    confirmarAccion({
      titulo: 'Borrar del cuaderno',
      mensaje: a.textoCitado ? `¿Borrar «${a.textoCitado.slice(0, 80)}»?` : '¿Borrar esta nota?',
      textoConfirmar: 'Sí, borrar',
      onConfirmar: async () => {
        try {
          const r = await anotacionesService.borrar(a.id as string)
          if (!r.correct) throw new Error(r.message)
          setGrupos((gs) =>
            gs.map((g) => ({ ...g, notas: g.notas.filter((x) => x.id !== a.id) })).filter((g) => g.notas.length),
          )
          showToast('success', MENSAJES.borrado)
        } catch (e) {
          showToast('error', MENSAJES.errorGuardar, mensajeDelServidor(e, MENSAJES.errorGuardar))
        }
      },
    })

  const copiar = async (a: AnotacionDTO, libro: EjemplarDTO) => {
    const r = await compartirCita(citaParaCompartir(a, libro))
    if (r === 'copiada') showToast('success', MENSAJES.copiado)
  }

  const cita = (libro: EjemplarDTO, a: AnotacionDTO, i: number, conLibro: boolean) => (
    <Cita
      key={a.id}
      libro={libro}
      a={a}
      indice={i}
      conLibro={conLibro}
      onIr={() => irAlLugar(libro, a)}
      onCopiar={() => copiar(a, libro)}
      onBorrar={() => borrar(a)}
      onColor={(hex) => guardar(a, { color: hex }, 'Color cambiado')}
      onNota={(nota) => guardar(a, { nota: nota.trim() || null }, MENSAJES.notaGuardada)}
    />
  )

  return (
    <Sala>
      <Encabezado
        titulo="Mis notas"
        subtitulo="El cuaderno de tus lecturas"
        atras
        acciones={[
          {
            icono: vista === 'libros' ? 'lista' : 'lomos',
            etiqueta: vista === 'libros' ? 'Ver todas por fecha' : 'Ver por libro',
            onPress: () => setVista((v) => (v === 'libros' ? 'todas' : 'libros')),
            testID: 'vista-notas',
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Input
          label=""
          accessibilityLabel="Buscar en tus notas"
          value={filtro.texto}
          onChangeText={(texto) => setFiltro((f) => ({ ...f, texto }))}
          placeholder="Buscar en tus notas y citas…"
          testID="buscar-notas"
        />
        {/* Filtros en UNA línea desplazable: tipo como segmentado y los colores al lado. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros}>
          <View
            style={[styles.segmentado, { borderColor: colors.border, backgroundColor: colors.card }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Tipo"
          >
            {TIPOS.map((t) => {
              const activo = filtro.tipo === t.clave
              return (
                <Pressable
                  key={t.nombre}
                  onPress={() => setFiltro((f) => ({ ...f, tipo: t.clave }))}
                  {...estadoElegible('radio', activo)}
                  accessibilityLabel={t.nombre}
                  testID={`tipo-${t.clave ?? 'TODO'}`}
                  style={[
                    styles.segmento,
                    activo && { borderColor: colors.primaryLight },
                    activo && web(placaActiva(isDark)),
                    web({ cursor: 'pointer' }),
                  ]}
                >
                  <Text style={[styles.segmentoTexto, { color: activo ? colors.text : colors.textSecondary }]}>
                    {t.nombre}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <View style={[styles.separador, { backgroundColor: colors.border }]} />
          <View style={styles.fila} accessibilityRole="radiogroup" accessibilityLabel="Color">
            <Muestra
              etiqueta="Todos los colores"
              activo={!filtro.color}
              onPress={() => setFiltro((f) => ({ ...f, color: null }))}
            />
            {COLORES_RESALTADO.map((c) => (
              <Muestra
                key={c.clave}
                hex={c.hex}
                etiqueta={c.nombre}
                activo={filtro.color === c.hex}
                onPress={() => setFiltro((f) => ({ ...f, color: f.color === c.hex ? null : c.hex }))}
              />
            ))}
          </View>
        </ScrollView>

        {cargando && !grupos.length ? <Spinner /> : null}
        {error ? <EstadoError mensaje={error} onReintentar={cargar} /> : null}
        {!cargando && !error && !grupos.length ? (
          <EmptyState
            title="El cuaderno está en blanco"
            message="En el lector, selecciona un texto para subrayarlo o anotarlo: aparecerá aquí, con su libro."
            icon="nota"
          />
        ) : null}
        {grupos.length && !visibles.length ? (
          <EmptyState title="Nada coincide" message="Prueba con otra palabra, otro color u otro tipo." icon="search">
            <Button title="Quitar los filtros" variant="secondary" onPress={() => setFiltro(FILTRO_NOTAS_INICIAL)} />
          </EmptyState>
        ) : null}
        {visibles.length ? (
          <Text style={[styles.cuenta, { color: colors.textSecondary }]} testID="cuenta-notas">
            {plural(n, 'nota')} en {plural(visibles.length, 'libro')}
            {hayFiltro ? ' (filtradas)' : ''}
          </Text>
        ) : null}

        {vista === 'libros'
          ? visibles.map(({ libro, notas }, gi) => (
              <View
                key={libro.id}
                testID={`cuaderno-${libro.id}`}
                style={[
                  styles.cuaderno,
                  { backgroundColor: isDark ? paleta.nogal : '#7E5230' },
                  web({
                    backgroundImage: cuero(isDark ? paleta.nogal : '#7E5230'),
                    boxShadow: `${SOMBRA[2]}, inset 0 0 0 1px rgba(201,162,39,0.35)`,
                    animationName: 'bah-llega',
                    animationDuration: '420ms',
                    animationDelay: `${Math.min(gi, 8) * 60}ms`,
                    animationFillMode: 'both',
                  }),
                ]}
              >
                <Pressable
                  onPress={() => navigation.navigate('Libro', { id: libro.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`${libro.titulo}: ${plural(notas.length, 'nota')}. Abrir la ficha`}
                  style={({ pressed }) => [
                    styles.tapaCuaderno,
                    pressed && { opacity: 0.8 },
                    web({ cursor: 'pointer' }),
                  ]}
                >
                  <Portada libro={libro} ancho={52} />
                  <View style={styles.flex}>
                    <Text style={styles.tituloCuaderno} numberOfLines={2}>
                      {libro.titulo}
                    </Text>
                    <Text style={styles.autorCuaderno} numberOfLines={1}>
                      {autoresTexto(libro.autores)} · {plural(notas.length, 'nota')}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.hojas}>{notas.map((a, i) => cita(libro, a, i, false))}</View>
              </View>
            ))
          : porFecha(visibles).map(({ libro, nota }, i) => cita(libro, nota, i, true))}
      </ScrollView>
    </Sala>
  )
}

/** Una muestra de color redonda (filtro), con su nombre para el lector de pantalla. */
const Muestra: React.FC<{ hex?: string; etiqueta: string; activo: boolean; onPress: () => void }> = ({
  hex,
  etiqueta,
  activo,
  onPress,
}) => {
  const { colors } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      {...estadoElegible('radio', activo)}
      accessibilityLabel={etiqueta}
      style={[styles.muestraToque, web({ cursor: 'pointer' })]}
    >
      <View
        style={[
          styles.muestra,
          { backgroundColor: hex ?? 'transparent', borderColor: activo ? colors.primary : colors.border },
          activo && styles.muestraActiva,
          !hex &&
            web({
              backgroundImage: `conic-gradient(${COLORES_RESALTADO.map((c) => c.hex).join(', ')}, ${COLORES_RESALTADO[0].hex})`,
            }),
        ]}
      />
    </Pressable>
  )
}

/** Una cita en pergamino, con su cinta de color y sus acciones discretas. */
const Cita: React.FC<{
  libro: EjemplarDTO
  a: AnotacionDTO
  indice: number
  conLibro: boolean
  onIr: () => void
  onCopiar: () => void
  onBorrar: () => void
  onColor: (hex: string) => void
  onNota: (nota: string) => Promise<boolean>
}> = ({ libro, a, indice, conLibro, onIr, onCopiar, onBorrar, onColor, onNota }) => {
  const [colores, setColores] = useState(false)
  const [menu, setMenu] = useState(false)
  const [edicion, setEdicion] = useState<string | null>(null)
  const cinta = a.color ?? paleta.miel
  return (
    <View
      testID={`cita-${a.id}`}
      style={[
        styles.pergamino,
        { backgroundColor: paleta.pergamino },
        web({
          backgroundImage: `${fibraPapel}, linear-gradient(180deg, ${paleta.marfil}, ${paleta.pergamino})`,
          boxShadow: SOMBRA[1],
          animationName: 'bah-llega',
          animationDuration: '380ms',
          animationDelay: `${Math.min(indice, 10) * 40}ms`,
          animationFillMode: 'both',
        }),
      ]}
    >
      <View accessible={false} style={[styles.cinta, { backgroundColor: cinta }]} />
      <Text style={styles.meta}>
        {conLibro ? `${libro.titulo} · ` : ''}
        {nombreTipo(a)} · {nombreColor(a.color)} · cap. {(a.capitulo ?? 0) + 1}
        {a.creado ? ` · ${fechaCorta(a.creado)}` : ''}
      </Text>
      {a.textoCitado ? <Text style={styles.textoCita}>«{a.textoCitado}»</Text> : null}
      {edicion !== null ? (
        <View style={styles.edicion}>
          <Input label="Tu nota" value={edicion} onChangeText={setEdicion} multiline testID={`nota-edicion-${a.id}`} />
          <View style={styles.fila}>
            <Button
              title="Guardar"
              size="small"
              onPress={async () => {
                if (await onNota(edicion)) setEdicion(null)
              }}
              testID={`nota-guardar-${a.id}`}
            />
            <Button title="Cancelar" size="small" variant="ghost" onPress={() => setEdicion(null)} />
          </View>
        </View>
      ) : a.nota ? (
        <Text style={styles.textoNota}>✎ {a.nota}</Text>
      ) : null}
      {colores ? (
        <View style={styles.fila} accessibilityRole="radiogroup" accessibilityLabel="Color del subrayado">
          {COLORES_RESALTADO.map((c) => (
            <Muestra
              key={c.clave}
              hex={c.hex}
              etiqueta={c.nombre}
              activo={(a.color ?? '').toLowerCase() === c.hex.toLowerCase()}
              onPress={() => {
                setColores(false)
                onColor(c.hex)
              }}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.acciones}>
        <Button
          title="Ir al lugar"
          icono="libroAbierto"
          size="small"
          variant="secondary"
          onPress={onIr}
          testID={`ir-${a.id}`}
        />
        <View style={styles.flex} />
        <BotonIcono
          icono={menu ? 'close' : 'more'}
          etiqueta={menu ? 'Cerrar las acciones' : 'Más acciones'}
          onPress={() => setMenu((m) => !m)}
          color={paleta.nogal}
          testID={`mas-${a.id}`}
        />
      </View>
      {menu ? (
        <View style={styles.menu} testID={`menu-${a.id}`}>
          <Accion
            icono="copiar"
            texto="Copiar"
            onPress={() => {
              setMenu(false)
              onCopiar()
            }}
          />
          {a.tipo !== 'MARCADOR' ? (
            <Accion
              color={cinta}
              texto="Color"
              onPress={() => {
                setMenu(false)
                setColores((v) => !v)
              }}
              testID={`color-${a.id}`}
            />
          ) : null}
          <Accion
            icono="lapiz"
            texto={a.nota ? 'Editar nota' : 'Añadir nota'}
            onPress={() => {
              setMenu(false)
              setEdicion(a.nota ?? '')
            }}
            testID={`nota-editar-${a.id}`}
          />
          <Accion
            icono="trash"
            texto="Borrar"
            peligro
            onPress={() => {
              setMenu(false)
              onBorrar()
            }}
            testID={`borrar-${a.id}`}
          />
        </View>
      ) : null}
    </View>
  )
}

/** Una acción del menú «⋯» de una cita: icono (o el círculo del color) y su palabra. */
const Accion: React.FC<{
  icono?: string
  color?: string
  texto: string
  onPress: () => void
  peligro?: boolean
  testID?: string
}> = ({ icono, color, texto, onPress, peligro, testID }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={texto}
    testID={testID}
    style={({ pressed }) => [styles.accion, pressed && { opacity: 0.7 }, web({ cursor: 'pointer' })]}
  >
    {color ? (
      <View style={[styles.circuloColor, { backgroundColor: color }]} />
    ) : (
      <Icono nombre={icono ?? 'more'} color={peligro ? paleta.burdeos : paleta.nogal} tamano={20} />
    )}
    <Text style={[styles.accionTexto, peligro && { color: paleta.burdeos }]}>{texto}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 16, gap: 16, paddingBottom: 120, maxWidth: 820, width: '100%', alignSelf: 'center' },
  filtros: { gap: 10, alignItems: 'center', paddingRight: 12 },
  segmentado: { flexDirection: 'row', borderWidth: 1, borderRadius: 22, padding: 2 },
  segmento: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 20,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentoTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs },
  separador: { width: 1, height: 28 },
  menu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(74,46,28,0.18)',
    paddingTop: 6,
  },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 8 },
  accionTexto: { fontFamily: fuentes.uiMedia, fontSize: fontSize.xs, color: paleta.nogal },
  circuloColor: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: paleta.nogal },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  cuenta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, fontVariant: ['lining-nums'] },
  cuaderno: { borderRadius: 10, padding: 12, gap: 10 },
  tapaCuaderno: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  tituloCuaderno: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.lg, color: '#F0D9A0' },
  autorCuaderno: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.sm, color: paleta.pergamino },
  hojas: { gap: 10 },
  pergamino: { borderRadius: 4, padding: 14, paddingLeft: 20, gap: 6, overflow: 'hidden' },
  cinta: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  meta: { fontFamily: fuentes.ui, fontSize: fontSize.xs, color: paleta.nogal },
  textoCita: { fontFamily: fuentes.lectura, fontSize: fontSize.md, lineHeight: 27, color: paleta.robleOscuro },
  textoNota: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md, color: '#7A3B1E' },
  edicion: { gap: 6 },
  acciones: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 4 },
  muestraToque: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  muestra: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  muestraActiva: { transform: [{ scale: 1.15 }] },
})

export default NotasScreen
