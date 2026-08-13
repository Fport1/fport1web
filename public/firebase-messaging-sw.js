/* Service worker de Firebase Cloud Messaging.
 *
 * Recibe las notificaciones cuando la pestaña está cerrada o en segundo plano.
 * Con la app abierta el aviso lo pinta ChatNotifier, no este archivo.
 *
 * La configuración llega en la propia URL del worker: un service worker no ve
 * las variables de entorno de Next, y así no hay que escribirla a mano aquí ni
 * mantener dos copias sincronizadas. Quien registra el worker (ChatNotifier)
 * añade los parámetros.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')

const params = new URL(self.location).searchParams
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
}

if (config.projectId && config.apiKey) {
  firebase.initializeApp(config)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage(payload => {
    const cid = payload.data?.cid
    self.registration.showNotification(payload.notification?.title || 'Fport1', {
      body: payload.notification?.body || '',
      icon: '/favicon.ico',
      tag: cid ? `fp-chat-${cid}` : 'fp-chat',
      data: { link: cid ? `/mensajes?c=${cid}` : '/mensajes' },
    })
  })
}

// Al tocar la notificación: reutiliza una pestaña abierta si la hay.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const link = event.notification.data?.link || '/mensajes'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(link); return c.focus() }
      }
      if (clients.openWindow) return clients.openWindow(link)
    })
  )
})
