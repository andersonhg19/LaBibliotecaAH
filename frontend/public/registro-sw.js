/*
 * Registro del service worker (0.5.0, contrato C12). Archivo aparte y no un <script> en línea: la CSP de la web
 * (scripts/csp.mjs) no deja correr scripts en línea.
 *
 *   · Solo en la web CONSTRUIDA (`expo export`: el index.html lleva /_expo/static/js/…); nunca en `expo start`
 *     (desarrollo) ni en las pruebas.
 *   · La versión de la caché es la huella del paquete de la web: cada despliegue estrena la suya.
 *   · `localStorage['bah.sw'] = '0'` lo quita (interruptor de emergencia si algo fuera mal en un teléfono).
 *   · `window.__bahSW` dice a la app (utils/sinConexion) que hay service worker.
 */
;(function () {
  try {
    if (!('serviceWorker' in navigator)) return
    var apagado = false
    try {
      apagado = window.localStorage.getItem('bah.sw') === '0'
    } catch (e) {
      /* sin almacenamiento */
    }
    if (apagado) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) {
          r.unregister()
        })
      })
      return
    }
    var guion = document.querySelector('script[src*="/_expo/static/js/"]')
    if (!guion) return
    var m = /-([0-9a-f]{8,})\.js/i.exec(guion.getAttribute('src') || '')
    var version = m ? m[1].slice(0, 16) : 'web'
    window.__bahSW = version
    var registrar = function () {
      navigator.serviceWorker
        .register('/sw.js?v=' + version, { scope: '/', updateViaCache: 'none' })
        .then(function () {
          return navigator.serviceWorker.ready
        })
        .then(function (reg) {
          // Lo que esta página ya cargó antes de tener service worker (fuentes, imágenes): a la caché de la app.
          var urls = []
          try {
            urls = performance
              .getEntriesByType('resource')
              .map(function (x) {
                return x.name
              })
              .filter(function (u) {
                return u.indexOf(location.origin + '/') === 0
              })
          } catch (e) {
            /* sin performance */
          }
          if (reg.active && urls.length) reg.active.postMessage({ tipo: 'precache', urls: urls })
        })
        .catch(function (e) {
          console.warn('[sw] no se pudo registrar', e)
        })
    }
    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar)
  } catch (e) {
    /* sin service worker: la web funciona igual, solo que sin copia */
  }
})()
