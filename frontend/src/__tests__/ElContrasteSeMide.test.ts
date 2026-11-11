import { darkColors, lightColors } from '@tema/colors'
import { contraste, textoLegibleSobre } from '@tema/contraste'
import { PAPELES } from '@tema/papel'

/**
 * ============================================================================
 * EL CONTRASTE SE MIDE, NO SE ESTIMA (heredada de Oh Churus, estándar 30)
 * ============================================================================
 *
 * Madera oscura, latón y miel son preciosos y muy fáciles de equivocar: el
 * cedro de la paleta (#B5653A) sobre nogal se queda en 2.3:1. Esta prueba
 * recorre cada color de contenido contra cada fondo de los dos ambientes y lo
 * mide con la fórmula de la WCAG:
 *   · 4.5:1 (AA) para todo lo que es texto de la interfaz;
 *   · 3:1 para superficies y elementos grandes (botones, bordes de foco);
 *   · 7:1 (AAA) para el TEXTO DE LECTURA en los tres papeles del lector:
 *     se lee durante horas, no es un rótulo.
 */

const FONDOS = ['background', 'surface', 'card', 'surfaceLight'] as const
const LLEVAN_TEXTO = [
  'text',
  'textSecondary',
  'textMuted',
  'danger',
  'warning',
  'success',
  'accent',
  'secondary',
  'primary',
] as const
const SOLO_SUPERFICIE = ['primary', 'primaryLight'] as const

const TEMAS = [
  { nombre: 'biblioteca de noche', colores: darkColors },
  { nombre: 'sala de día', colores: lightColors },
] as const

const informe = (que: string, medido: number, minimo: number) =>
  medido >= minimo ? `${que}: OK` : `${que}: ${medido.toFixed(2)}:1, NECESITA ${minimo}:1`

describe('El contraste se mide', () => {
  TEMAS.forEach(({ nombre, colores }) => {
    describe(`tema ${nombre}`, () => {
      LLEVAN_TEXTO.forEach((clave) => {
        it(`${clave} se lee sobre cualquier fondo (AA 4.5:1)`, () => {
          FONDOS.forEach((fondo) => {
            const que = `${clave} sobre ${fondo}`
            expect(informe(que, contraste(colores[clave], colores[fondo]), 4.5)).toBe(`${que}: OK`)
          })
        })
      })

      SOLO_SUPERFICIE.forEach((clave) => {
        it(`${clave} se distingue del fondo (3:1)`, () => {
          ;(['background', 'surface', 'card'] as const).forEach((fondo) => {
            const que = `${clave} sobre ${fondo}`
            expect(informe(que, contraste(colores[clave], colores[fondo]), 3)).toBe(`${que}: OK`)
          })
        })
      })

      it('el texto de los botones principales se lee (se calcula, no se fija)', () => {
        const medido = contraste(textoLegibleSobre(colores.primary), colores.primary)
        expect(informe('texto sobre primary', medido, 4.5)).toBe('texto sobre primary: OK')
      })

      it('el borde se distingue de la superficie que separa', () => {
        expect(contraste(colores.border, colores.surface)).toBeGreaterThan(1.3)
      })
    })
  })

  describe('papeles del lector (AAA 7:1)', () => {
    Object.entries(PAPELES).forEach(([clave, p]) => {
      it(`${p.nombre}: la tinta se lee sobre el papel`, () => {
        expect(informe(`tinta ${clave}`, contraste(p.tinta, p.fondo), 7)).toBe(`tinta ${clave}: OK`)
      })
      it(`${p.nombre}: los enlaces se leen (AA)`, () => {
        expect(informe(`enlace ${clave}`, contraste(p.enlace, p.fondo), 4.5)).toBe(`enlace ${clave}: OK`)
      })
    })
  })

  it('los dos temas definen exactamente las mismas claves', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort())
  })
})
