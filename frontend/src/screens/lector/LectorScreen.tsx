import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Deslizador from '@componentes/atoms/Deslizador'
import Icono from '@componentes/atoms/Icono'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import LectorFoliate from '@componentes/lector/LectorFoliate'
import SelectorModo from '@componentes/lector/SelectorModo'
import { ALTO_BARRA_LECTOR, ALTO_MINI, LECTOR_PAPEL } from '@componentes/lector/disenoLector'
import { Lugar, debeOcultarBarra } from '@componentes/lector/gestos'
import { posicionMenu } from '@componentes/lector/menuSeleccion'
import { modoEfectivo, opcionesDeModo } from '@componentes/lector/modoLectura'
import { ControlLector, Destino, InfoLibro, ResultadoBusqueda, Seleccion, Ubicacion } from '@componentes/lector/tipos'
import { ModoTraduccion, ofrecerTraduccion } from '@componentes/lector/traduccion'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Hoja from '@componentes/molecules/Hoja'
import { elevarAvisos } from '@componentes/organisms/ToastContainer'
import { usePreferencias } from '@contextos/PreferenciasContext'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { motor, useVoz } from '@contextos/VozContext'
import { mensajeDeError } from '@hooks/useCarga'
import { COLORES_RESALTADO, nombreColor } from '@logica/anotaciones'
import { sePuedeLeer } from '@logica/formato'
import { decidirReanudacion, describirPosicion } from '@logica/progreso'
import type { Rutas } from '@navegacion/linking'
import { volverOInicio } from '@navegacion/linking'
import { urlLibro } from '@servicios/archivos'
import { anotacionesService, librosService, progresoService, traduccionService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { FUENTES_LECTOR } from '@tema/fuentes'
import { PAPELES } from '@tema/papel'
import { reducirMovimiento, web } from '@tema/web'
import type { AnotacionDTO, EjemplarDetalleDTO, ProgresoDTO } from '@tipos'
import { estadoElegible } from '@utils/aria'
import { escucharLibro } from '@utils/escuchar'
import { MENSAJES } from '@utils/mensajes'
import { acotar } from '@utils/motorAudio'
import { esteDispositivo, guardarProgresoLocal, leerProgresoLocal } from '@utils/progresoLocal'
import { esquemaNota, validar } from '@validaciones/index'

type Props = NativeStackScreenProps<Rutas, 'Leer'>
type HojaAbierta = 'indice' | 'ajustes' | 'buscar' | 'nota' | 'anotacion' | 'traducir' | null

const CADA_LOCAL = 5000
const CADA_SERVIDOR = 15000
/** Lo mínimo entre el primer movimiento y el primer guardado en el servidor. */
const PRIMER_GUARDADO = 2000

/** La cinta del marcador cae con un pequeño balanceo (la animación no se puede poner en línea). */
function ponerEstilosLector() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('bah-lector-estilos')) return
  const s = document.createElement('style')
  s.id = 'bah-lector-estilos'
  s.textContent =
    '@keyframes bahCinta{0%{transform:translateY(-100%)}70%{transform:translateY(6%)}100%{transform:translateY(0)}}' +
    '@keyframes bahMenu{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}'
  document.head.appendChild(s)
}

/*
 * EL LECTOR (plan §7). Al abrir SIEMPRE se pregunta al servidor dónde ibas y
 * se retoma exactamente ahí (frase o CFI). Si otro dispositivo fue más lejos
 * después, se ofrece: "Seguiste en el iPhone hasta el capítulo 7 — ¿ir allí?".
 *
 * PAPEL, NO PANTALLA: la barra vive en el margen de arriba del libro (nunca
 * tapa la primera línea) y se va sola al pasar página; el folio va al pie
 * («p. 34 de 210 · quedan 12 min»); un marcador es una cinta burdeos que
 * cuelga de la página; en el PC, el libro abierto a dos columnas.
 *
 * La posición solo se guarda cuando LEES (pasas página, saltas, buscas…), no
 * por abrir el libro (QA LV-04), y como mucho una vez cada 15 s (QA LV-11).
 */
const LectorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id, frase, cfi } = route.params
  const { colors } = useTheme()
  const { prefs, cambiar } = usePreferencias()
  const { showToast } = useToast()
  const voz = useVoz()
  const { width, height } = useWindowDimensions()
  const [tamMenu, setTamMenu] = useState({ ancho: 344, alto: 108 })
  const control = useRef<ControlLector>(null)
  useEffect(() => ponerEstilosLector(), [])
  /* Los avisos suben por encima de la barra de abajo del lector (QA RW-04). */
  useEffect(() => elevarAvisos(76), [])

  const [libro, setLibro] = useState<EjemplarDetalleDTO | null>(null)
  const [inicial, setInicial] = useState<Destino | null>(null)
  const [ofrecer, setOfrecer] = useState<ProgresoDTO | null>(null)
  const [anotaciones, setAnotaciones] = useState<AnotacionDTO[]>([])
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [info, setInfo] = useState<InfoLibro>({ indice: [], secciones: [] })
  const [ubic, setUbic] = useState<Ubicacion | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<number | null>(null)
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [cromo, setCromo] = useState(true)
  const [hoja, setHoja] = useState<HojaAbierta>(null)
  const [puedeVolver, setPuedeVolver] = useState(false)
  const [verVolver, setVerVolver] = useState(false)
  const [siguiendoVoz, setSiguiendoVoz] = useState(true)
  const [nota, setNota] = useState('')
  const [errorNota, setErrorNota] = useState<string | undefined>()
  const [anotacionVista, setAnotacionVista] = useState<AnotacionDTO | null>(null)
  const [edNota, setEdNota] = useState('')
  const [edColor, setEdColor] = useState<string>(COLORES_RESALTADO[0].hex)
  const [guardandoEd, setGuardandoEd] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [irPct, setIrPct] = useState('')
  // Traducir una selección (hoja) y «Ver en español» por capítulo.
  const [trSel, setTrSel] = useState<{
    seleccion: Seleccion
    traduccion: string | null
    error: string | null
  } | null>(null)
  const [modoTr, setModoTr] = useState<ModoTraduccion>('original')
  const [frasesTr, setFrasesTr] = useState<Record<string, string>>({})
  const [estadoTr, setEstadoTr] = useState<'listo' | 'traduciendo' | 'error'>('listo')
  const capsTraducidos = useRef(new Set<number>())

  // ---------------------------------------------------------------- abrir: servidor primero
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [det, prog, notas, local] = await Promise.all([
          librosService.detalle(id),
          progresoService.obtener(id),
          anotacionesService.todas(id),
          leerProgresoLocal(id),
        ])
        if (!vivo) return
        if (!det.correct) {
          // El detalle técnico («el parámetro … no admite …») va a la consola, no a la cara (UX-23).
          console.warn('[lector]', det.message)
          throw new Error(MENSAJES.libroNoEncontrado)
        }
        if (!sePuedeLeer(det.object)) throw new Error(MENSAJES.lectorSinArchivo)
        setLibro(det.object)
        setAnotaciones(notas.correct ? notas.object : [])
        const servidor = prog.correct ? prog.object : det.object.progreso
        const r = decidirReanudacion(local, servidor, esteDispositivo())
        if (frase || cfi) setInicial({ fraseId: frase ?? null, cfi: cfi ?? null })
        else if (r.inicial)
          setInicial({ cfi: r.inicial.cfi, fraseId: r.inicial.fraseId, fraccion: (r.inicial.porcentaje ?? 0) / 100 })
        else setInicial(null)
        if (!frase && !cfi) setOfrecer(r.ofrecer)
        if (r.subirLocal && r.inicial)
          progresoService.guardar(r.inicial).catch((e) => console.warn('[lector] subir progreso local', e))
        setListo(true)
      } catch (e) {
        if (vivo) setError(e instanceof Error && e.message ? e.message : mensajeDeError(e))
      }
    })()
    return () => {
      vivo = false
    }
  }, [id, frase, cfi])

  // ---------------------------------------------------------------- la barra se va sola
  const tCromo = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ocultarLuego = useCallback((ms: number) => {
    if (tCromo.current) clearTimeout(tCromo.current)
    tCromo.current = setTimeout(() => setCromo(false), ms)
  }, [])
  useEffect(() => {
    if (listo) ocultarLuego(LECTOR_PAPEL.barraSeVaMs)
    return () => {
      if (tCromo.current) clearTimeout(tCromo.current)
    }
  }, [listo, ocultarLuego])
  /** Mostrar la barra (toque en el centro o el asa) y que se vaya sola un rato después. */
  const mostrarBarra = useCallback(() => {
    setCromo(true)
    ocultarLuego(LECTOR_PAPEL.barraSeVaMs + 1500)
  }, [ocultarLuego])
  /* Con una hoja, la selección o el aviso abiertos la barra se queda. */
  const ocupado = !!hoja || !!seleccion || !!ofrecer || vistaPrevia != null
  useEffect(() => {
    if (ocupado && tCromo.current) clearTimeout(tCromo.current)
  }, [ocupado])

  // ---------------------------------------------------------------- «↶ Mi posición anterior» no se queda para siempre
  useEffect(() => {
    setVerVolver(puedeVolver)
    if (!puedeVolver) return
    const t = setTimeout(() => setVerVolver(false), LECTOR_PAPEL.volverSeVaMs)
    return () => clearTimeout(t)
  }, [puedeVolver, ubic?.cfi])

  // ---------------------------------------------------------------- guardar dónde vas
  const ultimo = useRef<ProgresoDTO | null>(null)
  const movido = useRef(false)
  const tLocal = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tServidor = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoServidor = useRef(0)

  const subir = useCallback(() => {
    const p = ultimo.current
    if (!p) return
    ultimoServidor.current = Date.now()
    progresoService.guardar(p).catch((e) => console.warn('[lector]', MENSAJES.progresoFallo, e))
  }, [])

  const lugar = useRef<Lugar | null>(null)
  const alReubicar = useCallback(
    (u: Ubicacion) => {
      setUbic(u)
      setSeleccion(null)
      const ahora = { cfi: u.cfi, fraccion: u.fraccion }
      // QA RW-02: el «snap» de foliate tras un toque quieto no es pasar página; solo un cambio de lugar esconde la barra.
      const seMovio = debeOcultarBarra(u.motivo, u.porUsuario, lugar.current, ahora)
      if (seMovio) setCromo(false)
      lugar.current = ahora
      // Un toque quieto tampoco es «leer» (QA LV-04): no pisa la posición del servidor.
      if (u.porUsuario && (u.motivo !== 'snap' || seMovio)) movido.current = true
      const vozAqui = motor.obtener().libro?.ejemplarId === id && motor.obtener().fase === 'reproduciendo'
      if (vozAqui) return
      // Abrir el libro (o que se coloque solo) no es leer: no pisa la posición del servidor (QA LV-04).
      if (!movido.current) return
      ultimo.current = {
        ejemplarId: id,
        capitulo: u.capitulo,
        fraseId: u.fraseId,
        cfi: u.cfi,
        posicionAudioSeg: null,
        vozId: null,
        velocidad: null,
        porcentaje: Number(acotar(u.fraccion * 100, 0, 100, 0).toFixed(2)),
        modo: 'VISTA',
        dispositivo: esteDispositivo(),
        actualizadoEn: new Date().toISOString(),
      }
      if (tLocal.current) clearTimeout(tLocal.current)
      tLocal.current = setTimeout(() => ultimo.current && guardarProgresoLocal(ultimo.current), CADA_LOCAL)
      // UN solo guardado pendiente a la vez (QA LV-11: antes cada página programaba el suyo).
      if (!tServidor.current) {
        const espera = Math.max(PRIMER_GUARDADO, CADA_SERVIDOR - (Date.now() - ultimoServidor.current))
        tServidor.current = setTimeout(() => {
          tServidor.current = null
          subir()
        }, espera)
      }
    },
    [id, subir],
  )

  useEffect(() => {
    const salir = () => {
      if (ultimo.current) {
        guardarProgresoLocal(ultimo.current)
        subir()
      }
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('pagehide', salir)
    return () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('pagehide', salir)
      if (tLocal.current) clearTimeout(tLocal.current)
      if (tServidor.current) clearTimeout(tServidor.current)
      tServidor.current = null
      salir()
    }
  }, [subir])

  // ---------------------------------------------------------------- notas
  const guardarAnotacion = (tipo: AnotacionDTO['tipo'], color: string, textoNota: string | null) =>
    seleccion ? guardarAnotacionDe(seleccion, tipo, color, textoNota) : Promise.resolve()

  const guardarAnotacionDe = async (
    s: Seleccion,
    tipo: AnotacionDTO['tipo'],
    color: string,
    textoNota: string | null,
  ) => {
    if (!libro) return
    const a: AnotacionDTO = {
      ejemplarId: id,
      tipo,
      color,
      cfi: s.cfi,
      fraseInicio: s.fraseInicio,
      offsetInicio: s.offsetInicio,
      fraseFin: s.fraseFin,
      offsetFin: s.offsetFin,
      versionTexto: 1,
      textoCitado: s.texto,
      prefijo: s.prefijo,
      sufijo: s.sufijo,
      nota: textoNota,
      capitulo: s.capitulo,
    }
    try {
      const r = await anotacionesService.guardar(a)
      if (!r.correct) throw new Error(r.message)
      setAnotaciones((l) => [...l, r.object])
      control.current?.pintarAnotacion(r.object)
      control.current?.limpiarSeleccion()
      setSeleccion(null)
      showToast('success', tipo === 'NOTA' ? MENSAJES.notaGuardada : MENSAJES.resaltadoGuardado)
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDeError(e))
    }
  }

  const abrirAnotacion = (a: AnotacionDTO) => {
    setAnotacionVista(a)
    setEdNota(a.nota ?? '')
    setEdColor(a.color ?? COLORES_RESALTADO[0].hex)
    setErrorNota(undefined)
    setHoja('anotacion')
  }

  /** Editar la nota y cambiar el color sin borrarla ni perder su fecha (QA LV-06). */
  const guardarEdicion = async () => {
    const a = anotacionVista
    if (!a) return
    const texto = edNota.trim()
    if (texto) {
      const v = validar(esquemaNota, { nota: texto })
      setErrorNota(v.errores.nota)
      if (!v.ok) return
    }
    const editada: AnotacionDTO = {
      ...a,
      color: edColor,
      nota: texto || null,
      tipo: texto ? 'NOTA' : a.tipo === 'NOTA' ? 'RESALTADO' : a.tipo,
    }
    setGuardandoEd(true)
    try {
      const r = await anotacionesService.guardar(editada)
      if (!r.correct) throw new Error(r.message)
      const nueva = { ...editada, ...r.object }
      setAnotaciones((l) => l.map((x) => (x.id === a.id ? nueva : x)))
      control.current?.actualizarAnotacion(nueva)
      showToast('success', texto ? MENSAJES.notaGuardada : MENSAJES.resaltadoGuardado)
      setHoja(null)
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDeError(e))
    } finally {
      setGuardandoEd(false)
    }
  }

  // ---------------------------------------------------------------- marcador (cinta)
  const marcadorAqui = useMemo(
    () =>
      ubic
        ? (anotaciones.find(
            (a) =>
              a.tipo === 'MARCADOR' && ((a.fraseInicio && ubic.frases.includes(a.fraseInicio)) || a.cfi === ubic.cfi),
          ) ?? null)
        : null,
    [anotaciones, ubic],
  )

  const alternarMarcador = async () => {
    if (!ubic || !libro) return
    try {
      if (marcadorAqui) {
        const r = await anotacionesService.borrar(marcadorAqui.id as string)
        if (!r.correct) throw new Error(r.message)
        setAnotaciones((l) => l.filter((x) => x.id !== marcadorAqui.id))
        showToast('info', 'Marcador quitado.')
        return
      }
      const r = await anotacionesService.guardar({
        ejemplarId: id,
        tipo: 'MARCADOR',
        color: LECTOR_PAPEL.cinta,
        cfi: ubic.cfi,
        fraseInicio: ubic.fraseId,
        offsetInicio: 0,
        fraseFin: ubic.fraseId,
        offsetFin: 0,
        versionTexto: 1,
        textoCitado: ubic.textoInicio,
        prefijo: null,
        sufijo: null,
        nota: null,
        capitulo: ubic.capitulo,
      })
      if (!r.correct) throw new Error(r.message)
      setAnotaciones((l) => [...l, r.object])
      showToast('success', 'Página marcada.')
    } catch (e) {
      showToast('error', MENSAJES.errorGuardar, mensajeDeError(e))
    }
  }

  const capituloVisible = ubic?.capitulo ?? null
  useEffect(() => {
    if (modoTr === 'original' || capituloVisible == null || capsTraducidos.current.has(capituloVisible)) return
    let vivo = true
    let t: ReturnType<typeof setTimeout> | null = null
    const pedir = async () => {
      try {
        setEstadoTr('traduciendo')
        const r = await traduccionService.capitulo({ ejemplarId: id, capitulo: capituloVisible, destino: 'es' })
        if (!vivo) return
        if (!r.correct || !r.object) throw new Error(r.message)
        if (r.object.estado === 'PENDIENTE') {
          t = setTimeout(pedir, 3000)
          return
        }
        if (r.object.estado === 'ERROR') throw new Error(r.object.error || 'No se pudo traducir este capítulo.')
        capsTraducidos.current.add(capituloVisible)
        const nuevas = Object.fromEntries(r.object.frases.map((x) => [x.id, x.texto]))
        setFrasesTr((m) => ({ ...m, ...nuevas }))
        setEstadoTr('listo')
      } catch (e) {
        if (!vivo) return
        setEstadoTr('error')
        showToast('error', 'No se pudo traducir', mensajeDeError(e))
      }
    }
    pedir()
    return () => {
      vivo = false
      if (t) clearTimeout(t)
    }
  }, [modoTr, capituloVisible, id, showToast])

  const traducirSeleccion = async (s: Seleccion) => {
    setTrSel({ seleccion: s, traduccion: null, error: null })
    setHoja('traducir')
    try {
      const r = await traduccionService.traducir({ texto: s.texto, origen: 'auto', destino: 'es' })
      if (!r.correct || !r.object) throw new Error(r.message)
      setTrSel({ seleccion: s, traduccion: r.object.traduccion, error: null })
    } catch (e) {
      setTrSel({ seleccion: s, traduccion: null, error: mensajeDeError(e) })
    }
  }

  /** La traducción en voz alta con la voz del sistema (no hay audio del taller para un trozo suelto). */
  const decirTraduccion = (texto: string) => {
    const sintesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!sintesis || typeof SpeechSynthesisUtterance === 'undefined') {
      showToast('info', 'Este navegador no puede leer la traducción en voz alta.')
      return
    }
    motor.pausar()
    sintesis.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    u.lang = 'es-ES'
    sintesis.speak(u)
  }

  const escucharDesde = (fraseId: string | null) => {
    if (!libro) return
    escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad, desdeFrase: fraseId })
    control.current?.seguirVoz()
    setSeleccion(null)
  }

  const buscar = async () => {
    setBuscando(true)
    setResultados(await (control.current?.buscar(busqueda) ?? Promise.resolve([])))
    setBuscando(false)
  }

  // ---------------------------------------------------------------- derivados
  const papel = PAPELES[prefs.temaPapel]
  /* «Traducir» y «Ver en español» solo si el libro no está en español (QA RW-06). */
  const traducible = ofrecerTraduccion(libro?.idioma, info.idioma)
  const vozAqui = voz.libro?.ejemplarId === id && voz.fase !== 'inactivo'
  const hayMini = !!voz.libro && voz.fase !== 'inactivo'
  const etiquetaDe = useCallback(
    (f: number) => {
      const s = [...info.secciones].reverse().find((x) => x.fraccion <= f + 1e-6)
      return `${s?.titulo ? `${s.titulo} · ` : ''}${Math.round(f * 100)} %`
    },
    [info.secciones],
  )
  const minutosDe = useCallback(
    (cap: number) => libro?.capitulos.find((c) => c.indice === cap)?.minutos ?? null,
    [libro],
  )
  /* El modo de esta ventana (Pasar páginas · Hojas · Libro abierto): lo elegido o, si no, el que le va. */
  const modo = modoEfectivo(prefs, width, height)
  const prefsLector = useMemo(() => ({ ...prefs, modo }), [prefs, modo])
  const traduccionLector = useMemo(() => ({ modo: modoTr, frases: frasesTr }), [modoTr, frasesTr])
  const suave = reducirMovimiento() ? {} : { transition: 'transform 280ms ease, opacity 280ms ease' }
  const pieAbajo = hayMini ? ALTO_MINI : 0
  const posMenu = seleccion
    ? posicionMenu(seleccion, tamMenu, {
        ancho: width,
        alto: height,
        arriba: cromo ? ALTO_BARRA_LECTOR : 0,
        abajo: pieAbajo + (cromo ? 60 : 0),
      })
    : null

  if (error) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <EstadoError
          titulo={MENSAJES.lectorFallo}
          mensaje={error}
          onReintentar={() => navigation.replace('Leer', { id })}
        />
        <Button title="Volver" variant="ghost" onPress={() => volverOInicio(navigation)} />
      </View>
    )
  }
  if (!listo || !libro || !libro.archivoId) return <Spinner fullScreen />

  return (
    <View style={[styles.flex, { backgroundColor: papel.fondo }]} testID="pantalla-lector">
      {/* El libro acaba encima del mini reproductor: así nunca tapa la última línea. */}
      <View
        style={[styles.flex, hayMini && web({ paddingBottom: `calc(${ALTO_MINI}px + env(safe-area-inset-bottom))` })]}
      >
        <View style={styles.flex}>
          <LectorFoliate
            ref={control}
            ejemplarId={id}
            url={urlLibro(libro.archivoId)}
            prefs={prefsLector}
            inicial={inicial}
            anotaciones={anotaciones}
            titulo={libro.titulo}
            idioma={libro.idioma}
            minutosDe={minutosDe}
            traduccion={traduccionLector}
            onListo={setInfo}
            onReubicar={alReubicar}
            onSeleccion={setSeleccion}
            onTocarAnotacion={abrirAnotacion}
            onSiguiendoVoz={setSiguiendoVoz}
            onPuedeVolver={setPuedeVolver}
            onError={setError}
            onToqueCentro={() =>
              setCromo((c) => {
                if (!c) ocultarLuego(LECTOR_PAPEL.barraSeVaMs + 1500)
                return !c
              })
            }
          />
          {/* La cinta del marcador: cuelga de la página marcada. Tocarla la quita. */}
          {marcadorAqui ? (
            <Pressable
              onPress={alternarMarcador}
              accessibilityRole="button"
              accessibilityLabel="Página marcada. Quitar el marcador"
              testID="cinta-marcador"
              style={[
                styles.cinta,
                web({ position: 'absolute', top: 0, right: width >= 1100 ? '14%' : 18, zIndex: 15 }),
              ]}
            >
              <View
                style={[
                  styles.cintaTela,
                  { backgroundColor: LECTOR_PAPEL.cinta },
                  web({
                    clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
                    backgroundImage: `repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 3px), linear-gradient(90deg, ${LECTOR_PAPEL.cinta} 0%, ${LECTOR_PAPEL.cintaLuz} 45%, ${LECTOR_PAPEL.cinta} 100%)`,
                    filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.35))',
                    animation: reducirMovimiento() ? undefined : 'bahCinta 360ms ease-out',
                  }),
                ]}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* El asa de latón (QA RW-02): siempre a mano mientras la barra está escondida. Un toque la trae. */}
      {!cromo ? (
        <Pressable
          onPress={mostrarBarra}
          accessibilityRole="button"
          accessibilityLabel="Mostrar la barra del lector"
          testID="asa-barra"
          style={({ pressed }) => [
            styles.asa,
            web({ position: 'absolute', top: 'env(safe-area-inset-top)', left: 4, cursor: 'pointer' }),
            pressed && styles.presionado,
          ]}
        >
          <View
            style={[
              styles.asaPomo,
              web({
                backgroundImage: 'radial-gradient(circle at 35% 30%, #FFF1C8, #C9A227 58%, #7A5A14)',
                boxShadow: '0 2px 5px rgba(0,0,0,0.35), inset 0 -1px 2px rgba(0,0,0,0.3)',
                opacity: 0.78,
              }),
            ]}
          >
            <Icono nombre="down" color="#3A2416" tamano={16} />
          </View>
        </Pressable>
      ) : null}

      {/* Barra de arriba: vive en el margen del libro y se va sola. */}
      <View
        aria-hidden={!cromo}
        pointerEvents={cromo ? 'auto' : 'none'}
        style={[
          styles.arriba,
          { backgroundColor: papel.fondo, borderBottomColor: 'rgba(201,162,39,0.45)' },
          web({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            backdropFilter: 'blur(8px)',
            transform: cromo ? 'translateY(0)' : 'translateY(-100%)',
            opacity: cromo ? 0.98 : 0,
            ...suave,
          }),
        ]}
        testID="barra-lector"
      >
        <BotonIcono
          icono="back"
          etiqueta="Volver a la ficha"
          color={papel.tinta}
          onPress={() => volverOInicio(navigation)}
        />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.titulo, { color: papel.tinta }]}>
            {libro.titulo}
          </Text>
          <Text numberOfLines={1} style={[styles.sub, { color: papel.tinta }]}>
            {ubic?.etiqueta || ' '}
          </Text>
        </View>
        <BotonIcono
          icono="indice"
          etiqueta="Índice"
          color={papel.tinta}
          onPress={() => setHoja('indice')}
          testID="abrir-indice"
        />
        <BotonIcono
          icono="search"
          etiqueta="Buscar en el libro"
          color={papel.tinta}
          onPress={() => setHoja('buscar')}
        />
        <BotonIcono
          icono="bookmark"
          etiqueta={marcadorAqui ? 'Quitar el marcador de esta página' : 'Marcar esta página'}
          color={marcadorAqui ? LECTOR_PAPEL.cinta : papel.tinta}
          activo={!!marcadorAqui}
          onPress={alternarMarcador}
          testID="marcar-pagina"
        />
        <BotonIcono
          icono="texto"
          etiqueta="Letra, papel y márgenes"
          color={papel.tinta}
          onPress={() => setHoja('ajustes')}
          testID="abrir-ajustes-lector"
        />
        <BotonIcono
          icono="auriculares"
          etiqueta="Escuchar desde aquí"
          color={papel.tinta}
          onPress={() => escucharDesde(ubic?.fraseId ?? null)}
          testID="escuchar-aqui"
        />
      </View>

      {/* «Traduciendo…»: una cinta de latón discreta bajo el margen de arriba. */}
      {modoTr !== 'original' && estadoTr === 'traduciendo' ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.traduciendo,
            { borderColor: 'rgba(201,162,39,0.6)', backgroundColor: papel.fondo },
            web({
              position: 'absolute',
              top: ALTO_BARRA_LECTOR + 8,
              alignSelf: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            }),
          ]}
        >
          <Text style={[styles.traduciendoTexto, { color: papel.tinta }]}>Traduciendo el capítulo…</Text>
        </View>
      ) : null}

      {/* "¿Ir allí?" */}
      {ofrecer ? (
        <View
          style={[
            styles.aviso,
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web({
              position: 'absolute',
              top: ALTO_BARRA_LECTOR + 12,
              left: 12,
              right: 12,
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
            }),
          ]}
          accessibilityRole="alert"
        >
          <Text style={[styles.avisoTexto, { color: colors.text }]}>
            Seguiste en {ofrecer.dispositivo ?? 'otro dispositivo'} hasta {describirPosicion(ofrecer, libro.capitulos)}.
            ¿Ir allí?
          </Text>
          <View style={styles.fila}>
            <Button
              title="Ir allí"
              size="small"
              onPress={() => {
                control.current?.irA({ cfi: ofrecer.cfi, fraseId: ofrecer.fraseId, fraccion: ofrecer.porcentaje / 100 })
                setOfrecer(null)
              }}
              testID="ir-alli"
            />
            <Button title="Quedarme aquí" size="small" variant="ghost" onPress={() => setOfrecer(null)} />
          </View>
        </View>
      ) : null}

      {/* Menú de la selección: encima o debajo del texto elegido, nunca sobre él, con su flechita. */}
      {seleccion ? (
        <View
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout
            if (Math.abs(w - tamMenu.ancho) > 1 || Math.abs(h - tamMenu.alto) > 1) setTamMenu({ ancho: w, alto: h })
          }}
          style={[
            styles.menuSel,
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web({
              position: 'fixed',
              left: posMenu?.left,
              top: posMenu?.top,
              zIndex: 60,
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
              animation: reducirMovimiento() ? undefined : 'bahMenu 160ms ease-out',
            }),
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Qué hacer con el texto elegido"
          testID="menu-seleccion"
        >
          <View
            pointerEvents="none"
            style={[
              styles.flecha,
              { backgroundColor: colors.surface, borderColor: colors.primaryLight },
              posMenu?.debajo
                ? { top: -8, borderBottomWidth: 0, borderRightWidth: 0 }
                : { bottom: -8, borderTopWidth: 0, borderLeftWidth: 0 },
              { left: (posMenu?.flechaX ?? 20) - 8 },
            ]}
          />
          <View style={styles.fila}>
            {COLORES_RESALTADO.map((c) => (
              <Pressable
                key={c.clave}
                onPress={() => guardarAnotacion('RESALTADO', c.hex, null)}
                accessibilityRole="button"
                accessibilityLabel={`Resaltar en ${c.nombre}`}
                style={({ pressed }) => [
                  styles.colorMenu,
                  pressed && styles.presionado,
                  web({ transition: 'transform 120ms ease' }),
                ]}
              >
                <View
                  style={[
                    styles.colorMuestra,
                    { backgroundColor: c.hex },
                    web({
                      backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.35), rgba(0,0,0,0.12))`,
                      boxShadow: 'inset 0 -2px 3px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.35)',
                    }),
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <View style={styles.fila}>
            <BotonIcono icono="nota" etiqueta="Añadir una nota" onPress={() => setHoja('nota')} />
            <BotonIcono
              icono="copiar"
              etiqueta="Copiar"
              onPress={() => {
                navigator.clipboard
                  ?.writeText(seleccion.texto)
                  .then(() => showToast('info', MENSAJES.copiado))
                  .catch(() => {})
              }}
            />
            <BotonIcono
              icono="auriculares"
              etiqueta="Escuchar desde aquí"
              onPress={() => escucharDesde(seleccion.fraseInicio)}
            />
            {traducible ? (
              <Pressable
                onPress={() => traducirSeleccion(seleccion)}
                accessibilityRole="button"
                accessibilityLabel="Traducir al español"
                testID="traducir-seleccion"
                style={({ pressed }) => [
                  styles.pastilla,
                  { borderColor: colors.primaryLight },
                  web({ backgroundImage: 'linear-gradient(180deg, rgba(217,163,91,0.28), rgba(201,162,39,0.12))' }),
                  pressed && styles.presionado,
                ]}
              >
                <Text style={[styles.pastillaTexto, { color: colors.text }]}>A→es Traducir</Text>
              </Pressable>
            ) : null}
            <BotonIcono
              icono="close"
              etiqueta="Cerrar el menú"
              onPress={() => {
                control.current?.limpiarSeleccion()
                setSeleccion(null)
              }}
            />
          </View>
        </View>
      ) : null}

      {/* Volver a la voz / a la posición anterior. */}
      <View
        style={[
          styles.flotantes,
          web({ position: 'absolute', bottom: pieAbajo + (cromo ? 76 : 20), left: 0, right: 0, ...suave }),
        ]}
        pointerEvents="box-none"
      >
        {vozAqui && !siguiendoVoz ? (
          <Button
            title="↩ Volver a la voz"
            size="small"
            onPress={() => control.current?.seguirVoz()}
            testID="volver-voz"
          />
        ) : null}
        {verVolver ? (
          <Button
            title="↶ Mi posición anterior"
            size="small"
            variant="secondary"
            onPress={() => {
              setVerVolver(false)
              control.current?.volverAtras()
            }}
            testID="posicion-anterior"
          />
        ) : null}
      </View>

      {/* Barra de abajo: avance con vista previa del capítulo. También se va sola. */}
      <View
        aria-hidden={!cromo}
        pointerEvents={cromo ? 'auto' : 'none'}
        style={[
          styles.abajo,
          { backgroundColor: papel.fondo, borderTopColor: 'rgba(201,162,39,0.45)' },
          web({
            position: 'absolute',
            bottom: pieAbajo,
            left: 0,
            right: 0,
            paddingBottom: hayMini ? 0 : 'env(safe-area-inset-bottom)',
            transform: cromo ? 'translateY(0)' : 'translateY(110%)',
            opacity: cromo ? 0.98 : 0,
            ...suave,
          }),
        ]}
      >
        {vistaPrevia != null ? (
          <Text style={[styles.previa, { color: papel.tinta }]}>{etiquetaDe(vistaPrevia)}</Text>
        ) : null}
        <View style={styles.fila}>
          <BotonIcono
            icono="left"
            etiqueta="Página anterior"
            color={papel.tinta}
            onPress={() => control.current?.anterior()}
          />
          <View style={styles.flex}>
            <Deslizador
              valor={Math.round((ubic?.fraccion ?? 0) * 1000)}
              min={0}
              max={1000}
              paso={1}
              etiqueta="Avance en el libro"
              textoValor={(v) => etiquetaDe(v / 1000)}
              onCambio={(v) => setVistaPrevia(v / 1000)}
              onSoltar={(v) => {
                setVistaPrevia(null)
                control.current?.irA({ fraccion: v / 1000 })
              }}
              testID="deslizador-avance"
            />
          </View>
          <Text style={[styles.pct, { color: papel.tinta }]}>{Math.round((ubic?.fraccion ?? 0) * 100)} %</Text>
          <BotonIcono
            icono="right"
            etiqueta="Página siguiente"
            color={papel.tinta}
            onPress={() => control.current?.siguiente()}
          />
        </View>
      </View>

      {/* Índice. */}
      <Hoja visible={hoja === 'indice'} titulo="Índice" onCerrar={() => setHoja(null)}>
        {(info.indice.length
          ? info.indice
          : libro.capitulos.map((c) => ({ titulo: c.titulo, href: '', nivel: 0, indice: c.indice }))
        ).map((i, n) => (
          <Pressable
            key={`${i.href}-${n}`}
            onPress={() => {
              setHoja(null)
              if (i.href) control.current?.irA({ href: i.href })
            }}
            accessibilityRole="button"
            accessibilityLabel={`Ir a ${i.titulo}`}
            style={[styles.itemIndice, { paddingLeft: 8 + i.nivel * 18, borderBottomColor: colors.border }]}
          >
            <Text
              style={[styles.itemIndiceTexto, { color: ubic?.etiqueta === i.titulo ? colors.primary : colors.text }]}
            >
              {ubic?.etiqueta === i.titulo ? '▸ ' : ''}
              {i.titulo}
            </Text>
          </Pressable>
        ))}
      </Hoja>

      {/* Buscar. Al cerrar sin elegir, las marcas se van (UX-13). */}
      <Hoja
        visible={hoja === 'buscar'}
        titulo="Buscar en el libro"
        onCerrar={() => {
          setHoja(null)
          control.current?.limpiarBusqueda()
        }}
      >
        <Input
          label=""
          accessibilityLabel="Texto a buscar"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Palabra o frase"
          onSubmitEditing={buscar}
        />
        <Button title="Buscar" icono="search" loading={buscando} onPress={buscar} />
        {resultados && !resultados.length ? <AppText variant="caption">Nada encontrado.</AppText> : null}
        {resultados?.map((r, i) => (
          <Pressable
            key={`${r.cfi}-${i}`}
            onPress={() => {
              setHoja(null)
              control.current?.irA({ cfi: r.cfi })
            }}
            accessibilityRole="button"
            accessibilityLabel={`${r.capitulo}: ${r.antes}${r.coincidencia}${r.despues}`}
            style={[styles.resultado, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.sub, { color: colors.textMuted }]}>{r.capitulo}</Text>
            <Text style={[styles.resultadoTexto, { color: colors.text }]}>
              …{r.antes}
              <Text style={[styles.coincidencia, { color: colors.text }]}>{r.coincidencia}</Text>
              {r.despues}…
            </Text>
          </Pressable>
        ))}
      </Hoja>

      {/* Letra, papel, márgenes. */}
      <Hoja visible={hoja === 'ajustes'} titulo="Leer a tu manera" onCerrar={() => setHoja(null)}>
        <AppText variant="label">Cómo leer</AppText>
        <SelectorModo
          opciones={opcionesDeModo(width, height)}
          actual={modo}
          onElegir={(m) => cambiar({ modo: m, modoElegido: true })}
        />
        <AppText variant="label">Papel</AppText>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Papel">
          {(Object.keys(PAPELES) as (keyof typeof PAPELES)[]).map((k) => (
            <Chip
              key={k}
              rol="radio"
              etiqueta={PAPELES[k].nombre}
              activo={prefs.temaPapel === k}
              onPress={() => cambiar({ temaPapel: k })}
            />
          ))}
        </View>
        <AppText variant="label">Letra</AppText>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Letra">
          {FUENTES_LECTOR.map((f) => (
            <Chip
              key={f.clave}
              rol="radio"
              etiqueta={f.nombre}
              activo={prefs.fuente === f.clave}
              onPress={() => cambiar({ fuente: f.clave })}
            />
          ))}
        </View>
        <AppText variant="label">Tamaño: {prefs.tamano} %</AppText>
        <Deslizador
          valor={prefs.tamano}
          min={80}
          max={200}
          paso={5}
          etiqueta="Tamaño de letra"
          textoValor={(v) => `${v} %`}
          onSoltar={(v) => cambiar({ tamano: v })}
        />
        <AppText variant="label">Márgenes: {prefs.margen} %</AppText>
        <Deslizador
          valor={prefs.margen}
          min={0}
          max={20}
          paso={1}
          etiqueta="Márgenes"
          textoValor={(v) => `${v} %`}
          onSoltar={(v) => cambiar({ margen: v })}
        />
        <AppText variant="label">Interlineado</AppText>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Interlineado">
          {[
            [1.3, 'Compacto'],
            [1.55, 'Normal'],
            [1.8, 'Aireado'],
          ].map(([v, n]) => (
            <Chip
              key={String(v)}
              rol="radio"
              etiqueta={String(n)}
              activo={prefs.interlineado === v}
              onPress={() => cambiar({ interlineado: Number(v) })}
            />
          ))}
        </View>
        <View style={styles.chips}>
          <Chip
            etiqueta={prefs.sonidos ? 'Sonido de página: sí' : 'Sonido de página: no'}
            icono={prefs.sonidos ? 'sonido' : 'silencio'}
            activo={prefs.sonidos}
            onPress={() => cambiar({ sonidos: !prefs.sonidos })}
          />
        </View>
        {traducible ? (
          <>
            <AppText variant="label">Ver en español</AppText>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Ver en español">
              {(
                [
                  ['original', 'Original'],
                  ['paralelo', 'Texto paralelo'],
                  ['solo', 'Solo en español'],
                ] as [ModoTraduccion, string][]
              ).map(([m, n]) => (
                <Chip key={m} rol="radio" etiqueta={n} activo={modoTr === m} onPress={() => setModoTr(m)} />
              ))}
            </View>
          </>
        ) : null}
        <AppText variant="label">Ir a un porcentaje</AppText>
        <View style={styles.fila}>
          <View style={styles.flex}>
            <Input
              label=""
              accessibilityLabel="Porcentaje del libro"
              value={irPct}
              onChangeText={setIrPct}
              keyboardType="number-pad"
              placeholder="0 – 100"
            />
          </View>
          <Button
            title="Ir"
            onPress={() => {
              const n = Number(irPct)
              if (Number.isFinite(n) && n >= 0 && n <= 100) {
                control.current?.irA({ fraccion: n / 100 })
                setHoja(null)
              }
            }}
          />
        </View>
      </Hoja>

      {/* Nota sobre la selección. */}
      <Hoja visible={hoja === 'nota'} titulo="Nota" onCerrar={() => setHoja(null)}>
        {seleccion ? <Text style={[styles.cita, { color: colors.textSecondary }]}>«{seleccion.texto}»</Text> : null}
        <Input label="Tu nota" value={nota} onChangeText={setNota} multiline error={errorNota} />
        <Button
          title="Guardar nota"
          onPress={async () => {
            const v = validar(esquemaNota, { nota })
            setErrorNota(v.errores.nota)
            if (!v.ok) return
            await guardarAnotacion('NOTA', COLORES_RESALTADO[1].hex, v.datos.nota)
            setNota('')
            setHoja(null)
          }}
        />
      </Hoja>

      {/* Traducir una selección. */}
      <Hoja
        visible={hoja === 'traducir' && !!trSel}
        titulo="Traducción"
        onCerrar={() => setHoja(null)}
        testID="hoja-traducir"
      >
        {trSel ? (
          <>
            <Text style={[styles.cita, { color: colors.textSecondary }]}>«{trSel.seleccion.texto}»</Text>
            {trSel.traduccion ? (
              <Text style={[styles.traduccion, { color: colors.text }]} testID="texto-traducido">
                {trSel.traduccion}
              </Text>
            ) : trSel.error ? (
              <Text style={[styles.avisoTexto, { color: colors.danger }]}>⚠ {trSel.error}</Text>
            ) : (
              <View style={styles.fila}>
                <Spinner />
                <Text style={[styles.avisoTexto, { color: colors.textSecondary }]}>Traduciendo…</Text>
              </View>
            )}
            {trSel.traduccion ? (
              <View style={styles.chips}>
                <Button
                  title="Copiar"
                  icono="copiar"
                  size="small"
                  variant="outline"
                  onPress={() => {
                    navigator.clipboard
                      ?.writeText(trSel.traduccion ?? '')
                      .then(() => showToast('info', MENSAJES.copiado))
                      .catch(() => {})
                  }}
                />
                <Button
                  title="Escuchar"
                  icono="auriculares"
                  size="small"
                  variant="outline"
                  onPress={() => decirTraduccion(trSel.traduccion ?? '')}
                />
                <Button
                  title="Guardar como nota"
                  icono="nota"
                  size="small"
                  onPress={async () => {
                    setSeleccion(trSel.seleccion)
                    await guardarAnotacionDe(
                      trSel.seleccion,
                      'NOTA',
                      COLORES_RESALTADO[2].hex,
                      `Traducción: ${trSel.traduccion}`,
                    )
                    setHoja(null)
                  }}
                />
              </View>
            ) : null}
          </>
        ) : null}
      </Hoja>

      {/* Una nota tocada en el texto: se lee, se edita, se le cambia el color o se borra (QA LV-06). */}
      <Hoja
        visible={hoja === 'anotacion' && !!anotacionVista}
        titulo={anotacionVista?.tipo === 'NOTA' ? 'Nota' : 'Resaltado'}
        onCerrar={() => setHoja(null)}
        testID="hoja-anotacion"
      >
        {anotacionVista ? (
          <>
            <Text style={[styles.cita, { color: colors.text }]}>«{anotacionVista.textoCitado}»</Text>
            <AppText variant="label">Color: {nombreColor(edColor)}</AppText>
            <View style={styles.fila} accessibilityRole="radiogroup" accessibilityLabel="Color del resaltado">
              {COLORES_RESALTADO.map((c) => {
                const elegido = c.hex.toLowerCase() === edColor.toLowerCase()
                return (
                  <Pressable
                    key={c.clave}
                    onPress={() => setEdColor(c.hex)}
                    {...estadoElegible('radio', elegido)}
                    accessibilityLabel={c.nombre}
                    style={[
                      styles.color,
                      { backgroundColor: c.hex, borderColor: elegido ? colors.text : 'transparent' },
                      elegido && styles.colorElegido,
                    ]}
                  />
                )
              })}
            </View>
            <Input
              label="Tu nota"
              value={edNota}
              onChangeText={setEdNota}
              multiline
              error={errorNota}
              placeholder="Escribe una nota (o déjala vacía para que sea solo un resaltado)"
            />
            <Button title="Guardar cambios" icono="check" loading={guardandoEd} onPress={guardarEdicion} />
            <Button
              title="Borrar"
              variant="outline"
              icono="trash"
              onPress={async () => {
                const a = anotacionVista
                const r = await anotacionesService.borrar(a.id as string)
                if (r.correct) {
                  control.current?.borrarAnotacion(a)
                  setAnotaciones((l) => l.filter((x) => x.id !== a.id))
                  showToast('success', MENSAJES.borrado)
                }
                setHoja(null)
              }}
            />
          </>
        ) : null}
      </Hoja>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  arriba: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    height: ALTO_BARRA_LECTOR,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    zIndex: 20,
  },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  sub: { fontFamily: fuentes.ui, fontSize: fontSize.xs, opacity: 0.8 },
  aviso: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, zIndex: 30, maxWidth: 560, alignSelf: 'center' },
  avisoTexto: { fontFamily: fuentes.ui, fontSize: fontSize.sm, lineHeight: 21 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  menuSel: { borderWidth: 1, borderRadius: 16, padding: 6, gap: 2, width: 344 },
  color: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, marginHorizontal: 4 },
  colorElegido: { borderWidth: 3 },
  flotantes: { alignItems: 'center', gap: 8, zIndex: 25 },
  abajo: { paddingHorizontal: 6, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  previa: { textAlign: 'center', fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  pct: {
    fontFamily: fuentes.ui,
    fontSize: fontSize.xs,
    minWidth: 40,
    textAlign: 'right',
    fontVariant: ['lining-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemIndice: { minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  itemIndiceTexto: { fontFamily: fuentes.titulo, fontSize: fontSize.md, fontVariant: ['lining-nums'] },
  resultado: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, minHeight: 48 },
  resultadoTexto: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 21 },
  coincidencia: { fontFamily: fuentes.uiSemi, backgroundColor: LECTOR_PAPEL.busquedaRelleno },
  cita: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 22, fontStyle: 'italic' },
  flecha: { position: 'absolute', width: 16, height: 16, borderWidth: 1, transform: [{ rotate: '45deg' }] },
  colorMenu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  colorMuestra: { width: 30, height: 30, borderRadius: 15 },
  presionado: { transform: [{ scale: 0.92 }], opacity: 0.85 },
  pastilla: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
  },
  pastillaTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.xs },
  traduccion: { fontFamily: fuentes.lectura, fontSize: fontSize.md, lineHeight: 26 },
  traduciendo: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, zIndex: 18 },
  traduciendoTexto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.sm },
  /* La cinta se ve de 28 px, pero se toca en 48×72 (QA RW-08). */
  cinta: { width: 48, height: 72, alignItems: 'center' },
  asa: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 22 },
  asaPomo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C9A227',
  },
  cintaTela: { width: 28, height: 64 },
})

export default LectorScreen
