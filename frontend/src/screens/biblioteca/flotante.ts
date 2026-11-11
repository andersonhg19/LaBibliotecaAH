/*
 * EL BOTÓN FLOTANTE «+» (Traer libros) del teléfono: dónde va y cuánto hueco
 * deja la lista debajo para que nunca tape el último lomo ni la última portada
 * (QA diseño 6). El hueco = su distancia al borde + su alto + un respiro.
 */
export const FLOTANTE = { abajo: 96, derecha: 18, tamano: 60 } as const
export const HUECO_FLOTANTE = FLOTANTE.abajo + FLOTANTE.tamano + 28

/** Pantalla baja (teléfono en horizontal): sin lámpara, búsqueda plegada y una sola fila de herramientas (UX-12). */
export const esApaisado = (alto: number) => alto < 500
