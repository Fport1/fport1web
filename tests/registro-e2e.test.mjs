// Registro de principio a fin contra el emulador (nunca contra producción).
// Se ejecuta con:  firebase emulators:exec --only firestore "node tests/registro-e2e.test.mjs"
//
// Reproduce lo que hace la app de verdad:
//   1. el registro (misma transacción que src/lib/username.js),
//   2. silenciar un chat (lo que escribe mensajes/page.js),
//   3. leer el perfil como lo junta src/components/auth-context.js
//      (lo público + private/settings),
// y comprueba desde fuera, sin sesión y con otra cuenta, que el correo no se ve.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, runTransaction,
         serverTimestamp, arrayUnion } from 'firebase/firestore'
import fs from 'node:fs'

const env = await initializeTestEnvironment({
  projectId: 'fport1-social-e2e',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
})

const ANA = 'uidAna', BETO = 'uidBeto', ADMIN = 'uidAdminFport1'
const CORREO = 'ana@ejemplo.com'
await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'users', ADMIN), { usernameSlug: 'fport1' })
})

const ana = env.authenticatedContext(ANA).firestore()
const beto = env.authenticatedContext(BETO).firestore()
const admin = env.authenticatedContext(ADMIN).firestore()
const anon = env.unauthenticatedContext().firestore()

let ok = 0; const mal = []
const t = async (n, esperado, fn) => {
  try { await (esperado === 'permitido' ? assertSucceeds(fn()) : assertFails(fn())); ok++; console.log(`OK    | ${esperado.padEnd(9)} | ${n}`) }
  catch { mal.push(n); console.log(`FALLA | ${esperado.padEnd(9)} | ${n}`) }
}
const comprobar = (n, cond) => { if (cond) { ok++; console.log(`OK    | dato      | ${n}`) } else { mal.push(n); console.log(`FALLA | dato      | ${n}`) } }

console.log('===== 1. registro (igual que username.js) =====')
await t('Ana se registra: perfil publico + correo en privado, en una transaccion', 'permitido', () =>
  runTransaction(ana, async tx => {
    const now = serverTimestamp()
    tx.set(doc(ana, 'usernames', 'ana'), { uid: ANA, createdAt: now })
    tx.set(doc(ana, 'users', ANA), { uid: ANA, username: '@ana', usernameSlug: 'ana', profileName: 'Ana', minecraftUsername: null, minecraftUUID: null, updatedAt: now, createdAt: now }, { merge: true })
    tx.set(doc(ana, 'users', ANA, 'private', 'profile'), { email: CORREO, updatedAt: now }, { merge: true })
  }))
await t('el codigo VIEJO (correo en el perfil publico) ya no puede registrar', 'denegado', () =>
  setDoc(doc(beto, 'users', BETO), { uid: BETO, username: '@beto', usernameSlug: 'beto', email: 'beto@ejemplo.com' }))

console.log('===== 2. silenciar un chat (mensajes/page.js) =====')
await t('Ana silencia un chat', 'permitido', () =>
  setDoc(doc(ana, 'users', ANA, 'private', 'settings'), { mutedChats: arrayUnion('conv123') }, { merge: true }))
await t('Ana bloquea a alguien', 'permitido', () =>
  setDoc(doc(ana, 'users', ANA, 'private', 'settings'), { blockedUsers: arrayUnion(BETO) }, { merge: true }))
await t('Ana guarda su token de push (ChatNotifier)', 'permitido', () =>
  setDoc(doc(ana, 'users', ANA, 'private', 'settings'), { fcmTokens: arrayUnion('token-de-prueba') }, { merge: true }))

console.log('===== 3. el perfil como lo junta auth-context =====')
const publico = (await getDoc(doc(ana, 'users', ANA))).data()
const privado = (await getDoc(doc(ana, 'users', ANA, 'private', 'settings'))).data() || {}
const perfil = { ...publico, ...privado }
comprobar('la interfaz ve el chat silenciado', perfil.mutedChats?.includes('conv123'))
comprobar('la interfaz ve al usuario bloqueado', perfil.blockedUsers?.includes(BETO))
comprobar('el perfil publico NO lleva correo', !('email' in publico))
comprobar('el perfil publico NO lleva silenciados ni bloqueados', !('mutedChats' in publico) && !('blockedUsers' in publico))
comprobar('el perfil publico NO lleva tokens de push', !('fcmTokens' in publico))

console.log('===== 4. desde fuera =====')
await t('sin sesion se lee el perfil publico (nombre, @usuario)', 'permitido', () => getDoc(doc(anon, 'users', ANA)))
const visto = (await getDoc(doc(anon, 'users', ANA))).data()
comprobar('y en lo que se ve sin sesion no hay correo', !('email' in visto))
await t('sin sesion NO se lee el correo', 'denegado', () => getDoc(doc(anon, 'users', ANA, 'private', 'profile')))
await t('otra cuenta NO lee el correo de Ana', 'denegado', () => getDoc(doc(beto, 'users', ANA, 'private', 'profile')))
await t('otra cuenta NO ve a quien bloqueo Ana', 'denegado', () => getDoc(doc(beto, 'users', ANA, 'private', 'settings')))
await t('@fport1 si lee el correo (panel de Doomsday)', 'permitido', () => getDoc(doc(admin, 'users', ANA, 'private', 'profile')))
await t('@fport1 NO ve a quien bloqueo Ana', 'denegado', () => getDoc(doc(admin, 'users', ANA, 'private', 'settings')))

console.log('===== 5. inicio de sesion del launcher con Google =====')
const CODIGO = 'abc123def456ghi789xy' // 20 caracteres [0-9a-z], como los genera el launcher
await t('la web deja los tokens para el launcher', 'permitido', () =>
  setDoc(doc(ana, 'launcher_sessions', CODIGO), { idToken: 'id-de-prueba', accessToken: 'acceso-de-prueba', createdAt: serverTimestamp() }))
await t('el launcher los lee sin sesion sabiendo el codigo', 'permitido', () => getDoc(doc(anon, 'launcher_sessions', CODIGO)))
await t('nadie puede LISTAR las sesiones para cosechar tokens', 'denegado', () => getDocs(collection(anon, 'launcher_sessions')))
await t('otro usuario no puede sobrescribir la sesion', 'denegado', () =>
  setDoc(doc(beto, 'launcher_sessions', CODIGO), { idToken: 'robado', accessToken: '', createdAt: serverTimestamp() }))
await t('el launcher la borra sin sesion al recogerla', 'permitido', () => deleteDoc(doc(anon, 'launcher_sessions', CODIGO)))

await env.cleanup()
console.log(`\nresumen: ${ok} correctas, ${mal.length} fallidas`)
if (mal.length) { console.log('fallaron:', mal.join(' | ')); process.exit(1) }
