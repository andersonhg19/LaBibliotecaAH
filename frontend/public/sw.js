/*
 * SERVICE WORKER DE LA BIBLIOTECA (0.5.0, contrato C12): la app abre y los libros guardados suenan sin red.
 *
 * Lo registra `registro-sw.js` solo en la web construida (producción / QA), con `?v=<huella del paquete>`: cada
 * versión nueva de la web estrena su caché de app y borra las de versiones viejas (nunca las de libros).
 *
 * Cachés:
 *   bah-app-<v>          index.html (red primero, copia si no hay red) y js/css/fuentes/iconos (caché primero);
 *   bah-api              lecturas de la API que el reproductor necesita (libro, capítulos, progreso, voces,
 *                        estado LISTO de cada capítulo): red primero, la copia si no hay red o tarda; por usuario;
 *   bah-libro-<ejemplar> audio 1x/2x, tiempos, frases, portada y EPUB del libro: la escribe la web
 *                        (utils/sinConexion.ts) y aquí solo se lee. Clave SIN el token `t`.
 *
 * El <audio> pide con `Range`: desde la copia se responde 206 con el trozo pedido. La API está en otro origen
 * (CORS): la web baja las copias con fetch en modo cors (respuestas legibles, no opacas) y aquí se sirven tal cual.
 * La lógica que decide vive en sw-logica.js (probada con jest).
 */
/* eslint-disable no-restricted-globals */
var VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
importScripts('/sw-logica.js?v=' + encodeURIComponent(VERSION))
var L = self.BahSW
var CACHE_APP = L.nombreCacheApp(VERSION)
/** Más que esto esperando a la red con copia en la mano, se sirve la copia (red lenta del túnel). */
var PLAZO_RED_MS = 6000
var PLAZO_NAVEGACION_MS = 4000
var MAX_ENTRADAS_API = 400

function recursosDe(html) {
  var urls = []
  var re = /(?:src|href)\s*=\s*"([^"]+)"/g
  var m
  while ((m = re.exec(html))) {
    try {
      var u = new URL(m[1], self.location.origin)
      if (u.origin === self.location.origin && L.estrategia({ url: u.href, metodo: 'GET', origen: self.location.origin }) === 'app')
        urls.push(u.href)
    } catch (e) {
      /* nada */
    }
  }
  return urls
}

