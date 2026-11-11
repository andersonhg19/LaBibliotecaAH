# La Biblioteca AH — web (Expo, solo web)

Lector de libros y audiolibros con ambiente de biblioteca privada: estantería de roble con lomos que se sacan
y se abren, catálogo con filtros, ficha del libro, lector EPUB (foliate-js) y la voz (un solo `<audio>`, 0.5x–5x,
pantalla bloqueada con Media Session).

## Arrancar

```bash
npm install --no-audit --no-fund
npm run demo        # modo demostración: sin backend, con libros y voz de ejemplo (EXPO_PUBLIC_MOCK=1)
npm run web         # contra el gateway (EXPO_PUBLIC_API_URL, por defecto http://localhost:8920)
npm run export      # build estático en dist/ (incluye public/: foliate, fuentes, demo, serve.json)
npm run qa          # lint + formato + tipos + pruebas
```

En el modo demostración se entra con cualquier correo y una contraseña de 6+ caracteres. El libro
"El guardián de los lomos" trae EPUB con ids por frase, voz (síntesis de Windows) y `tiempos.json`
con tiempos por palabra; se regenera con `npm run generar-demo` (texto original, sin derechos de terceros).

## Docker

```bash
docker build -t bah/frontend --build-arg EXPO_PUBLIC_API_URL=https://casa.tail60fcb5.ts.net:7051 .
docker run -p 127.0.0.1:3100:3100 bah/frontend
```

## Piezas

| Carpeta | Qué |
|---|---|
| `src/config/entorno.ts` | Variables de entorno validadas con zod |
| `src/services/` | API por microservicio; `mock/` = API simulada (adaptador de axios) |
| `src/logica/` | Lógica pura y probada: filtros, velocidad→archivo, búsqueda de frase, reanudación, orden |
| `src/utils/motorAudio.ts` | El motor de la voz (un solo `<audio>`, Media Session, temporizador) |
| `src/components/estanteria/` | Lomos, portadas, estantes y el efecto de libro físico (`LibroEnEstante.web.tsx`) |
| `src/components/lector/` | `LectorFoliate.web.tsx` (foliate-js) y las anclas de las notas |
| `public/foliate/` | foliate-js vendorizado, commit fijado (ver `VERSION.txt`) |
| `public/fuentes/` | Literata, EB Garamond y Lora (OFL) para el interior del libro |
