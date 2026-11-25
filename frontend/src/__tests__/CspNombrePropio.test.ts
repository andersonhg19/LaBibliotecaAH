/* (0.5.0) La CSP deja hablar con la API del nombre propio, además de la configurada.
   csp.mjs es un módulo ES que corre en el Dockerfile con node: aquí se ejecuta igual. */
import { execFileSync } from 'child_process'
import path from 'path'
import { pathToFileURL } from 'url'

const SCRIPT = pathToFileURL(path.join(__dirname, '../../scripts/csp.mjs')).href

function evaluar(expresion: string): unknown {
  const codigo = `import(${JSON.stringify(SCRIPT)}).then((m) => process.stdout.write(JSON.stringify(${expresion})))`
  return JSON.parse(execFileSync(process.execPath, ['-e', codigo], { encoding: 'utf8' }))
}

const politica = (api: string) => evaluar(`m.politica(${JSON.stringify(api)})`) as string
const propio = (api: string) => evaluar(`m.origenNombrePropio(${JSON.stringify(api)})`) as string | null
const conectar = (csp: string) => (csp.match(/connect-src ([^;]*)/) ?? [])[1] ?? ''

describe('CSP con el nombre propio de la Biblioteca', () => {
  it('con la API de casa, permite también la del nombre propio en el 8443', () => {
    const csp = politica('https://casa.ejemplo.ts.net:7051')
    expect(conectar(csp)).toContain('https://casa.ejemplo.ts.net:7051')
    expect(conectar(csp)).toContain('https://biblioteca.ejemplo.ts.net:8443')
    expect(csp).toMatch(/media-src [^;]*https:\/\/biblioteca\.ejemplo\.ts\.net:8443/)
    expect(csp).toMatch(/img-src [^;]*https:\/\/biblioteca\.ejemplo\.ts\.net:8443/)
  })

  it('sin nombre propio posible (localhost, IP o http) solo la configurada', () => {
    expect(propio('http://localhost:9920')).toBeNull()
    expect(propio('https://192.168.0.10:7051')).toBeNull()
    expect(propio('http://casa.ejemplo.ts.net:7051')).toBeNull()
    expect(conectar(politica('http://localhost:9920'))).not.toContain('biblioteca.')
  })

  it('ningún otro origen se cuela: solo esos dos', () => {
    const fuentes = conectar(politica('https://casa.ejemplo.ts.net:7051')).split(' ')
    expect(fuentes.filter((f) => f.startsWith('https://'))).toEqual([
      'https://casa.ejemplo.ts.net:7051',
      'https://biblioteca.ejemplo.ts.net:8443',
    ])
  })
})