function guardarEn(nombre, clave, respuesta) {
  return caches
    .open(nombre)
    .then(function (c) {
      return c.put(clave, respuesta)
    })
    .catch(function () {
      /* sin espacio: se sigue sin copia */
    })
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    (async function () {
      var c = await caches.open(CACHE_APP)
      try {
        var r = await fetch('/', { cache: 'no-store' })
        if (r.ok) {
          var html = await r.clone().text()
          await c.put('/index.html', r)
          var urls = recursosDe(html).concat(['/manifest.webmanifest', '/iconos/icono-192.png', '/iconos/icono-512.png'])
          await Promise.all(
            urls.map(function (u) {
              return c.add(u).catch(function () {})
            }),
          )
        }
      } catch (err) {
        /* sin red al instalar: se llenará al usar */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', function (e) {
  e.waitUntil(
    (async function () {
      var nombres = await caches.keys()
      await Promise.all(
        L.cachesSobrantes(nombres, VERSION).map(function (n) {
          return caches.delete(n)
        }),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', function (e) {
  var d = e.data || {}
  if (d.tipo === 'precache' && Array.isArray(d.urls)) {
    e.waitUntil(
      caches.open(CACHE_APP).then(function (c) {
        return Promise.all(
          d.urls
            .filter(function (u) {
              return L.estrategia({ url: u, metodo: 'GET', origen: self.location.origin }) === 'app'
            })
            .map(function (u) {
              return c.match(u).then(function (ya) {
                return ya || c.add(u).catch(function () {})
              })
            }),
        )
      }),
    )
  } else if (d.tipo === 'olvidar-api') {
    e.waitUntil(caches.delete(L.CACHE_API))
  }
})

/** La red con plazo: pasado `ms`, si hay copia se da la copia; si no, se sigue esperando a la red. */
function redOCopia(red, copia, ms) {
  return new Promise(function (resolver, rechazar) {
    var hecho = false
    var t = setTimeout(function () {
      copia().then(function (c) {
        if (c && !hecho) {
          hecho = true
          resolver(c)
        }
      })
    }, ms)
    red.then(
      function (r) {
        clearTimeout(t)
        if (!hecho) {
          hecho = true
          resolver(r)
        }
      },
      function (err) {
        clearTimeout(t)
        if (hecho) return
        copia().then(function (c) {
          if (hecho) return
          hecho = true
          if (c) resolver(c)
          else rechazar(err)
        })
      },
    )
  })
}

function recortarApi() {
  return caches.open(L.CACHE_API).then(function (c) {
    return c.keys().then(function (ks) {
      var sobran = ks.length - MAX_ENTRADAS_API
      if (sobran <= 0) return
      return Promise.all(
        ks.slice(0, sobran).map(function (k) {
          return c.delete(k)
        }),
      )
    })
  })
}

function navegacion(req) {
  var red = fetch(req).then(function (r) {
    if (r.ok && (r.headers.get('content-type') || '').indexOf('text/html') >= 0)
      guardarEn(CACHE_APP, '/index.html', r.clone())
    return r
  })
  return redOCopia(
    red,
    function () {
      return caches.match('/index.html')
    },
    PLAZO_NAVEGACION_MS,
  )
}

function app(req) {
  return caches.match(req, { ignoreVary: true }).then(function (c) {
    if (c) return c
    return fetch(req).then(function (r) {
      if (L.guardable(r)) guardarEn(CACHE_APP, req, r.clone())
      return r
    })
  })
}

async function api(req) {
  var cuerpo = req.method === 'POST' ? await req.clone().text() : ''
  var clave = L.claveApi(req.url, cuerpo, L.usuarioDeAutorizacion(req.headers.get('Authorization')))
  var red = fetch(req).then(function (r) {
    if (L.guardable(r)) guardarEn(L.CACHE_API, clave, r.clone()).then(recortarApi)
    return r
  })
  return redOCopia(
    red,
    function () {
      return caches.match(clave, { ignoreVary: true })
    },
    PLAZO_RED_MS,
  )
}

async function estado(req) {
  var cuerpo = await req.clone().text()
  var clave = L.claveEstado(self.location.origin, cuerpo)
  var red = fetch(req).then(function (r) {
    if (clave && L.guardable(r)) {
      r.clone()
        .json()
        .then(function (d) {
          if (d && d.correct && d.object && d.object.estado === 'LISTO')
            guardarEn(L.CACHE_API, clave, new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } }))
        })
        .catch(function () {})
    }
    return r
  })
  if (!clave) return red
  return redOCopia(
    red,
    function () {
      return caches.match(clave, { ignoreVary: true })
    },
    PLAZO_RED_MS,
  )
}

/** Un archivo del libro: la copia (entera o el trozo pedido, 206) si la hay; si no, la red tal cual. */
async function libro(req) {
  var copia = await caches.match(L.sinToken(req.url), { ignoreVary: true })
  if (!copia) return fetch(req)
  var cab = req.headers.get('Range')
  if (!cab) return copia
  var datos = await copia.blob()
  var total = datos.size
  var tipo = copia.headers.get('Content-Type') || datos.type || 'audio/mp4'
  var r = L.rango(cab, total)
  if (r === 'fuera')
    return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + total } })
  if (!r)
    return new Response(datos, {
      status: 200,
      headers: { 'Content-Type': tipo, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' },
    })
  return new Response(datos.slice(r.inicio, r.fin + 1, tipo), {
    status: 206,
    statusText: 'Partial Content',
    headers: L.cabecerasParcial(r, total, tipo),
  })
}

/** La portada del libro servida desde el propio origen (artwork de la pantalla de bloqueo). */
async function portada(req) {
  var u = new URL(req.url).searchParams.get('u')
  var icono = function () {
    return caches.match('/iconos/icono-512.png').then(function (c) {
      return c || fetch('/iconos/icono-512.png')
    })
  }
  if (!u || !L.rutaApi(u)) return icono()
  var clave = L.sinToken(u)
  var copia = await caches.match(clave, { ignoreVary: true })
  if (copia) return copia
  try {
    var r = await fetch(u, { mode: 'cors', credentials: 'omit' })
    if (!L.guardable(r)) return icono()
    guardarEn(L.CACHE_API, clave, r.clone())
    return r
  } catch (err) {
    return icono()
  }
}

self.addEventListener('fetch', function (e) {
  var req = e.request
  var que = L.estrategia({ url: req.url, metodo: req.method, origen: self.location.origin, modo: req.mode })
  if (!que) return
  var respuesta
  if (que === 'navegacion') respuesta = navegacion(req)
  else if (que === 'app') respuesta = app(req)
  else if (que === 'api') respuesta = api(req)
  else if (que === 'estado') respuesta = estado(req)
  else if (que === 'libro') respuesta = libro(req)
  else if (que === 'portada') respuesta = portada(req)
  if (respuesta) e.respondWith(respuesta)
})
