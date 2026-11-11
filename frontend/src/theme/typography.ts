/*
 * LA ESCALA TIENE QUE SER MONOTONA, y durante meses no lo fue: xs y sm valian
 * los DOS 15. La consecuencia se veia sin saber por que: un <Badge size="large">
 * salia identico a uno "medium", y el texto de `caption` identico al de `label`.
 * La prop existia y no hacia nada.
 *
 * Se arregla SUBIENDO sm y no bajando xs. La auditoria pedia justo lo contrario
 * de encoger —habia textos de 10 y 11 px— y bajar xs desharia esa mejora. Todo
 * se queda en 14 o mas.
 */
export const fontSize = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
  xl: 26,
  xxl: 35,
  title: 44,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
}

export type FontSize = typeof fontSize
export type FontWeight = typeof fontWeight
