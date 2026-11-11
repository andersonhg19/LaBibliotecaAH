// Texto original escrito para la demostración de La Biblioteca AH (sin derechos de terceros).
// Cada capítulo es una lista de párrafos; cada párrafo, una lista de frases.

export const LIBRO = {
  titulo: 'El guardián de los lomos',
  autores: ['Biblioteca AH'],
  idioma: 'es',
  anio: 2026,
  editorial: 'Taller de la casa',
  sinopsis:
    'Una noche, en una biblioteca de roble y cedro, un viejo guardián descubre que los libros no duermen: esperan. ' +
    'Un cuento breve escrito para probar el lector, la voz y el resaltado de La Biblioteca AH.',
  capitulos: [
    {
      titulo: 'La biblioteca de noche',
      parrafos: [
        [
          'Cuando la última lámpara se quedó encendida, la biblioteca empezó a respirar.',
          'Los estantes de roble crujieron como un barco que se acomoda en el puerto.',
          'Afuera llovía despacio, y el agua dibujaba ríos pequeños en los cristales.',
        ],
        [
          'Don Aurelio, el guardián, conocía cada lomo por su olor.',
          'Sabía que los libros de cuero huelen a silla de montar y que los de tela huelen a domingo.',
          'Aquella noche, sin embargo, un olor nuevo llegaba desde el tercer estante.',
        ],
        [
          'Se acercó con la lámpara en alto y vio un libro que no recordaba haber guardado.',
          'Tenía el lomo color miel y ninguna letra en la portada.',
        ],
      ],
    },
    {
      titulo: 'El libro sin título',
      parrafos: [
        [
          'Lo sacó del estante con cuidado, como quien despierta a un niño dormido.',
          'El libro pesaba menos de lo que parecía, y la tapa estaba tibia.',
          'Al abrirlo, las páginas estaban en blanco, salvo la primera.',
        ],
        [
          'En ella, con tinta de latón, se leía una sola frase.',
          'Quien me lea en voz alta me dará un nombre.',
          'Don Aurelio sonrió, porque llevaba cuarenta años leyendo en voz baja.',
        ],
        [
          'Se sentó en el sillón verde, junto a la chimenea apagada.',
          'Carraspeó, se acomodó las gafas y empezó a leer lo que no estaba escrito.',
        ],
      ],
    },
    {
      titulo: 'La voz del roble',
      parrafos: [
        [
          'Mientras hablaba, las palabras aparecían en la página una por una.',
          'Primero en color miel, luego en dorado, y al final en tinta firme y oscura.',
          'Era su propia historia, la de un hombre que cuidaba libros ajenos.',
        ],
        [
          'Al llegar a la última línea, el libro tenía por fin un título en el lomo.',
          'Decía, en letras pequeñas y brillantes: el guardián de los lomos.',
        ],
        [
          'Don Aurelio lo devolvió a su sitio, entre dos libros que le hicieron hueco.',
          'Apagó la lámpara, y la biblioteca siguió respirando hasta el amanecer.',
        ],
      ],
    },
  ],
};

/** Frases de las muestras de voz. */
export const MUESTRA = 'Hola. Soy la voz de tu biblioteca. Cuando quieras, te leo en voz alta.';
