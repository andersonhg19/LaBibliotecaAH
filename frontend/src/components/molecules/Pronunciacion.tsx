import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Pressable, StyleSheet, Text, View } from 'react-native'

import Button from '@componentes/atoms/Button'
import Input from '@componentes/atoms/Input'
import { BotonIcono } from '@componentes/molecules/Encabezado'
import { useTheme } from '@contextos/ThemeContext'
import { useToast } from '@contextos/ToastContext'
import { pronunciacionService } from '@servicios/bibliotecaService'
import { fontSize, fuentes } from '@tema'
import { web } from '@tema/web'
import type { EntradaPronunciacion } from '@tipos'
import { mensajeDelServidor } from '@utils/mensajes'

/*
 * «CÓMO SE PRONUNCIA» (B17): si la voz dice mal un nombre («Hermione»), se
 * escribe cómo debe sonar («Jermáyoni»). Vale para TODO el libro y para todas
 * las voces (el audio es del libro, no de la persona): la casa rehace solo los
 * capítulos ya listos donde sale esa palabra; mientras, se sigue oyendo el audio
 * de antes. El texto que se lee y se resalta no cambia.
 *
 * Si el servidor aún no tiene la ruta (0.4.0 sin B17), no se enseña.
 */

export const MAX_PALABRAS = 200
export const MAX_DE = 80
export const MAX_A = 120
/** Mientras la casa rehace capítulos, cada cuánto se vuelve a preguntar. */
export const CADA_MS = 10_000

const clave = (s: string) => s.trim().toLocaleLowerCase('es')

/** Error de una entrada nueva (o editada: `antes` es la palabra que se cambia), o null si vale. Puro. */
export function errorDeEntrada(
  lista: EntradaPronunciacion[],
  de: string,
  a: string,
  antes: string | null = null,
): string | null {
  const p = de.trim()
  const d = a.trim()
  if (!p) return 'Escribe la palabra tal como está en el libro.'
  if (!d) return 'Escribe cómo debe decirla la voz.'
  if (p.length > MAX_DE) return `La palabra puede tener hasta ${MAX_DE} caracteres.`
  if (d.length > MAX_A) return `La pronunciación puede tener hasta ${MAX_A} caracteres.`
  if (!/[\p{L}\p{N}]/u.test(p) || !/[\p{L}\p{N}]/u.test(d)) return 'Escribe letras, no solo signos.'
  const otra = lista.find((e) => clave(e.de) === clave(p) && (antes === null || clave(e.de) !== clave(antes)))
  if (otra) return `«${otra.de}» ya está en la lista: tócala para cambiarla.`
  if (antes === null && lista.length >= MAX_PALABRAS) return `Caben ${MAX_PALABRAS} palabras por libro.`
  return null
}

/** La lista con la entrada nueva (o la de `antes` sustituida), ordenada como la devuelve el servidor. Puro. */
export function conEntrada(
  lista: EntradaPronunciacion[],
  nueva: EntradaPronunciacion,
  antes: string | null = null,
): EntradaPronunciacion[] {
  const fuera = antes === null ? clave(nueva.de) : clave(antes)
  return [...lista.filter((e) => clave(e.de) !== fuera), { de: nueva.de.trim(), a: nueva.a.trim() }].sort((x, y) =>
    clave(x.de).localeCompare(clave(y.de), 'es'),
  )
}

/** «La casa está rehaciendo 3 capítulos…» o null. Puro. */
export function textoRegenerando(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? 'La casa está rehaciendo 1 capítulo con la pronunciación nueva; mientras, suena el audio de antes.'
    : `La casa está rehaciendo ${n} capítulos con la pronunciación nueva; mientras, suena el audio de antes.`
}

