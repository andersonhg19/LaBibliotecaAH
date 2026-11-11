#!/usr/bin/env node
/*
 * Genera los archivos del MODO DEMOSTRACIÓN (EXPO_PUBLIC_MOCK=1) en public/demo:
 *
 *   public/demo/libros/demo-faro/libro.epub         EPUB3 con <span class="bah-f" id="cNNN-sNNNNN">
 *   public/demo/libros/demo-faro/estructura.json    contratos §4
 *   public/demo/libros/demo-faro/portada.svg        portada (en producción es portada.jpg)
 *   public/demo/libros/demo-faro/audio/cap-NNN.wav, cap-NNN-2x.wav, cap-NNN.tiempos.json
 *   public/demo/libros/demo-notas/libro.epub        un "documento personal" sin audio
 *   public/demo/voces/muestra.wav
 *   src/services/mock/demoGenerado.json             lo que la API simulada necesita saber
 *
 * La voz sale de la síntesis de Windows (Microsoft Helena, es-ES) vía scripts/demo/voz.ps1;
 * en producción el audio lo genera el taller con edge-tts (Álvaro) en .m4a.
 * El texto es original (scripts/demo/texto.mjs). Uso: node scripts/generar-demo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LIBRO, MUESTRA } from './demo/texto.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = path.join(RAIZ, 'public', 'demo');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bah-demo-'));
const HZ = 11025;
const PAUSA_FRASE = 0.32;
const INICIO = 0.25;

const nnn = (n) => String(n).padStart(3, '0');
const idFrase = (c, s) => `c${nnn(c)}-s${String(s).padStart(5, '0')}`;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- ZIP (store)
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(entradas) {
  const partes = [];
  const central = [];
  let off = 0;
  for (const [nombre, contenido] of entradas) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, 'utf8');
    const n = Buffer.from(nombre, 'utf8');
    const crc = crc32(datos);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x5a21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(n.length, 26); lh.writeUInt16LE(0, 28);
    partes.push(lh, n, datos);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x5a21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(datos.length, 20);
    ch.writeUInt32LE(datos.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, n);
    off += 30 + n.length + datos.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fin]);
}

// ---------------------------------------------------------------- EPUB
function epub({ id, titulo, autores, capitulos, idioma = 'es' }) {
  const css = `body{font-family:serif;line-height:1.55;margin:0 4%;}h1{font-size:1.5em;text-align:center;margin:1.2em 0 1em;font-weight:600;}p{text-indent:1.4em;margin:0 0 .35em;text-align:justify;}p.primero{text-indent:0;}`;
  const xhtml = capitulos.map((c, i) => [
    `OEBPS/cap-${nnn(i)}.xhtml`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${idioma}" xml:lang="${idioma}">\n<head><meta charset="UTF-8"/><title>${esc(c.titulo)}</title><link rel="stylesheet" href="estilo.css"/></head>\n<body>\n<section epub:type="chapter">\n` +
      `<h1><span class="bah-f" id="${c.frases[0].id}">${esc(c.frases[0].texto)}</span></h1>\n` +
      c.parrafos.map((p, j) => `<p${j === 0 ? ' class="primero"' : ''}>${p.map((f) => `<span class="bah-f" id="${f.id}">${esc(f.texto)}</span>`).join(' ')}</p>`).join('\n') +
      `\n</section>\n</body>\n</html>\n`,
  ]);
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${idioma}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:bah:${id}</dc:identifier>
<dc:title>${esc(titulo)}</dc:title>
${autores.map((a) => `<dc:creator>${esc(a)}</dc:creator>`).join('\n')}
<dc:language>${idioma}</dc:language>
<meta property="dcterms:modified">2026-11-10T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="estilo.css" media-type="text/css"/>
${capitulos.map((_, i) => `<item id="cap${nnn(i)}" href="cap-${nnn(i)}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${capitulos.map((_, i) => `<itemref idref="cap${nnn(i)}"/>`).join('\n')}
</spine>
</package>
`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${idioma}"><head><meta charset="UTF-8"/><title>Índice</title></head><body><nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${capitulos.map((c, i) => `<li><a href="cap-${nnn(i)}.xhtml">${esc(c.titulo)}</a></li>`).join('')}</ol></nav></body></html>\n`;
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`],
    ['OEBPS/content.opf', opf],
    ['OEBPS/nav.xhtml', nav],
    ['OEBPS/estilo.css', css],
    ...xhtml,
  ]);
}

// ---------------------------------------------------------------- WAV
function leerWav(ruta) {
  const b = fs.readFileSync(ruta);
  let p = 12;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4);
    const tam = b.readUInt32LE(p + 4);
    if (id === 'data') {
      const n = Math.floor(tam / 2);
      const s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return s;
    }
    p += 8 + tam + (tam % 2);
  }
  throw new Error(`WAV sin datos: ${ruta}`);
}
function escribirWav(ruta, muestras) {
  const n = muestras.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(HZ, 24);
  b.writeUInt32LE(HZ * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(muestras[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(ruta, b);
}
/** WSOLA sencillo: el doble de rápido sin cambiar el tono (en producción lo hace ffmpeg atempo=2.0). */
function aDobleVelocidad(x) {
  const N = 330, Hs = 165, Ha = 330, D = 60;
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const y = new Float32Array(Math.ceil(x.length / 2) + N);
  let prev = 0;
  for (let k = 0; ; k++) {
    const ana = k * Ha;
    if (ana + N + D >= x.length) break;
    let mejor = 0;
    if (k > 0) {
      const objetivo = prev + Hs;
      let mc = -Infinity;
      for (let d = -D; d <= D; d += 2) {
        const s = ana + d;
        if (s < 0) continue;
        let c = 0;
        for (let i = 0; i < N; i += 3) c += x[s + i] * x[objetivo + i];
        if (c > mc) { mc = c; mejor = d; }
      }
    }
    const ini = ana + mejor;
    const sal = k * Hs;
    for (let i = 0; i < N; i++) y[sal + i] += x[ini + i] * win[i];
    prev = ini;
  }
  return y;
}

