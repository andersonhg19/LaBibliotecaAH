import fs from 'fs'
import path from 'path'

import { fontSize } from '@tema'

/**
 * ============================================================================
 * NADA SE ESCRIBE MAS PEQUENO QUE LA ESCALA
 * ============================================================================
 *
 * La escala del proyecto empieza en 14 (`fontSize.xs`), y aun asi habia cinco
 * sitios con 10, 11 y 12 px escritos a mano. No es casualidad: cuando un texto
 * no cabe, encogerlo funciona a la primera y en la pantalla del que lo escribe
 * se sigue leyendo. En un movil, al sol, y a los cuarenta y tantos, no.
 *
 * Esta prueba es la hermana de NadaInteractivoSinNombre: aquella impide que un
 * pulsable se quede mudo, esta impide que un texto se quede ilegible. Las dos
 * vigilan lo mismo —que la app se pueda usar— y las dos fallan diciendo el
 * fichero y la linea.
 *
 * NO PROHIBE, OBLIGA A DECIDIR. Si de verdad hace falta algo mas pequeno, se
 * pone en EXCEPCIONES con el motivo al lado, como el punto de color de 8x8 que
 * se pinta con un componente de texto vacio y necesita `fontSize: 1` para que
 * la altura de linea no lo deforme.
 */

const MINIMO = fontSize.xs

const CARPETAS = ['screens', 'components', 'navigation'].map((c) => path.join(__dirname, '..', c))

/**
 * Lo que puede ser mas pequeno, y por que.
 * La clave es "<fichero>:<nombreDelEstilo>".
 */
const EXCEPCIONES: Record<string, string> = {}

function ficherosTsx(dir: string): string[] {
  const encontrados: string[] = []
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__') continue
      encontrados.push(...ficherosTsx(completo))
    } else if (entrada.name.endsWith('.tsx') || entrada.name.endsWith('.ts')) {
      encontrados.push(completo)
    }
  }
  return encontrados
}

/**
 * Busca `fontSize: <numero>` y se queda con los que bajan del minimo.
 *
 * Para saber a que estilo pertenece se mira hacia atras hasta la ultima clave
 * de objeto: es aproximado, pero solo se usa para nombrar la excepcion y para
 * que el mensaje de fallo diga algo util.
 */
/**
 * Deja el codigo sin comentarios, conservando los saltos de linea para que los
 * numeros que se reportan sigan siendo los del fichero.
 *
 * Hace falta porque el propio comentario que explica una excepcion menciona
 * "fontSize: 1", y sin esto la prueba se acusaba a si misma: encontraba su
 * propia explicacion y la contaba como un texto diminuto.
 */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (linea) => linea.replace(/[^\n]/g, ' '))
}

function textosDemasiadoPequenos(fichero: string) {
  const lineas = sinComentarios(fs.readFileSync(fichero, 'utf8')).split('\n')
  const nombre = path.basename(fichero)
  const hallazgos: string[] = []

  lineas.forEach((linea, i) => {
    const encontrado = /fontSize:\s*(\d+)\b/.exec(linea)
    if (!encontrado) return
    const tamano = Number(encontrado[1])
    if (tamano >= MINIMO) return

    /*
     * El nombre del estilo que CONTIENE esta linea, no el ultimo que aparece
     * antes: se sube contando llaves, porque el bloque anterior puede estar ya
     * cerrado y entonces su nombre no tiene nada que ver.
     */
    let estilo = '?'
    let profundidad = 0
    for (let j = i; j >= 0; j--) {
      const anterior = lineas[j]
      if (j < i) {
        profundidad += (anterior.match(/\}/g) || []).length
        profundidad -= (anterior.match(/\{/g) || []).length
      }
      if (profundidad < 0) {
        const clave = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/.exec(anterior)
        if (clave) {
          estilo = clave[1]
          break
        }
        profundidad = 0
      }
    }

    if (EXCEPCIONES[`${nombre}:${estilo}`]) return
    hallazgos.push(`${nombre}:${i + 1}  fontSize: ${tamano}  (estilo "${estilo}")`)
  })

  return hallazgos
}

describe('Nada se escribe mas pequeno que la escala', () => {
  it(`ningun texto baja de ${MINIMO} px`, () => {
    const hallazgos = CARPETAS.flatMap((carpeta) => ficherosTsx(carpeta).flatMap(textosDemasiadoPequenos))

    expect(
      hallazgos.length === 0
        ? 'todo el texto se lee'
        : `hay texto por debajo de ${MINIMO} px:\n  ${hallazgos.join('\n  ')}\n\n` +
            '  QUE HACER: subelo a fontSize.xs o mas. Si el problema es que no cabe,\n' +
            '  el hueco es lo que tiene que crecer — encoger la letra resuelve el\n' +
            '  problema equivocado. Y si de verdad no es texto (un punto de color\n' +
            '  pintado con un componente de texto, por ejemplo), anadelo a\n' +
            '  EXCEPCIONES en este fichero con el motivo escrito.',
    ).toBe('todo el texto se lee')
  })

  it('las excepciones apuntan a algo que existe', () => {
    /* Una excepcion sobre un estilo que ya no existe es una lista que se
       pudre: el dia que vuelva a haber un estilo con ese nombre, entraria
       exento sin que nadie lo decida. */
    const todos = CARPETAS.flatMap(ficherosTsx)
    const fantasmas = Object.keys(EXCEPCIONES).filter((clave) => {
      const [fichero, estilo] = clave.split(':')
      const ruta = todos.find((f) => path.basename(f) === fichero)
      if (!ruta) return true
      return !new RegExp(`\\b${estilo}\\s*:\\s*\\{`).test(fs.readFileSync(ruta, 'utf8'))
    })

    expect(fantasmas).toEqual([])
  })

  it('la escala sigue empezando en 14 y sigue siendo creciente', () => {
    /* Si alguien bajara fontSize.xs, esta prueba entera dejaria de proteger
       nada sin ponerse roja. Y la escala tiene que ser monotona: durante meses
       xs y sm valian los dos 15, y por eso un Badge "large" salia identico a
       uno "medium". */
    const valores = [fontSize.xs, fontSize.sm, fontSize.md, fontSize.lg, fontSize.xl, fontSize.xxl, fontSize.title]
    expect(fontSize.xs).toBeGreaterThanOrEqual(14)
    valores.forEach((valor, i) => {
      if (i > 0) expect(valor).toBeGreaterThan(valores[i - 1])
    })
  })
})