const Pronunciacion: React.FC<{ ejemplarId: string }> = ({ ejemplarId }) => {
  const { colors } = useTheme()
  const { showToast } = useToast()
  const [lista, setLista] = useState<EntradaPronunciacion[] | null>(null)
  const [regenerando, setRegenerando] = useState(0)
  const [de, setDe] = useState('')
  const [a, setA] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [guardando, setGuardando] = useState(false)
  const vivo = useRef(true)

  const consultar = useCallback(async () => {
    try {
      const r = await pronunciacionService.obtener(ejemplarId)
      if (!vivo.current) return
      if (r?.correct && r.object) {
        setLista(r.object.entradas)
        setRegenerando(r.object.regenerando)
      } else setLista(null)
    } catch {
      if (vivo.current) setLista(null)
    }
  }, [ejemplarId])

  useEffect(() => {
    vivo.current = true
    consultar()
    return () => {
      vivo.current = false
    }
  }, [consultar])

  // Mientras se rehacen capítulos, se vuelve a preguntar (para quitar el aviso al acabar).
  useEffect(() => {
    if (regenerando <= 0) return
    const t = setTimeout(consultar, CADA_MS)
    return () => clearTimeout(t)
  }, [regenerando, consultar])

  if (lista === null) return null

  const guardar = async (nueva: EntradaPronunciacion[], aviso: string) => {
    setGuardando(true)
    try {
      const r = await pronunciacionService.guardar(ejemplarId, nueva)
      if (!r.correct) throw new Error(r.message)
      setLista(r.object.entradas)
      setRegenerando(r.object.regenerando)
      setDe('')
      setA('')
      setEditando(null)
      setError(undefined)
      showToast('success', aviso)
    } catch (e) {
      showToast('error', 'No se pudo guardar', mensajeDelServidor(e, 'Inténtalo en un rato.'))
    } finally {
      setGuardando(false)
    }
  }

  const anadir = () => {
    const err = errorDeEntrada(lista, de, a, editando)
    setError(err ?? undefined)
    if (err) return
    guardar(conEntrada(lista, { de, a }, editando), editando ? 'Pronunciación cambiada.' : 'Palabra añadida.')
  }

  const quitar = (e: EntradaPronunciacion) =>
    guardar(
      lista.filter((x) => x.de !== e.de),
      `«${e.de}» vuelve a leerse como está escrita.`,
    )

  const avisoRegenera = textoRegenerando(regenerando)

  return (
    <View
      style={[styles.caja, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="pronunciacion"
      accessibilityLabel="Cómo se pronuncia"
    >
      <Text style={[styles.titulo, { color: colors.text }]} accessibilityRole="header">
        Cómo se pronuncia
      </Text>
      <Text style={[styles.ayuda, { color: colors.textSecondary }]}>
        Si la voz dice mal un nombre, escribe cómo debe sonar. Vale para todo el libro y todas las voces; el texto no
        cambia.
      </Text>
      {lista.length ? (
        <View style={styles.lista} accessibilityRole="list">
          {lista.map((e) => (
            <View key={e.de} style={[styles.fila, { borderBottomColor: colors.border }]}>
              <Pressable
                onPress={() => {
                  setDe(e.de)
                  setA(e.a)
                  setEditando(e.de)
                  setError(undefined)
                }}
                accessibilityRole="button"
                accessibilityLabel={`${e.de} se dice ${e.a}. Cambiar`}
                style={[styles.par, web({ cursor: 'pointer' })]}
                testID={`pronunciacion-${e.de}`}
              >
                <Text style={[styles.palabra, { color: colors.text }]} numberOfLines={2}>
                  {e.de}
                </Text>
                <Text style={[styles.flecha, { color: colors.textMuted }]} aria-hidden>
                  →
                </Text>
                <Text style={[styles.dicha, { color: colors.primary }]} numberOfLines={2}>
                  {e.a}
                </Text>
              </Pressable>
              <BotonIcono
                icono="trash"
                etiqueta={`Quitar ${e.de} del diccionario`}
                onPress={() => quitar(e)}
                disabled={guardando}
                testID={`quitar-pronunciacion-${e.de}`}
              />
            </View>
          ))}
        </View>
      ) : null}
      {avisoRegenera ? (
        <Text style={[styles.ayuda, { color: colors.warning }]} accessibilityLiveRegion="polite" testID="regenerando">
          ⏳ {avisoRegenera}
        </Text>
      ) : null}
      <View style={styles.formulario}>
        <View style={styles.campo}>
          <Input
            label="Palabra del libro"
            value={de}
            onChangeText={setDe}
            placeholder="p. ej., Hermione"
            autoCapitalize="none"
            compacto
            testID="pronunciacion-de"
          />
        </View>
        <View style={styles.campo}>
          <Input
            label="Cómo decirla"
            value={a}
            onChangeText={setA}
            placeholder="p. ej., Jermáyoni"
            autoCapitalize="none"
            compacto
            error={error}
            onSubmitEditing={anadir}
            testID="pronunciacion-a"
          />
        </View>
      </View>
      <View style={styles.botones}>
        <Button
          title={editando ? 'Guardar el cambio' : 'Añadir'}
          icono={editando ? 'lapiz' : 'plus'}
          variant="secondary"
          size="small"
          onPress={anadir}
          loading={guardando}
          testID="pronunciacion-anadir"
        />
        {editando ? (
          <Button
            title="Cancelar"
            variant="outline"
            size="small"
            onPress={() => {
              setDe('')
              setA('')
              setEditando(null)
              setError(undefined)
            }}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  caja: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  titulo: { fontFamily: fuentes.titulo, fontSize: fontSize.lg },
  ayuda: { fontFamily: fuentes.ui, fontSize: fontSize.xs, lineHeight: 18 },
  lista: { gap: 0 },
  fila: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  par: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 44 },
  palabra: { fontFamily: fuentes.lectura, fontSize: fontSize.md },
  flecha: { fontFamily: fuentes.ui, fontSize: fontSize.sm },
  dicha: { fontFamily: fuentes.tituloCursiva, fontSize: fontSize.md },
  /* Dos campos lado a lado si caben (≥ 2 × 160 px); si no, uno debajo del otro. */
  formulario: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  campo: { flexGrow: 1, flexBasis: 160, minWidth: 160 },
  botones: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
})

export default Pronunciacion
