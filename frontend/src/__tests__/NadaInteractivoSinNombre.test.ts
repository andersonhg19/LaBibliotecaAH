import fs from 'fs'
import path from 'path'

/**
 * ============================================================================
 * NADA INTERACTIVO SIN NOMBRE
 * ============================================================================
 *
 * La accesibilidad no se pierde de golpe: se pierde un botón cada vez. Alguien
 * añade una pantalla con prisa, nadie lo nota porque la app se ve igual, y seis
 * meses después hay veinte elementos mudos otra vez.
 *
 * Esta prueba recorre TODOS los `TouchableOpacity` y `Pressable` de las
 * pantallas y exige que cada uno diga qué hace. No comprueba que la etiqueta
 * sea buena —eso no lo puede juzgar una máquina— sino que se haya DECIDIDO
 * una, que es justo lo que se olvida.
 *
 * POR QUÉ AQUÍ Y NO EN UN LINTER
 * ------------------------------
 * `eslint-plugin-react-native-a11y` existe y habría que añadir una dependencia
 * y una configuración para que avise en un sitio que casi nadie mira. Esto son
 * treinta líneas, rompe la misma puerta que el resto de las pruebas, y falla
 * diciendo el fichero y la línea.
 *
 * SE EXIME EL QUE HEREDA EL NOMBRE. Un `TouchableOpacity` puede envolver a un
 * componente que ya se anuncia solo; en ese caso se pone `accessible={false}`
 * a propósito y esto lo respeta. Que sea explícito es el punto: obliga a
 * decidir en vez de a olvidar.
 */

/*
 * Se miran las tres carpetas donde hay interaccion, y no solo las pantallas.
 * Los componentes son PEOR que las pantallas si se quedan mudos: un selector de
 * color sin nombre se repite en cada formulario que lo use, asi que un solo
 * descuido se multiplica por seis.
 */
const CARPETAS = ['screens', 'components', 'navigation'].map((c) => path.join(__dirname, '..', c))

/** Todos los .tsx de pantallas, menos las pruebas. */
function pantallas(dir: string): string[] {
  const encontrados: string[] = []
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__') continue
      encontrados.push(...pantallas(completo))
    } else if (entrada.name.endsWith('.tsx')) {
      encontrados.push(completo)
    }
  }
  return encontrados
}

/**
 * Devuelve la etiqueta de apertura completa de cada elemento interactivo.
 *
 * Se recorre carácter a carácter contando `<` y `>` porque una etiqueta de
 * apertura lleva llaves con JSX dentro (`style={[a, b]}`), y una expresión
 * regular se corta en el primer `>` que encuentre dentro de una de ellas.
 */
function aperturasInteractivas(fuente: string): { texto: string; linea: number }[] {
  const encontradas: { texto: string; linea: number }[] = []
  const patron = /<(TouchableOpacity|TouchableHighlight|Pressable)[\s>]/g

  let coincidencia: RegExpExecArray | null
  while ((coincidencia = patron.exec(fuente)) !== null) {
    const i = coincidencia.index
    let profundidad = 0
    let fin = i
    for (let j = i; j < fuente.length; j++) {
      const c = fuente[j]
      if (c === '{') profundidad++
      else if (c === '}') profundidad--
      else if (c === '>' && profundidad === 0) {
        fin = j
        break
      }
    }
    encontradas.push({
      texto: fuente.slice(i, fin + 1),
      linea: fuente.slice(0, i).split('\n').length,
    })
  }
  return encontradas
}

describe('Nada interactivo sin nombre', () => {
  it('todo elemento pulsable dice qué hace', () => {
    const mudos: string[] = []

    for (const fichero of CARPETAS.flatMap(pantallas)) {
      const fuente = fs.readFileSync(fichero, 'utf8')
      const relativo = path.relative(path.join(__dirname, '..'), fichero).replace(/\\/g, '/')

      for (const { texto, linea } of aperturasInteractivas(fuente)) {
        const tieneNombre = texto.includes('accessibilityLabel') || /accessible=\{false\}/.test(texto)
        if (!tieneNombre) {
          mudos.push(`${relativo}:${linea}`)
        }
      }
    }

    expect(mudos).toEqual([])
  })

  it('la prueba mira de verdad: encuentra elementos interactivos', () => {
    /* Si alguien mueve las pantallas de sitio, la comprobación de arriba se
       quedaría sin nada que recorrer y pasaría en verde diciendo que todo
       está etiquetado. Es el mismo fallo que tiene cualquier prueba que
       recorre ficheros. */
    const total = CARPETAS.flatMap(pantallas)
      .map((f) => aperturasInteractivas(fs.readFileSync(f, 'utf8')).length)
      .reduce((a, b) => a + b, 0)

    expect(total).toBeGreaterThan(20)
  })
})