// ---------------------------------------------------------------- Frases y voz
function prepararCapitulos(libro) {
  return libro.capitulos.map((c, ci) => {
    let s = 0;
    const frases = [{ id: idFrase(ci, s++), texto: c.titulo + '.' }];
    const parrafos = c.parrafos.map((p) => p.map((t) => {
      const f = { id: idFrase(ci, s++), texto: t };
      frases.push(f);
      return f;
    }));
    // El título va en el EPUB sin el punto final.
    frases[0].texto = c.titulo;
    return { titulo: c.titulo, frases, parrafos };
  });
}

function sintetizar(frases, carpeta) {
  const entrada = path.join(TMP, `frases-${path.basename(carpeta)}.json`);
  fs.writeFileSync(entrada, JSON.stringify(frases.map((f) => ({ id: f.id, texto: f.texto })), null, 1), 'utf8');
  const ps = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(RAIZ, 'scripts', 'demo', 'voz.ps1'), '-Entrada', entrada, '-Salida', carpeta], { encoding: 'utf8' });
  console.log(ps.trim());
  const progreso = JSON.parse(fs.readFileSync(path.join(carpeta, 'progreso.json'), 'utf8').replace(/^﻿/, ''));
  const lista = Array.isArray(progreso) ? progreso : [progreso];
  return new Map(lista.map((p) => [p.id, (p.palabras || []).map((w) => (Array.isArray(w) ? w : w.value || w))]));
}

