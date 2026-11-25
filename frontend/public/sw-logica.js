/*
 * LA LÓGICA PURA DEL SERVICE WORKER (0.5.0, contrato C12). Sin red ni cachés: solo
 * decide. La usan `sw.js` (importScripts) y las pruebas de jest (require), por eso es
 * JavaScript plano con envoltorio UMD y sin dependencias.
 *
 *   · clave de caché SIN el token (`?t=`): el token caduca y cambia; la copia no;
 *   · qué estrategia toca a cada petición (app, API de lectura, estado del audio,
 *     archivos del libro, portada para la pantalla de bloqueo, o nada);
 *   · rangos (`Range: bytes=…`) para responder 206 al <audio> desde la caché;
 *   · nombres de las cachés y cuáles sobran al cambiar de versión.
 */
;(function (raiz, fabrica) {
  var m = fabrica()
  if (typeof module === 'object' && module.exports) module.exports = m
  else raiz.BahSW = m
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  var PREFIJO_APP = 'bah-app-'
  var CACHE_API = 'bah-api'
  var PREFIJO_LIBRO = 'bah-libro-'
  /** Rutas internas del propio origen que atiende el service worker. */
  var INTERNO = '/__bah/'

  /** La URL sin el parámetro `t` (el token), absoluta. */
  function sinToken(url) {
    try {
      var u = new URL(url)
      u.searchParams.delete('t')
      u.hash = ''
      return u.href
    } catch (e) {
      return String(url).replace(/([?&])t=[^&#]*(&?)/, function (_, a, b) {
        return b ? a : ''
      })
    }
  }

  var RE_API = /\/(?:BIBLIOTECA|AUTH)-SERVICE\/biblioteca\/v1(\/[^?#]*)/

  /** La ruta de la API tras `/v1` («/libros/get/x»), o null si no es de la API. */
  function rutaApi(url) {
    var m = RE_API.exec(String(url))
    return m ? m[1] : null
  }

  /** Archivos de un libro que se guardan sin conexión (audio, tiempos, frases, portada, EPUB). */
  function esArchivoLibro(ruta) {
    return /^\/archivos\/[^/]+\/(?:audio\/[^/]+\/[^/]+|frases\/[^/]+|portada\.jpg|libro\.epub)$/.test(ruta || '')
  }

  /** POST que solo leen (lo que el reproductor y la biblioteca necesitan para abrir un libro sin red). */
  var POST_LECTURA = [
    /^\/libros\/all$/,
    /^\/libros\/get\/[^/]+$/,
    /^\/libros\/facetas$/,
    /^\/progreso\/get\/[^/]+$/,
    /^\/voces\/all$/,
    /^\/estantes\/all$/,
    /^\/estantes\/[^/]+\/libros$/,
    /^\/anotaciones\/all\/[^/]+$/,
    /^\/comentarios\/all\/[^/]+$/,
    /^\/carpetas\/all$/,
    /^\/carpetas\/contenido$/,
    /^\/users\/get\/[^/]+$/,
  ]
  /** GET de la API que son lecturas JSON (los binarios van aparte). */
  var GET_LECTURA = [/^\/voz\/preparar-libro$/, /^\/ejemplares\/[^/]+\/pronunciacion$/, /^\/sesiones\/resumen$/]

  function encaja(lista, ruta) {
    for (var i = 0; i < lista.length; i++) if (lista[i].test(ruta)) return true
    return false
  }

  /**
   * Qué hacer con una petición:
   *   'navegacion'  index.html: red primero, copia si no hay red;
   *   'app'         js/css/fuentes/iconos del propio origen: caché primero;
   *   'portada'     /__bah/portada?u=…: la portada del libro desde el propio origen (pantalla de bloqueo);
   *   'estado'      POST /audio/estado: red primero; sin red, el LISTO guardado;
   *   'api'         lecturas de la API: red primero con respaldo;
   *   'libro'       archivos de un libro: la copia si la hay; si no, la red tal cual (sin guardar);
   *   null          no se toca (el navegador hace lo de siempre).
   */
  function estrategia(p) {
    var metodo = String(p.metodo || 'GET').toUpperCase()
    var url
    try {
      url = new URL(p.url)
    } catch (e) {
      return null
    }
    var mismoOrigen = url.origin === p.origen
    if (mismoOrigen && url.pathname === INTERNO + 'portada') return metodo === 'GET' ? 'portada' : null
    var ruta = rutaApi(url.href)
    if (ruta) {
      if (metodo === 'POST') {
        if (ruta === '/audio/estado') return 'estado'
        return encaja(POST_LECTURA, ruta) ? 'api' : null
      }
      if (metodo !== 'GET') return null
      if (esArchivoLibro(ruta)) return 'libro'
      return encaja(GET_LECTURA, ruta) ? 'api' : null
    }
    if (!mismoOrigen || metodo !== 'GET') return null
    if (p.modo === 'navigate') return 'navegacion'
    if (/^\/(?:_expo|assets|fuentes|iconos|foliate)\//.test(url.pathname)) return 'app'
    if (/^\/(?:favicon\.ico|manifest\.webmanifest|registro-sw\.js)$/.test(url.pathname)) return 'app'
    return null
  }

  /** FNV-1a de 32 bits en hexadecimal (para claves cortas de cuerpos JSON). */
  function huella(texto) {
    var h = 0x811c9dc5
    var s = String(texto || '')
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return ('0000000' + h.toString(16)).slice(-8)
  }

  /** El usuario del token (`sub` o `userId` del JWT), o 'anonimo'. Solo para separar copias: no valida nada. */
  function usuarioDeAutorizacion(cabecera) {
    try {
      var m = /^Bearer\s+([^.]+)\.([^.]+)\./i.exec(String(cabecera || ''))
      if (!m) return 'anonimo'
      var b64 = m[2].replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      var d = JSON.parse(atob(b64))
      var u = d.sub != null ? d.sub : d.userId != null ? d.userId : d.id
      return u != null ? String(u).replace(/[^A-Za-z0-9@._-]/g, '').slice(0, 80) || 'anonimo' : 'anonimo'
    } catch (e) {
      return 'anonimo'
    }
  }

  /** El cuerpo JSON en forma canónica (claves ordenadas), sin `reintentar`. */
  function cuerpoCanonico(cuerpo) {
    if (cuerpo == null || cuerpo === '') return ''
    try {
      var o = JSON.parse(cuerpo)
      return JSON.stringify(ordenar(o))
    } catch (e) {
      return String(cuerpo)
    }
  }
  function ordenar(o) {
    if (Array.isArray(o)) return o.map(ordenar)
    if (o && typeof o === 'object') {
      var r = {}
      Object.keys(o)
        .sort()
        .forEach(function (k) {
          if (k !== 'reintentar') r[k] = ordenar(o[k])
        })
      return r
    }
    return o
  }

  /**
   * La clave de una lectura de la API en `bah-api`: la URL sin token, de quién es (cada cuenta ve solo lo suyo) y
   * la huella del cuerpo (los POST no se pueden guardar tal cual en Cache Storage).
   */
  function claveApi(url, cuerpo, usuario) {
    var base = sinToken(url)
    var sep = base.indexOf('?') >= 0 ? '&' : '?'
    return base + sep + '__u=' + encodeURIComponent(usuario || 'anonimo') + '&__c=' + huella(cuerpoCanonico(cuerpo))
  }

  /** La clave del estado LISTO de un capítulo en una voz (la misma la escribe la web al guardar el libro). */
  function claveEstado(origen, cuerpo) {
    try {
      var o = typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo
      if (!o || typeof o.ejemplarId !== 'string' || typeof o.vozId !== 'string') return null
      var cap = Number(o.capitulo)
      if (!isFinite(cap) || cap < 0 || Math.floor(cap) !== cap) return null
      return (
        origen + INTERNO + 'estado/' + encodeURIComponent(o.ejemplarId) + '/' + encodeURIComponent(o.vozId) + '/' + cap
      )
    } catch (e) {
      return null
    }
  }

  function nombreCacheApp(version) {
    return PREFIJO_APP + String(version || 'x')
  }
  function nombreCacheLibro(ejemplarId) {
    return PREFIJO_LIBRO + String(ejemplarId)
  }

  /** Las cachés de la app de otras versiones (las de libros y la de la API nunca se tocan). */
  function cachesSobrantes(nombres, version) {
    var actual = nombreCacheApp(version)
    return (nombres || []).filter(function (n) {
      return n.indexOf(PREFIJO_APP) === 0 && n !== actual
    })
  }

  /**
   * `Range: bytes=…` sobre un archivo de `total` bytes → {inicio, fin} (fin incluido), null si no hay rango o no se
   * entiende (se responde entero), o 'fuera' si no se puede satisfacer (416). Solo un rango (el <audio> pide uno).
   */
  function rango(cabecera, total) {
    if (!cabecera) return null
    var m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(String(cabecera))
    if (!m || (m[1] === '' && m[2] === '')) return null
    var inicio, fin
    if (m[1] === '') {
      var sufijo = parseInt(m[2], 10)
      if (!(sufijo > 0)) return 'fuera'
      inicio = Math.max(0, total - sufijo)
      fin = total - 1
    } else {
      inicio = parseInt(m[1], 10)
      fin = m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1)
    }
    if (!(total > 0) || inicio >= total || fin < inicio) return 'fuera'
    return { inicio: inicio, fin: fin }
  }

  /** Cabeceras de una respuesta 206. */
  function cabecerasParcial(r, total, tipo) {
    return {
      'Content-Type': tipo || 'application/octet-stream',
      'Content-Length': String(r.fin - r.inicio + 1),
      'Content-Range': 'bytes ' + r.inicio + '-' + r.fin + '/' + total,
      'Accept-Ranges': 'bytes',
    }
  }

  /** Se puede guardar: 200 legible (no opaca: CORS bien puesto) y no parcial. */
  function guardable(respuesta) {
    return !!respuesta && respuesta.status === 200 && respuesta.type !== 'opaque' && respuesta.type !== 'error'
  }

  return {
    PREFIJO_APP: PREFIJO_APP,
    CACHE_API: CACHE_API,
    PREFIJO_LIBRO: PREFIJO_LIBRO,
    INTERNO: INTERNO,
    sinToken: sinToken,
    rutaApi: rutaApi,
    esArchivoLibro: esArchivoLibro,
    estrategia: estrategia,
    huella: huella,
    usuarioDeAutorizacion: usuarioDeAutorizacion,
    cuerpoCanonico: cuerpoCanonico,
    claveApi: claveApi,
    claveEstado: claveEstado,
    nombreCacheApp: nombreCacheApp,
    nombreCacheLibro: nombreCacheLibro,
    cachesSobrantes: cachesSobrantes,
    rango: rango,
    cabecerasParcial: cabecerasParcial,
    guardable: guardable,
  }
})
