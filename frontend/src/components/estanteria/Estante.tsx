import React from 'react'

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Icono from '@componentes/atoms/Icono'
import Placa from '@componentes/atoms/Placa'
import Adorno, { TIPOS_ADORNO, adornoDeBalda } from '@componentes/estanteria/Adorno'
import LibroEnEstante from '@componentes/estanteria/LibroEnEstante'
import { ModoEstante } from '@componentes/estanteria/tiposLibro'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { plural } from '@logica/formato'
import { capacidadBalda, posturas } from '@logica/lomos'
import { indiceDestino } from '@logica/orden'
import { fontSize, fuentes } from '@tema'
import { paleta } from '@tema/colors'
import { laton, tablaEstante } from '@tema/madera'
import { web } from '@tema/web'
import type { EjemplarDTO } from '@tipos'

interface Props {
  id: string
  titulo: string
  libros: EjemplarDTO[]
  modo: ModoEstante
  onAbrir: (l: EjemplarDTO) => void
  colorMadera?: string | null
  /** Si se puede ordenar a mano (Favoritos). */
  ordenable?: boolean
  ordenando?: boolean
  onAlternarOrden?: () => void
  onReordenar?: (desde: number, hasta: number) => void
  conProgreso?: boolean
  vacio?: string
  acciones?: React.ReactNode
  /** Cuántos hay de verdad (si la balda enseña solo una parte): "24 de 40" (UX-08). */
  total?: number | null
  /** "Ver todos ›": abre el catálogo en el orden de esta balda. */
  onVerTodos?: () => void
  /** Una salida cuando la balda está vacía (UX-25): "Traer libros". */
  accionVacio?: { titulo: string; icono?: string; onPress: () => void }
  /** Ancho aproximado de la balda: decide si sobra sitio para tumbar o inclinar libros. */
  anchoBalda?: number
  /** Escala de los lomos (el PC los agranda). */
  escala?: number
  /** Posición de la balda en el mueble: reparte los objetos (globo, planta, reloj) sin repetirlos seguidos. */
  indiceBalda?: number
}

/** Los centros (en x de pantalla) de los libros de un estante, tal como se ven ahora. */
const centrosDelEstante = (id: string): number[] => {
  if (typeof document === 'undefined') return []
  const nodos = Array.from(document.querySelectorAll<HTMLElement>(`[data-bah-estante="${CSS.escape(id)}"]`))
  return nodos
    .sort((a, b) => Number(a.dataset.bahIndice) - Number(b.dataset.bahIndice))
    .map((n) => {
      const r = n.getBoundingClientRect()
      return r.left + r.width / 2
    })
}

/** El texto de la placa: "7 libros", o "24 de 40" si la balda enseña solo una parte. */
export function cuentaDePlaca(enseña: number, total?: number | null): string {
  if (total != null && total > enseña) return `${enseña} de ${total}`
  return plural(enseña, 'libro')
}

/*
 * UNA BALDA DE LA LIBRERÍA: la placa de latón con el nombre y la cuenta
 * honesta, los libros de pie sobre la tabla (alineados abajo, como de verdad;
 * si sobra sitio, alguno tumbado o inclinado), un sujetalibros de latón y la
 * tabla de roble con su canto iluminado y la sombra que proyecta. El fondo es
 * el del mueble: ya no hay "cajas negras".
 */
