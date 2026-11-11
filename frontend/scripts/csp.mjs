// Cabeceras de seguridad de la web (SE-05), ajustadas al gateway con el que se construyó.
//
// public/serve.json ya trae una CSP que funciona con cualquier gateway (https: y
// localhost); este script, que corre DESPUÉS de `expo export`, la estrecha al
// origen exacto de EXPO_PUBLIC_API_URL: así un script inyectado no podría mandar
// el token a ningún otro sitio.
//
//   node scripts/csp.mjs dist/serve.json            (lee EXPO_PUBLIC_API_URL)
//   node scripts/csp.mjs dist/serve.json https://casa.ejemplo:7051
//
// Por qué cada fuente:
//   script-src 'unsafe-eval'  el lector carga foliate con `new Function('u','return import(u)')`
//                              (LectorFoliate.web.tsx); sin él no abre ningún libro. No hay
//                              'unsafe-inline' en scripts: un <script> o un onerror inyectado no corre.
//   style-src 'unsafe-inline' react-native-web pinta con estilos en línea y <style>; el EPUB trae los suyos.
//   media-src data:            el silencio que desbloquea el <audio> de iOS dentro del toque
//                              (utils/motorAudio.ts, SILENCIO) es un data:audio/wav (QA RW-03).
//   blob:                      foliate sirve cada capítulo, sus imágenes, hojas y fuentes como blob:.
//   frame-ancestors 'none'     nadie puede enmarcar la biblioteca (clickjacking).
import fs from 'node:fs'

export function politica(api) {
  const origen = api ? new URL(api).origin : "https: http://localhost:* http://127.0.0.1:*"
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' blob:",
    `img-src 'self' data: blob: ${origen}`,
    "font-src 'self' data: blob:",
    `media-src 'self' data: blob: ${origen}`,
    `connect-src 'self' blob: data: ${origen}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function conPolitica(config, api) {
  const general = config.headers.find((h) => h.source === '**')
  if (!general) throw new Error('serve.json sin la regla "**"')
  general.headers = general.headers.filter((h) => h.key !== 'Content-Security-Policy')
  general.headers.push({ key: 'Content-Security-Policy', value: politica(api) })
  return config
}

if (process.argv[1] && process.argv[1].endsWith('csp.mjs')) {
  const [archivo = 'dist/serve.json', api = process.env.EXPO_PUBLIC_API_URL] = process.argv.slice(2)
  const config = conPolitica(JSON.parse(fs.readFileSync(archivo, 'utf8')), api)
  fs.writeFileSync(archivo, JSON.stringify(config, null, 2) + '\n')
  console.log(`CSP para ${api ?? '(cualquier gateway)'} escrita en ${archivo}`)
}
