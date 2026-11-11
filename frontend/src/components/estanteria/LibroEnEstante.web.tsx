import React, { CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import { createPortal } from 'react-dom'

import Barra from '@componentes/atoms/Barra'
import Icono from '@componentes/atoms/Icono'
import Lomo from '@componentes/estanteria/Lomo'
import Portada from '@componentes/estanteria/Portada'
import { PropsLibroEnEstante, etiquetaLibro } from '@componentes/estanteria/tiposLibro'
import { useTheme } from '@contextos/ThemeContext'
import { AIRE_LOMO, dimensionesLomo } from '@logica/lomos'
import { fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { fibraPapel, guardaMarmolada } from '@tema/madera'
import { reducirMovimiento } from '@tema/web'
import { abrirTapa, golpeMadera, roceMadera } from '@utils/sonidos'

/*
 * SACAR UN LIBRO DEL ESTANTE (plan §10.3, R7, plan de diseño D). Solo web: es
 * DOM y CSS 3D.
 *
 *   1. Mantener pulsado el lomo (320 ms) → el libro sale hacia ti: se adelanta,
 *      crece un poco, se inclina enseñando el CANTO de las páginas por arriba y
 *      su sombra se alarga; suena el roce de la madera. Su hueco queda vacío.
 *   2. Arrastrarlo hacia arriba → gira sobre su eje (rotateY) y va enseñando
 *      la portada. A mitad de recorrido ya se ve de frente.
 *   3. Soltar arriba → viaja al centro, crece, y la tapa se abre como una
 *      bisagra mostrando las GUARDAS MARMOLADAS y el ex libris; entra la ficha.
 *      Soltar abajo → vuelve a su hueco con un golpe sordo de madera.
 *
 * NITIDEZ (UX-26): antes se escalaba HACIA ARRIBA una capa pequeña y la portada
 * salía borrosa. Ahora el libro 3D se construye ya a su TAMAÑO FINAL y empieza
 * reducido (scale K < 1) encima de su hueco: el navegador rasteriza a tamaño
 * grande y solo escala a la baja, así que al llegar al centro está nítido.
 *
 * LA TAPA DENTRO DE LA PANTALLA: al abrirse, el libro se desplaza medio ancho a
 * la derecha (el lomo queda en el centro) y se reduce lo justo para que las dos
 * páginas quepan en el teléfono; antes la tapa se salía por la izquierda.
 *
 * Funciona con el dedo en Safari de iPhone (pointer events + un touchmove no
 * pasivo que impide que la página se desplace mientras sostienes el libro) y
 * con el ratón en el PC. Un toque corto abre la ficha directamente. Con
 * "Reducir movimiento" no hay viaje ni bisagra: se abre la ficha y ya.
 */

type Fase = 'sacado' | 'abriendo' | 'volviendo'

interface Escena {
  rect: { left: number; top: number; width: number; height: number }
  fase: Fase
  p: number
  dx: number
  dy: number
  abierta: boolean
  listo: boolean
}

const PULSACION_MS = 320
const UMBRAL_MOV = 10
const RECORRIDO = 150
const UMBRAL_ABRIR = 0.55
/** Dos movimientos con las flechas en menos de esto son el mismo toque repetido (BI-28). */
const REBOTE_FLECHA_MS = 350

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

interface Gesto {
  x0: number
  y0: number
  id: number
  temporizador: ReturnType<typeof setTimeout> | null
  sacado: boolean
  movido: boolean
  ordenando: boolean
}

const LibroEnEstante: React.FC<PropsLibroEnEstante> = (props) => {
  const {
    libro,
    modo,
    onAbrir,
    ordenando,
    indice = 0,
    total = 1,
    onMover,
    onSoltarEn,
    estanteId,
    colorFijo,
    postura = 'derecho',
    escala = 1,
  } = props
  const { colors } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const cuerpo = useRef<HTMLDivElement>(null)
  const gesto = useRef<Gesto | null>(null)
  const ultimaFlecha = useRef(0)
  const [escena, setEscena] = useState<Escena | null>(null)
  const escenaRef = useRef<Escena | null>(null)
  const [dxOrden, setDxOrden] = useState(0)
  /* Con el ratón encima (o el dedo apoyado), el libro asoma un poco: está vivo. */
  const [asoma, setAsoma] = useState(false)
  const anchoPortada = props.anchoPortada ?? 104
  const dim = dimensionesLomo(libro, escala)
  const alto = modo === 'lomo' ? dim.alto : Math.round(anchoPortada * 1.5)
  const ancho = modo === 'lomo' ? dim.grosor : anchoPortada
  const fondo = Math.round(alto / 1.5)
  const tumbado = modo === 'lomo' && postura === 'tumbado'

  const poner = useCallback((e: Escena | null | ((x: Escena | null) => Escena | null)) => {
    setEscena((prev) => {
      const sig = typeof e === 'function' ? e(prev) : e
      escenaRef.current = sig
      return sig
    })
  }, [])

  /* iOS: mientras sostienes el libro, la página no se desplaza. Tiene que ser
     un listener NO pasivo; los de React lo son y no pueden impedirlo. */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const bloquear = (e: TouchEvent) => {
      if (gesto.current?.sacado || (gesto.current?.ordenando && gesto.current.movido)) e.preventDefault()
    }
    el.addEventListener('touchmove', bloquear, { passive: false })
    return () => el.removeEventListener('touchmove', bloquear)
  }, [])

  useEffect(
    () => () => {
      if (gesto.current?.temporizador) clearTimeout(gesto.current.temporizador)
    },
    [],
  )

  const sacar = () => {
    const g = gesto.current
    const el = ref.current
    if (!g || !el) return
    g.sacado = true
    try {
      el.setPointerCapture(g.id)
    } catch {
      /* el puntero ya se soltó */
    }
    const r = (cuerpo.current ?? el).getBoundingClientRect()
    roceMadera()
    try {
      navigator.vibrate?.(12)
    } catch {
      /* sin vibración */
    }
    poner({
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      fase: 'sacado',
      p: 0,
      dx: 0,
      dy: 0,
      abierta: false,
      listo: false,
    })
    requestAnimationFrame(() => poner((x) => (x ? { ...x, listo: true } : x)))
  }

  const volver = () => {
    poner((x) => (x ? { ...x, fase: 'volviendo', p: 0, dx: 0, dy: 0 } : x))
    setTimeout(() => {
      golpeMadera()
      poner(null)
    }, 300)
  }

  const abrir = () => {
    if (reducirMovimiento()) {
      poner(null)
      onAbrir(libro)
      return
    }
    poner((x) => (x ? { ...x, fase: 'abriendo', p: 1 } : x))
    setTimeout(() => {
      abrirTapa()
      poner((x) => (x ? { ...x, abierta: true } : x))
    }, 360)
    setTimeout(() => onAbrir(libro), 1100)
    setTimeout(() => poner(null), 1550)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || escenaRef.current) return
    const g: Gesto = {
      x0: e.clientX,
      y0: e.clientY,
      id: e.pointerId,
      temporizador: null,
      sacado: false,
      movido: false,
      ordenando: !!ordenando,
    }
    gesto.current = g
    if (ordenando) {
      try {
        ref.current?.setPointerCapture(e.pointerId)
      } catch {
        /* nada */
      }
      return
    }
    g.temporizador = setTimeout(sacar, PULSACION_MS)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current
    if (!g || e.pointerId !== g.id) return
    const dx = e.clientX - g.x0
    const dy = e.clientY - g.y0
    if (g.ordenando) {
      if (Math.abs(dx) > 4) g.movido = true
      if (g.movido) setDxOrden(dx)
      return
    }
    if (!g.sacado) {
      if (Math.hypot(dx, dy) > UMBRAL_MOV) {
        if (g.temporizador) clearTimeout(g.temporizador)
        g.movido = true
      }
      return
    }
    const p = limitar(-dy / RECORRIDO, 0, 1)
    poner((x) => (x && x.fase === 'sacado' ? { ...x, p, dx: dx * 0.5, dy: Math.min(0, dy) * 0.85 } : x))
  }

  const terminar = (e: React.PointerEvent<HTMLDivElement>, cancelado: boolean) => {
    const g = gesto.current
    if (!g || e.pointerId !== g.id) return
    if (g.temporizador) clearTimeout(g.temporizador)
    gesto.current = null
    if (g.ordenando) {
      setDxOrden(0)
      if (g.movido && !cancelado) {
        golpeMadera()
        onSoltarEn?.(indice, e.clientX)
      }
      return
    }
    if (g.sacado) {
      if (!cancelado && (escenaRef.current?.p ?? 0) >= UMBRAL_ABRIR) abrir()
      else volver()
      return
    }
    if (!g.movido && !cancelado) onAbrir(libro)
  }

  /* Las flechas ‹ › al ordenar (BI-06/BI-28): un solo movimiento por toque, y
     con el ratón también (ver el contenedor de las flechas, más abajo). */
  const mover = (hasta: number) => {
    const ahora = Date.now()
    if (ahora - ultimaFlecha.current < REBOTE_FLECHA_MS) return
    ultimaFlecha.current = ahora
    onMover?.(indice, hasta)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onAbrir(libro)
    } else if (ordenando && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      const hasta = indice + (e.key === 'ArrowLeft' ? -1 : 1)
      if (hasta >= 0 && hasta < total) onMover?.(indice, hasta)
    }
  }

  const raiz: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    /* El aire a los lados es zona táctil (44 px con el lomo más fino, UX-06). */
    padding: modo === 'lomo' ? (tumbado ? `${AIRE_LOMO}px 0` : `0 ${AIRE_LOMO}px`) : undefined,
    marginLeft: postura === 'inclinado' ? Math.round(alto * 0.12) : undefined,
    touchAction: ordenando ? 'pan-y' : 'manipulation',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: ordenando ? 'grab' : 'pointer',
    outlineOffset: 3,
    transform: dxOrden ? `translate3d(${dxOrden}px, -12px, 0) rotate(${limitar(dxOrden / 30, -4, 4)}deg)` : undefined,
    transition: dxOrden ? 'none' : 'transform 200ms ease',
    zIndex: dxOrden ? 5 : undefined,
    filter: dxOrden ? 'drop-shadow(0 14px 12px rgba(0,0,0,0.5))' : undefined,
  }

  const cuerpoEstilo: CSSProperties = {
    visibility: escena ? 'hidden' : 'visible',
    filter: modo === 'lomo' ? 'drop-shadow(2px 0 2px rgba(0,0,0,0.35))' : undefined,
    transform:
      (postura === 'inclinado' ? 'rotate(-7deg) ' : '') +
        (asoma && !ordenando
          ? modo === 'lomo'
            ? 'translateY(-8px) rotate(-1.2deg)'
            : 'translateY(-6px) scale(1.02)'
          : '') || undefined,
    transformOrigin: 'bottom left',
    transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
    /* Entrada escalonada: los libros llegan uno tras otro (solo opacidad y transform). */
    animation: `bah-aparece 460ms ease ${Math.min(indice, 12) * 35}ms backwards`,
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={etiquetaLibro(libro)}
      aria-roledescription={ordenando ? 'libro que se puede mover' : 'libro'}
      data-testid={`libro-${libro.id}`}
      data-bah-estante={estanteId}
      data-bah-indice={indice}
      className="bah-libro"
      style={raiz}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => terminar(e, false)}
      onPointerCancel={(e) => terminar(e, true)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setAsoma(true)}
      onPointerLeave={() => setAsoma(false)}
    >
      <div ref={cuerpo} style={cuerpoEstilo} className="bah-libro-cuerpo">
        {modo === 'lomo' ? (
          <Lomo libro={libro} colorFijo={colorFijo} escala={escala} tumbado={tumbado} />
        ) : (
          <Portada libro={libro} ancho={anchoPortada} />
        )}
      </div>
      {props.conProgreso ? (
        <View style={{ width: anchoPortada, marginTop: 6 }}>
          <Barra porcentaje={libro.porcentaje} etiqueta={`Progreso de ${libro.titulo}`} />
        </View>
      ) : null}
      {ordenando ? (
        /* El clic de las flechas no puede empezar el arrastre del libro: si el
           pointerdown llega al libro, este captura el puntero y el clic ya no
           vuelve a la flecha (BI-06, con ratón no hacía nada). */
        <div onPointerDown={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
          <View style={styles.flechas}>
            <Pressable
              style={styles.flecha}
              disabled={indice === 0}
              onPress={() => mover(indice - 1)}
              accessibilityRole="button"
              accessibilityLabel={`Mover ${libro.titulo} a la izquierda`}
            >
              <Icono nombre="left" color={indice === 0 ? colors.textMuted : colors.text} />
            </Pressable>
            <Pressable
              style={styles.flecha}
              disabled={indice >= total - 1}
              onPress={() => mover(indice + 1)}
              accessibilityRole="button"
              accessibilityLabel={`Mover ${libro.titulo} a la derecha`}
            >
              <Icono nombre="right" color={indice >= total - 1 ? colors.textMuted : colors.text} />
            </Pressable>
          </View>
        </div>
      ) : null}
      {escena && typeof document !== 'undefined'
        ? createPortal(
            <EscenaLibro
              escena={escena}
              modo={modo}
              ancho={ancho}
              alto={alto}
              fondo={fondo}
              props={props}
              anchoPortada={anchoPortada}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

/** El tamaño final de la tapa en el centro de la pantalla. */
export const tamanoFinal = (vw: number) => {
  const W = Math.min(280, vw * 0.62)
  return { W, H: W * 1.5 }
}

/** Cuánto hay que reducir el libro abierto para que las dos páginas quepan en la pantalla. */
export const escalaAbierto = (vw: number, W: number) => Math.min(1, (vw - 24) / (2 * W))

/** El libro en 3D por encima de todo (portal al body). */
const EscenaLibro: React.FC<{
  escena: Escena
  modo: 'lomo' | 'portada'
  ancho: number
  alto: number
  fondo: number
  anchoPortada: number
  props: PropsLibroEnEstante
}> = ({ escena, modo, ancho, alto, fondo, props }) => {
  const { rect, fase, p, dx, dy, abierta, listo } = escena
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844
  const { W, H } = tamanoFinal(vw)
  /* Todo el libro se construye a su tamaño final (bw × H × bd) y empieza
     reducido con K: nítido al llegar (se rasteriza grande, se escala a la baja). */
  const K = alto / H
  const bw = ancho / K
  const bd = fondo / K
  const cxLibro = rect.left + rect.width / 2
  const cyLibro = rect.top + rect.height / 2
  const cx = vw / 2 - cxLibro
  const cy = vh / 2 - cyLibro

  let transform: string
  let transicion = 'transform 90ms linear'
  if (fase === 'abriendo') {
    transform = `translate3d(${cx}px, ${cy}px, 0) rotateX(0deg) rotateY(${modo === 'lomo' ? -90 : 0}deg) scale(1)`
    transicion = 'transform 360ms cubic-bezier(.2,.8,.2,1)'
  } else if (fase === 'volviendo' || !listo) {
    transform = `translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(${K})`
    transicion = 'transform 280ms cubic-bezier(.3,.7,.3,1)'
  } else if (modo === 'lomo') {
    transform = `translate3d(${dx}px, ${dy - 10}px, 40px) rotateX(${-10 * (1 - p) - 4 * p}deg) rotateY(${-90 * p}deg) scale(${K * (1.06 + 0.14 * p)})`
    if (p === 0) transicion = 'transform 220ms cubic-bezier(.2,.8,.2,1)'
  } else {
    transform = `translate3d(${dx}px, ${dy - 10}px, 40px) rotateX(${6 * p}deg) scale(${K * (1.06 + 0.2 * p)})`
    if (p === 0) transicion = 'transform 220ms cubic-bezier(.2,.8,.2,1)'
  }

  const sombraOpacidad = fase === 'volviendo' ? 0 : 0.35 + 0.3 * p
  const veloOpacidad = fase === 'abriendo' ? 0.78 : 0.25 * p

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: VELO,
          opacity: veloOpacidad,
          transition: 'opacity 300ms ease',
          pointerEvents: 'none',
        }}
      />
      {!abierta ? (
        <>
          {/* La sombra en el suelo del estante: se alarga cuanto más sale el libro. */}
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: cxLibro - ancho * 0.8,
              width: ancho * 1.6,
              top: rect.top + rect.height - 4 + 14 * p,
              height: 18,
              zIndex: 1001,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.9)',
              filter: `blur(${8 + 10 * p}px)`,
              opacity: fase === 'abriendo' ? 0 : sombraOpacidad,
              transform: `translateX(${dx}px)`,
              transition: 'opacity 250ms ease',
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: cxLibro - bw / 2,
              top: cyLibro - H / 2,
              width: bw,
              height: H,
              zIndex: 1001,
              perspective: 1400,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transformStyle: 'preserve-3d',
                transformOrigin: '50% 50%',
                transform,
                transition: transicion,
                willChange: 'transform',
              }}
            >
              {modo === 'lomo' ? (
                <>
                  {/* El lomo. */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: bw,
                      height: H,
                      transform: `translateZ(${bd / 2}px)`,
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <Lomo libro={props.libro} colorFijo={props.colorFijo} escala={(props.escala ?? 1) / K} />
                  </div>
                  {/* La portada (a la derecha del lomo; se ve al girar). */}
                  <div
                    style={{
                      position: 'absolute',
                      left: (bw - bd) / 2,
                      top: 0,
                      width: bd,
                      height: H,
                      transform: `rotateY(90deg) translateZ(${bw / 2}px)`,
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <Portada libro={props.libro} ancho={bd} alto={H} sombra={false} />
                  </div>
                  {/* El canto de arriba: las hojas apretadas entre las dos tapas. */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: (H - bd) / 2,
                      width: bw,
                      height: bd,
                      transform: `rotateX(90deg) translateZ(${H / 2}px)`,
                      backfaceVisibility: 'hidden',
                      backgroundColor: paleta.pergamino,
                      backgroundImage: `repeating-linear-gradient(90deg, rgba(120,85,45,0.28) 0 1px, rgba(255,255,255,0) 1px 3px), linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.2))`,
                      borderLeft: `${Math.max(3, bw * 0.06)}px solid ${paleta.nogal}`,
                      borderRight: `${Math.max(3, bw * 0.06)}px solid ${paleta.nogal}`,
                    }}
                  />
                </>
              ) : (
                <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
                  <Portada libro={props.libro} ancho={bw} alto={H} />
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <LibroAbierto W={W} H={H} vw={vw} vh={vh} props={props} />
      )}
    </>
  )
}

const VELO = 'radial-gradient(ellipse at 50% 40%, rgba(40,22,10,0.55), rgba(10,5,2,0.92))'

/** La tapa se abre como una bisagra: guardas marmoladas y el ex libris de la casa. */
const LibroAbierto: React.FC<{ W: number; H: number; vw: number; vh: number; props: PropsLibroEnEstante }> = ({
  W,
  H,
  vw,
  vh,
  props,
}) => {
  const [abrir, setAbrir] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAbrir(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  const s = escalaAbierto(vw, W)
  return (
    <div
      style={{
        position: 'fixed',
        left: vw / 2 - W / 2,
        top: vh / 2 - H / 2,
        width: W,
        height: H,
        zIndex: 1002,
        perspective: 1600,
        pointerEvents: 'none',
        transformOrigin: '0% 50%',
        /* El lomo va al centro y el libro se reduce para que la tapa abierta quepa. */
        transform: abrir ? `translateX(${W / 2}px) scale(${s})` : 'none',
        transition: 'transform 680ms cubic-bezier(.45,.05,.2,1)',
      }}
      aria-hidden
    >
      {/* La primera hoja: pergamino con el ex libris. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: paleta.pergamino,
          backgroundImage: `${fibraPapel}, linear-gradient(90deg, rgba(0,0,0,0.22), rgba(0,0,0,0) 14%)`,
          borderRadius: '2px 4px 4px 2px',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6), 2px 0 0 #E6D6B0, 4px 0 0 #D9C69C',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
        }}
      >
        <div style={{ border: `1.5px solid ${paleta.roble}`, padding: '18px 14px', textAlign: 'center', width: '82%' }}>
          <Text style={{ fontFamily: fuentes.tituloCursiva, color: paleta.roble, fontSize: 16 }}>Ex libris</Text>
          <Text
            style={{
              fontFamily: fuentes.tituloNegrita,
              color: paleta.robleOscuro,
              fontSize: 22,
              marginTop: 6,
              textAlign: 'center',
            }}
            numberOfLines={3}
          >
            {props.libro.titulo}
          </Text>
          <Text style={{ fontFamily: fuentes.titulo, color: paleta.nogal, fontSize: 15, marginTop: 8 }}>
            La Biblioteca AH
          </Text>
        </div>
      </div>
      {/* La tapa: gira sobre la bisagra izquierda; la luz cambia sobre ella al abrirse. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0% 50%',
          transformStyle: 'preserve-3d',
          transform: abrir ? 'rotateY(-164deg)' : 'rotateY(0deg)',
          transition: 'transform 680ms cubic-bezier(.45,.05,.2,1)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }}>
          <Portada libro={props.libro} ancho={W} alto={H} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, rgba(255,230,180,0) 0%, rgba(255,230,180,0.35) 100%)',
              opacity: abrir ? 1 : 0,
              transition: 'opacity 680ms ease',
            }}
          />
        </div>
        {/* El reverso de la tapa: guarda marmolada con su filete de cuero. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: 'rotateY(180deg)',
            backfaceVisibility: 'hidden',
            backgroundColor: paleta.nogal,
            backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0) 85%, rgba(0,0,0,0.3)), ${guardaMarmolada}`,
            backgroundSize: 'cover',
            borderRadius: '4px 2px 2px 4px',
            boxShadow: `inset 0 0 0 ${Math.round(W * 0.035)}px ${paleta.nogal}, inset 0 0 0 ${Math.round(W * 0.035) + 1}px ${paleta.laton}`,
          }}
        />
      </div>
    </div>
  )
}

const styles = StyleSheet.create({
  flechas: { flexDirection: 'row' },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})

export default LibroEnEstante