const Estante: React.FC<Props> = ({
  id,
  titulo,
  libros,
  modo,
  onAbrir,
  colorMadera,
  ordenable,
  ordenando,
  onAlternarOrden,
  onReordenar,
  conProgreso,
  vacio,
  acciones,
  total,
  onVerTodos,
  accionVacio,
  anchoBalda = 360,
  escala = 1,
  indiceBalda,
}) => {
  const { colors, isDark } = useTheme()
  const soltarEn = (desde: number, x: number) => {
    const destino = indiceDestino(centrosDelEstante(id), x, desde)
    if (destino !== desde) onReordenar?.(desde, destino)
  }
  const cuenta = cuentaDePlaca(libros.length, total)
  /* Libros tumbados o inclinados solo cuando la balda no se ordena a mano
     (al ordenar, cada libro tiene que estar en su sitio y de pie). */
  const posturasLibros =
    modo === 'lomo' && !ordenable ? posturas(libros.length, capacidadBalda(anchoBalda / escala)) : null
  const tumbados = posturasLibros ? libros.filter((_, i) => posturasLibros[i] === 'tumbado') : []
  const tinta = isDark ? colors.text : paleta.robleOscuro
  /* Con pocos libros, un objeto al final de la balda en vez de madera vacía (uno, sutil). */
  const conAdorno = libros.length > 0 && libros.length <= capacidadBalda(anchoBalda / escala) - 3

  const libro = (l: EjemplarDTO, i: number) => (
    <LibroEnEstante
      key={l.id}
      libro={l}
      modo={modo}
      onAbrir={onAbrir}
      colorFijo={null}
      ordenando={ordenando}
      estanteId={id}
      indice={i}
      total={libros.length}
      onMover={(d, h) => onReordenar?.(d, h)}
      onSoltarEn={soltarEn}
      conProgreso={conProgreso}
      postura={posturasLibros?.[i]}
      escala={escala}
    />
  )

  return (
    <View style={styles.balda} testID={`estante-${id}`}>
      <View style={styles.cabecera}>
        <Placa titulo={titulo} detalle={cuenta} accessibilityLabel={`${titulo}, ${cuenta}`} />
        <View style={styles.acciones}>
          {onVerTodos && total != null && total > libros.length ? (
            <Pressable
              onPress={onVerTodos}
              accessibilityRole="link"
              accessibilityLabel={`Ver todos los de ${titulo}`}
              testID={`ver-todos-${id}`}
              style={({ pressed }) => [styles.verTodos, pressed && { opacity: 0.7 }, web({ cursor: 'pointer' })]}
            >
              <Text style={[styles.verTodosTexto, { color: isDark ? colors.primary : paleta.robleOscuro }]}>
                Ver todos ›
              </Text>
            </Pressable>
          ) : null}
          {acciones}
          {ordenable && libros.length > 1 ? (
            <BotonIcono
              icono={ordenando ? 'check' : 'orden'}
              etiqueta={ordenando ? 'Terminar de ordenar' : `Ordenar ${titulo}`}
              onPress={() => onAlternarOrden?.()}
              activo={ordenando}
              testID={`ordenar-${id}`}
              color={ordenando ? undefined : tinta}
            />
          ) : null}
        </View>
      </View>
      {ordenando ? (
        <Text style={[styles.ayuda, { color: tinta }]}>
          Arrastra un libro a su nuevo sitio, o usa las flechas ‹ ›. Toca ✓ al terminar.
        </Text>
      ) : null}

      <View
        style={[
          styles.hueco,
          colorMadera ? { backgroundColor: colorMadera } : null,
          /* La sombra que la balda de arriba deja sobre el fondo del mueble. */
          web({
            backgroundImage: 'linear-gradient(180deg, rgba(10,5,2,0.45) 0%, rgba(10,5,2,0) 22%)',
          }),
        ]}
      >
        {libros.length === 0 ? (
          <View style={styles.vacio}>
            <Icono nombre="lomos" color={tinta} tamano={26} />
            <Text style={[styles.vacioTexto, { color: tinta }]}>
              {vacio ?? 'Este estante está esperando su primer libro.'}
            </Text>
            {accionVacio ? (
              <Button
                title={accionVacio.titulo}
                icono={accionVacio.icono}
                size="small"
                variant="secondary"
                onPress={accionVacio.onPress}
              />
            ) : null}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.fila,
              modo === 'portada' && styles.filaPortadas,
              conAdorno && styles.filaLlena,
            ]}
          >
            {tumbados.length ? (
              <View style={styles.pila}>
                {libros.map((l, i) => (posturasLibros?.[i] === 'tumbado' ? libro(l, i) : null))}
              </View>
            ) : null}
            {libros.map((l, i) => (posturasLibros?.[i] === 'tumbado' ? null : libro(l, i)))}
            {/* Sujetalibros de latón. */}
            <View
              accessible={false}
              style={[
                styles.sujetalibros,
                { backgroundColor: '#B8902C', height: Math.round(118 * escala) },
                web({ backgroundImage: laton, boxShadow: '3px 0 6px rgba(0,0,0,0.5)' }),
              ]}
            >
              <View style={[styles.pieSujeta, web({ backgroundImage: laton })]} />
            </View>
            {conAdorno ? (
              <>
                <View style={styles.flex} />
                <View style={styles.adorno}>
                  <Adorno
                    tipo={indiceBalda != null ? TIPOS_ADORNO[indiceBalda % TIPOS_ADORNO.length] : adornoDeBalda(id)}
                    alto={Math.round(96 * escala)}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        )}
      </View>
      <View
        accessible={false}
        style={[
          styles.tabla,
          { backgroundColor: isDark ? '#5A3820' : '#A87440' },
          web({
            backgroundImage: tablaEstante(isDark),
            boxShadow:
              '0 14px 16px -6px rgba(10,5,2,0.75), inset 0 1px 0 rgba(255,225,170,0.5), inset 0 -2px 0 rgba(0,0,0,0.25)',
          }),
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  balda: { marginBottom: 18 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    marginBottom: 4,
    gap: 8,
  },
  /* Las acciones no se van a otra línea: la placa encoge su nombre (con «…») antes. */
  acciones: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  verTodos: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  verTodosTexto: { fontFamily: fuentes.uiSemi, fontSize: fontSize.sm },
  ayuda: { fontFamily: fuentes.ui, fontSize: fontSize.xs, paddingHorizontal: 14, marginBottom: 6 },
  hueco: { minHeight: 250, justifyContent: 'flex-end' },
  fila: { alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 16, minHeight: 250 },
  filaPortadas: { gap: 14, paddingTop: 16 },
  flex: { flex: 1 },
  filaLlena: { flexGrow: 1 },
  adorno: { marginLeft: 12, marginRight: 6 },
  pila: { justifyContent: 'flex-end', marginRight: 6 },
  tabla: { height: 20, marginHorizontal: -2, borderRadius: 2 },
  sujetalibros: {
    width: 9,
    marginLeft: 10,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 9,
    justifyContent: 'flex-end',
  },
  pieSujeta: { position: 'absolute', bottom: 0, left: -10, width: 26, height: 5, backgroundColor: '#B8902C' },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10, minHeight: 150 },
  vacioTexto: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md, textAlign: 'center' },
})

export default Estante