function generarAudio(capitulos, carpetaAudio) {
  fs.mkdirSync(carpetaAudio, { recursive: true });
  const crudo = path.join(TMP, 'voz');
  const todas = capitulos.flatMap((c) => c.frases);
  const palabrasPorFrase = sintetizar(todas, crudo);
  const resumen = [];
  capitulos.forEach((c, ci) => {
    const trozos = [new Float32Array(Math.round(INICIO * HZ))];
    let t = INICIO;
    const frases = c.frases.map((f) => {
      const s = leerWav(path.join(crudo, `${f.id}.wav`));
      // Recorta el silencio del final que deja la síntesis.
      let fin = s.length;
      while (fin > 0 && Math.abs(s[fin - 1]) < 0.004) fin--;
      const voz = s.subarray(0, Math.min(s.length, fin + Math.round(0.05 * HZ)));
      const dur = voz.length / HZ;
      const t0 = t;
      const ps = (palabrasPorFrase.get(f.id) || []).map(([a, b, ts], i, arr) => {
        const sig = arr[i + 1];
        const w0 = t0 + Number(ts);
        const w1 = sig ? t0 + Number(sig[2]) : t0 + dur;
        return [Number(a), Math.min(Number(b), f.texto.length), +w0.toFixed(3), +Math.max(w0 + 0.05, w1 - 0.02).toFixed(3)];
      });
      trozos.push(voz, new Float32Array(Math.round(PAUSA_FRASE * HZ)));
      t += dur + PAUSA_FRASE;
      return { id: f.id, t0: +t0.toFixed(3), t1: +(t0 + dur).toFixed(3), palabras: ps };
    });
    const total = trozos.reduce((a, x) => a + x.length, 0);
    const todo = new Float32Array(total);
    let p = 0;
    for (const x of trozos) { todo.set(x, p); p += x.length; }
    escribirWav(path.join(carpetaAudio, `cap-${nnn(ci)}.wav`), todo);
    escribirWav(path.join(carpetaAudio, `cap-${nnn(ci)}-2x.wav`), aDobleVelocidad(todo));
    const duracion = +(total / HZ).toFixed(2);
    fs.writeFileSync(
      path.join(carpetaAudio, `cap-${nnn(ci)}.tiempos.json`),
      JSON.stringify({ capitulo: ci, vozId: 'edge.es-ES-AlvaroNeural', duracion, frases }),
    );
    resumen.push({ indice: ci, duracion });
  });
  return resumen;
}

