import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import Button from '@componentes/atoms/Button'
import Chip from '@componentes/atoms/Chip'
import Deslizador from '@componentes/atoms/Deslizador'
import Input from '@componentes/atoms/Input'
import Spinner from '@componentes/atoms/Spinner'
import AppText from '@componentes/atoms/Text'
import LectorFoliate from '@componentes/lector/LectorFoliate'
import { ControlLector, Destino, InfoLibro, ResultadoBusqueda, Seleccion, Ubicacion } from '@componentes/lector/tipos'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import EstadoError from '@componentes/molecules/EstadoError'
import Hoja from '@componentes/molecules/Hoja'
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
import { anotacionesService, librosService, progresoService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { FUENTES_LECTOR } from '@tema/fuentes'
import { PAPELES } from '@tema/papel'
import { web } from '@tema/web'
import type { AnotacionDTO, EjemplarDetalleDTO, ProgresoDTO } from '@tipos'
import { escucharLibro } from '@utils/escuchar'
import { MENSAJES } from '@utils/mensajes'
import { esteDispositivo, guardarProgresoLocal, leerProgresoLocal } from '@utils/progresoLocal'
import { esquemaNota, validar } from '@validaciones/index'

type Props = NativeStackScreenProps<Rutas, 'Leer'>
type HojaAbierta = 'indice' | 'ajustes' | 'buscar' | 'nota' | 'anotacion' | null

const CADA_LOCAL = 5000
const CADA_SERVIDOR = 15000

/*
 * EL LECTOR (plan §7). Al abrir SIEMPRE se pregunta al servidor dónde ibas y
 * se retoma exactamente ahí (frase o CFI). Si otro dispositivo fue más lejos
 * después, se ofrece: "Seguiste en el iPhone hasta el capítulo 7 — ¿ir allí?".
 */
const LectorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { id, frase, cfi } = route.params
  const { colors } = useTheme()
  const { prefs, cambiar } = usePreferencias()
  const { showToast } = useToast()
  const voz = useVoz()
  const { width } = useWindowDimensions()
  const control = useRef<ControlLector>(null)

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
  const [siguiendoVoz, setSiguiendoVoz] = useState(true)
  const [nota, setNota] = useState('')
  const [errorNota, setErrorNota] = useState<string | undefined>()
  const [anotacionVista, setAnotacionVista] = useState<AnotacionDTO | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusqueda[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [irPct, setIrPct] = useState('')

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
        if (!det.correct) throw new Error(det.message)
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

  // ---------------------------------------------------------------- guardar dónde vas
  const ultimo = useRef<ProgresoDTO | null>(null)
  const tLocal = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoServidor = useRef(0)

  const subir = useCallback(() => {
    const p = ultimo.current
    if (!p) return
    ultimoServidor.current = Date.now()
    progresoService.guardar(p).catch((e) => console.warn('[lector]', MENSAJES.progresoFallo, e))
  }, [])

  const alReubicar = useCallback(
    (u: Ubicacion) => {
      setUbic(u)
      setSeleccion(null)
      const vozAqui = motor.obtener().libro?.ejemplarId === id && motor.obtener().fase === 'reproduciendo'
      if (vozAqui) return
      ultimo.current = {
        ejemplarId: id,
        capitulo: u.capitulo,
        fraseId: u.fraseId,
        cfi: u.cfi,
        posicionAudioSeg: null,
        vozId: null,
        velocidad: null,
        porcentaje: Number((u.fraccion * 100).toFixed(2)),
        modo: 'VISTA',
        dispositivo: esteDispositivo(),
        actualizadoEn: new Date().toISOString(),
      }
      if (tLocal.current) clearTimeout(tLocal.current)
      tLocal.current = setTimeout(() => ultimo.current && guardarProgresoLocal(ultimo.current), CADA_LOCAL)
      if (Date.now() - ultimoServidor.current > CADA_SERVIDOR) setTimeout(subir, CADA_SERVIDOR)
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
      salir()
    }
  }, [subir])

  // ---------------------------------------------------------------- notas
  const guardarAnotacion = async (tipo: AnotacionDTO['tipo'], color: string, textoNota: string | null) => {
    const s = seleccion
    if (!s || !libro) return
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

  const escucharDesde = (fraseId: string | null) => {
    if (!libro) return
    escucharLibro(libro, { vozId: prefs.vozId, velocidad: prefs.velocidad, desdeFrase: fraseId })
    control.current?.seguirVoz()
    setSeleccion(null)
  }

  // ---------------------------------------------------------------- derivados
  const papel = PAPELES[prefs.temaPapel]
  const vozAqui = voz.libro?.ejemplarId === id && voz.fase !== 'inactivo'
  const etiquetaDe = useCallback(
    (f: number) => {
      const s = [...info.secciones].reverse().find((x) => x.fraccion <= f + 1e-6)
      return `${s?.titulo ? `${s.titulo} · ` : ''}${Math.round(f * 100)} %`
    },
    [info.secciones],
  )
  const prefsLector = useMemo(() => prefs, [prefs])
  const ancho = width

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
      <View style={styles.flex}>
        <LectorFoliate
          ref={control}
          ejemplarId={id}
          url={urlLibro(libro.archivoId)}
          prefs={prefsLector}
          inicial={inicial}
          anotaciones={anotaciones}
          onListo={setInfo}
          onReubicar={alReubicar}
          onSeleccion={setSeleccion}
          onTocarAnotacion={(a) => {
            setAnotacionVista(a)
            setHoja('anotacion')
          }}
          onSiguiendoVoz={setSiguiendoVoz}
          onPuedeVolver={setPuedeVolver}
          onError={setError}
          onToqueCentro={() => setCromo((c) => !c)}
        />
      </View>

      {/* Barra de arriba. */}
      {cromo ? (
        <View
          style={[
            styles.arriba,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
            web({ position: 'absolute', top: 0, left: 0, right: 0, backdropFilter: 'blur(8px)', opacity: 0.97 }),
          ]}
        >
          <BotonIcono icono="back" etiqueta="Volver a la ficha" onPress={() => volverOInicio(navigation)} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.titulo, { color: colors.text }]}>
              {libro.titulo}
            </Text>
            <Text numberOfLines={1} style={[styles.sub, { color: colors.textSecondary }]}>
              {ubic?.etiqueta || ' '}
            </Text>
          </View>
          <BotonIcono icono="indice" etiqueta="Índice" onPress={() => setHoja('indice')} testID="abrir-indice" />
          <BotonIcono icono="search" etiqueta="Buscar en el libro" onPress={() => setHoja('buscar')} />
          <BotonIcono
            icono="texto"
            etiqueta="Letra, papel y márgenes"
            onPress={() => setHoja('ajustes')}
            testID="abrir-ajustes-lector"
          />
          <BotonIcono
            icono="auriculares"
            etiqueta="Escuchar desde aquí"
            onPress={() => escucharDesde(ubic?.fraseId ?? null)}
            testID="escuchar-aqui"
          />
        </View>
      ) : null}

      {/* "¿Ir allí?" */}
      {ofrecer ? (
        <View
          style={[
            styles.aviso,
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web({ position: 'absolute', top: 70, left: 12, right: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }),
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

      {/* Menú de la selección. */}
      {seleccion ? (
        <View
          style={[
            styles.menuSel,
            { backgroundColor: colors.surface, borderColor: colors.primaryLight },
            web({
              position: 'fixed',
              left: Math.max(8, Math.min(ancho - 340, seleccion.x + seleccion.ancho / 2 - 166)),
              top: seleccion.y > 140 ? seleccion.y - 112 : seleccion.y + seleccion.alto + 12,
              zIndex: 60,
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            }),
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Qué hacer con el texto elegido"
        >
          <View style={styles.fila}>
            {COLORES_RESALTADO.map((c) => (
              <Pressable
                key={c.clave}
                onPress={() => guardarAnotacion('RESALTADO', c.hex, null)}
                accessibilityRole="button"
                accessibilityLabel={`Resaltar en ${c.nombre}`}
                style={[styles.color, { backgroundColor: c.hex, borderColor: colors.text }]}
              />
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
        style={[styles.flotantes, web({ position: 'absolute', bottom: cromo ? 108 : 20, left: 0, right: 0 })]}
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
        {puedeVolver ? (
          <Button
            title="↶ Mi posición anterior"
            size="small"
            variant="secondary"
            onPress={() => control.current?.volverAtras()}
          />
        ) : null}
      </View>

      {/* Barra de abajo: avance con vista previa del capítulo. */}
      {cromo ? (
        <View
          style={[
            styles.abajo,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
            web({
              position: 'absolute',
              bottom: vozAqui ? 62 : 0,
              left: 0,
              right: 0,
              paddingBottom: 'env(safe-area-inset-bottom)',
            }),
          ]}
        >
          {vistaPrevia != null ? (
            <Text style={[styles.previa, { color: colors.primary }]}>{etiquetaDe(vistaPrevia)}</Text>
          ) : null}
          <View style={styles.fila}>
            <BotonIcono icono="left" etiqueta="Página anterior" onPress={() => control.current?.anterior()} />
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
            <Text style={[styles.pct, { color: colors.textSecondary }]}>
              {Math.round((ubic?.fraccion ?? 0) * 100)} %
            </Text>
            <BotonIcono icono="right" etiqueta="Página siguiente" onPress={() => control.current?.siguiente()} />
          </View>
        </View>
      ) : null}

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

      {/* Buscar. */}
      <Hoja
        visible={hoja === 'buscar'}
        titulo="Buscar en el libro"
        onCerrar={() => {
          setHoja(null)
        }}
      >
        <Input
          label=""
          accessibilityLabel="Texto a buscar"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Palabra o frase"
          onSubmitEditing={async () => {
            setBuscando(true)
            setResultados(await (control.current?.buscar(busqueda) ?? Promise.resolve([])))
            setBuscando(false)
          }}
        />
        <Button
          title="Buscar"
          icono="search"
          loading={buscando}
          onPress={async () => {
            setBuscando(true)
            setResultados(await (control.current?.buscar(busqueda) ?? Promise.resolve([])))
            setBuscando(false)
          }}
        />
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
              <Text style={{ color: colors.primary, fontFamily: fuentes.uiSemi }}>{r.coincidencia}</Text>
              {r.despues}…
            </Text>
          </Pressable>
        ))}
      </Hoja>

      {/* Letra, papel, márgenes. */}
      <Hoja visible={hoja === 'ajustes'} titulo="Leer a tu manera" onCerrar={() => setHoja(null)}>
        <AppText variant="label">Papel</AppText>
        <View style={styles.chips}>
          {(Object.keys(PAPELES) as (keyof typeof PAPELES)[]).map((k) => (
            <Chip
              key={k}
              etiqueta={PAPELES[k].nombre}
              activo={prefs.temaPapel === k}
              onPress={() => cambiar({ temaPapel: k })}
            />
          ))}
        </View>
        <AppText variant="label">Letra</AppText>
        <View style={styles.chips}>
          {FUENTES_LECTOR.map((f) => (
            <Chip
              key={f.clave}
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
        <View style={styles.chips}>
          {[
            [1.3, 'Compacto'],
            [1.55, 'Normal'],
            [1.8, 'Aireado'],
          ].map(([v, n]) => (
            <Chip
              key={String(v)}
              etiqueta={String(n)}
              activo={prefs.interlineado === v}
              onPress={() => cambiar({ interlineado: Number(v) })}
            />
          ))}
        </View>
        <AppText variant="label">Pasar las páginas</AppText>
        <View style={styles.chips}>
          <Chip
            etiqueta="Por páginas"
            activo={prefs.modo === 'paginado'}
            onPress={() => cambiar({ modo: 'paginado' })}
          />
          <Chip
            etiqueta="Desplazamiento continuo"
            activo={prefs.modo === 'continuo'}
            onPress={() => cambiar({ modo: 'continuo' })}
          />
          <Chip
            etiqueta={prefs.sonidos ? 'Sonido de página: sí' : 'Sonido de página: no'}
            icono={prefs.sonidos ? 'sonido' : 'silencio'}
            activo={prefs.sonidos}
            onPress={() => cambiar({ sonidos: !prefs.sonidos })}
          />
        </View>
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

      {/* Una nota tocada en el texto. */}
      <Hoja
        visible={hoja === 'anotacion' && !!anotacionVista}
        titulo={anotacionVista?.tipo === 'NOTA' ? 'Nota' : 'Resaltado'}
        onCerrar={() => setHoja(null)}
      >
        {anotacionVista ? (
          <>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Color: {nombreColor(anotacionVista.color)}
            </Text>
            <Text style={[styles.cita, { color: colors.text }]}>«{anotacionVista.textoCitado}»</Text>
            {anotacionVista.nota ? (
              <Text style={[styles.avisoTexto, { color: colors.primary }]}>✎ {anotacionVista.nota}</Text>
            ) : null}
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
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    zIndex: 20,
  },
  titulo: { fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  sub: { fontFamily: fuentes.ui, fontSize: fontSize.xs },
  aviso: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, zIndex: 30, maxWidth: 560, alignSelf: 'center' },
  avisoTexto: { fontFamily: fuentes.ui, fontSize: fontSize.sm, lineHeight: 21 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuSel: { borderWidth: 1, borderRadius: 14, padding: 8, gap: 4, width: 332 },
  color: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, marginHorizontal: 4 },
  flotantes: { alignItems: 'center', gap: 8, zIndex: 25 },
  abajo: { paddingHorizontal: 6, paddingTop: 2, borderTopWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  previa: { textAlign: 'center', fontFamily: fuentes.tituloNegrita, fontSize: fontSize.md },
  pct: { fontFamily: fuentes.ui, fontSize: fontSize.xs, minWidth: 40, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemIndice: { minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  itemIndiceTexto: { fontFamily: fuentes.titulo, fontSize: fontSize.md },
  resultado: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2, minHeight: 48 },
  resultadoTexto: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 21 },
  cita: { fontFamily: fuentes.lectura, fontSize: fontSize.sm, lineHeight: 22, fontStyle: 'italic' },
})

export default LectorScreen