// ---------------------------------------------------------------- Portada
function portadaSvg(titulo, autor) {
  const lineas = titulo.split(' ').reduce((acc, w) => {
    const u = acc[acc.length - 1];
    if (u && (u + ' ' + w).length <= 14) acc[acc.length - 1] = u + ' ' + w; else acc.push(w);
    return acc;
  }, []);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
<defs>
<radialGradient id="l" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#E7B56C"/><stop offset=".55" stop-color="#B5653A"/><stop offset="1" stop-color="#4A2E1C"/></radialGradient>
<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .25 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>
<rect width="600" height="900" fill="url(#l)"/><rect width="600" height="900" fill="#000" filter="url(#g)"/>
<rect x="38" y="38" width="524" height="824" fill="none" stroke="#F3D58A" stroke-width="3"/>
<rect x="52" y="52" width="496" height="796" fill="none" stroke="#F3D58A" stroke-width="1"/>
<circle cx="300" cy="250" r="70" fill="none" stroke="#F3D58A" stroke-width="2"/>
<path d="M300 195 L300 305 M245 250 L355 250" stroke="#F3D58A" stroke-width="2"/>
<path d="M262 240 q38 -40 76 0 q-38 40 -76 0z" fill="#F3D58A" opacity=".85"/>
${lineas.map((l, i) => `<text x="300" y="${470 + i * 70}" text-anchor="middle" font-family="Georgia, serif" font-size="58" fill="#FBEFD0">${esc(l)}</text>`).join('\n')}
<text x="300" y="790" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="30" fill="#F3D58A">${esc(autor)}</text>
</svg>`;
}

// ---------------------------------------------------------------- Principal
const capitulos = prepararCapitulos(LIBRO);
const dirFaro = path.join(DEMO, 'libros', 'demo-faro');
fs.mkdirSync(dirFaro, { recursive: true });
fs.writeFileSync(path.join(dirFaro, 'libro.epub'), epub({ id: 'demo-faro', titulo: LIBRO.titulo, autores: LIBRO.autores, capitulos }));
fs.writeFileSync(path.join(dirFaro, 'portada.svg'), portadaSvg(LIBRO.titulo, LIBRO.autores[0]));

const sinVoz = process.argv.includes('--sin-voz') || process.platform !== 'win32';
let audio = [];
if (!sinVoz) {
  audio = generarAudio(capitulos, path.join(dirFaro, 'audio'));
  // Muestra de voz.
  const dirVoces = path.join(DEMO, 'voces');
  fs.mkdirSync(dirVoces, { recursive: true });
  const m = sintetizar([{ id: 'muestra', texto: MUESTRA }], path.join(TMP, 'muestra'));
  void m;
  escribirWav(path.join(dirVoces, 'muestra.wav'), leerWav(path.join(TMP, 'muestra', 'muestra.wav')));
} else {
  console.log('Sin voz: se conserva el audio que ya hubiera en public/demo.');
}

const palabras = (t) => t.split(/\s+/).filter(Boolean).length;
const estructura = {
  versionFormato: 1, versionTexto: 1, titulo: LIBRO.titulo, autores: LIBRO.autores, idioma: 'es', isbn: null,
  editorial: LIBRO.editorial, anio: LIBRO.anio, sinopsis: LIBRO.sinopsis, tienePortada: true,
  capitulos: capitulos.map((c, i) => ({
    indice: i, titulo: c.titulo, href: `cap-${nnn(i)}.xhtml`, nivel: 1, frases: c.frases.length,
    palabras: c.frases.reduce((a, f) => a + palabras(f.texto), 0), primeraFrase: c.frases[0].id, ultimaFrase: c.frases[c.frases.length - 1].id,
  })),
  toc: capitulos.map((c, i) => ({ titulo: c.titulo, href: `cap-${nnn(i)}.xhtml`, hijos: [] })),
  totalFrases: capitulos.reduce((a, c) => a + c.frases.length, 0),
  totalPalabras: capitulos.reduce((a, c) => a + c.frases.reduce((b, f) => b + palabras(f.texto), 0), 0),
};
estructura.minutosEstimados = Math.max(1, Math.round(estructura.totalPalabras / 150));
fs.writeFileSync(path.join(dirFaro, 'estructura.json'), JSON.stringify(estructura, null, 2));

// Documento personal de ejemplo (sin audio).
const notas = prepararCapitulos({
  capitulos: [{
    titulo: 'Lista de la biblioteca',
    parrafos: [
      ['Comprar dos lámparas de latón para el estudio.', 'Llevar a encuadernar los cuadernos de la abuela.'],
      ['Preguntar en la librería del centro por la edición ilustrada.', 'Ordenar los favoritos antes de fin de mes.'],
    ],
  }],
});
const dirNotas = path.join(DEMO, 'libros', 'demo-notas');
fs.mkdirSync(dirNotas, { recursive: true });
fs.writeFileSync(path.join(dirNotas, 'libro.epub'), epub({ id: 'demo-notas', titulo: 'Pendientes de la casa', autores: ['Anderson'], capitulos: notas }));

const anterior = (() => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'services', 'mock', 'demoGenerado.json'), 'utf8')); } catch { return null; } })();
const generado = {
  faro: {
    titulo: LIBRO.titulo, autores: LIBRO.autores, anio: LIBRO.anio, editorial: LIBRO.editorial, sinopsis: LIBRO.sinopsis,
    minutosEstimados: estructura.minutosEstimados,
    capitulos: capitulos.map((c, i) => ({
      indice: i, titulo: c.titulo,
      minutos: Math.max(1, Math.round((audio[i]?.duracion ?? anterior?.faro?.capitulos?.[i]?.duracionSeg ?? 60) / 60)),
      duracionSeg: audio[i]?.duracion ?? anterior?.faro?.capitulos?.[i]?.duracionSeg ?? 60,
      primeraFrase: c.frases[0].id,
    })),
  },
  notas: { capitulos: [{ indice: 0, titulo: 'Lista de la biblioteca', minutos: 1, duracionSeg: 0, primeraFrase: 'c000-s00000' }] },
};
fs.writeFileSync(path.join(RAIZ, 'src', 'services', 'mock', 'demoGenerado.json'), JSON.stringify(generado, null, 2) + '\n');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('Demo generada en', DEMO);
