// Reglas nuevas de privacidad contra el emulador (sin tocar producción).
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, deleteField, collection, serverTimestamp } from 'firebase/firestore'
import fs from 'node:fs'

const env = await initializeTestEnvironment({
  projectId: 'fport1-social-test',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
})
const UID_FPORT1 = 'KSLnFnpX1ibA1RgJ1aifB2VWOyi1'
await env.clearFirestore()
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore()
  await setDoc(doc(db, 'users', UID_FPORT1), { usernameSlug: 'fport1' })
  await setDoc(doc(db, 'users', 'viejo'), { uid: 'viejo', email: 'viejo@example.com', profileName: 'Viejo' })
  await setDoc(doc(db, 'users', 'ana', 'private', 'profile'), { email: 'ana@example.com' })
  await setDoc(doc(db, 'users', 'ana', 'private', 'settings'), { mutedChats: [] })
  await setDoc(doc(db, 'launcher_sessions', 'codigoabc123'), { idToken: 'x', accessToken: '', createdAt: new Date() })
  await setDoc(doc(db, 'doomsday_access', 'ana'), { uid: 'ana', email: 'ana@example.com' })
})
const anon = env.unauthenticatedContext().firestore()
const ana = env.authenticatedContext('ana').firestore()
const beto = env.authenticatedContext('beto').firestore()
const viejo = env.authenticatedContext('viejo').firestore()
const fport1 = env.authenticatedContext(UID_FPORT1).firestore()

let ok = 0
const mal = []
const t = async (nombre, esperado, fn) => {
  try {
    await (esperado === 'permitido' ? assertSucceeds(fn()) : assertFails(fn()))
    ok++
    console.log(`OK    | ${esperado.padEnd(9)} | ${nombre}`)
  } catch {
    mal.push(nombre)
    console.log(`FALLA | ${esperado.padEnd(9)} | ${nombre}`)
  }
}

console.log('===== users: el perfil público ya no acepta datos personales =====')
await t('crear el propio perfil sin correo', 'permitido', () => setDoc(doc(ana, 'users', 'ana'), { uid: 'ana', username: '@ana', usernameSlug: 'ana', profileName: 'Ana', updatedAt: serverTimestamp() }))
await t('crear el propio perfil CON correo', 'denegado', () => setDoc(doc(beto, 'users', 'beto'), { uid: 'beto', email: 'b@example.com' }))
await t('añadir fcmTokens al perfil público', 'denegado', () => setDoc(doc(ana, 'users', 'ana'), { fcmTokens: ['t1'] }, { merge: true }))
await t('perfil sin migrar: editar otro campo deja el correo igual', 'permitido', () => setDoc(doc(viejo, 'users', 'viejo'), { profileName: 'Viejo 2' }, { merge: true }))
await t('perfil sin migrar: cambiar el correo', 'denegado', () => updateDoc(doc(viejo, 'users', 'viejo'), { email: 'otro@example.com' }))
await t('perfil sin migrar: quitarse el correo', 'permitido', () => updateDoc(doc(viejo, 'users', 'viejo'), { email: deleteField() }))
await t('escribir el perfil de otro', 'denegado', () => setDoc(doc(beto, 'users', 'ana'), { profileName: 'X' }, { merge: true }))
await t('leer un perfil sin sesión (sigue siendo público)', 'permitido', () => getDoc(doc(anon, 'users', 'ana')))
await t('listar perfiles sin sesión (buscador de @usuarios)', 'permitido', () => getDocs(collection(anon, 'users')))

console.log('===== users/{uid}/private: solo su dueño =====')
await t('el dueño lee su correo', 'permitido', () => getDoc(doc(ana, 'users', 'ana', 'private', 'profile')))
await t('el dueño escribe sus ajustes (silenciar, bloquear, push)', 'permitido', () => setDoc(doc(ana, 'users', 'ana', 'private', 'settings'), { blockedUsers: ['beto'], fcmTokens: ['t1'] }, { merge: true }))
await t('sin sesión no se lee el correo', 'denegado', () => getDoc(doc(anon, 'users', 'ana', 'private', 'profile')))
await t('otro usuario no lee el correo', 'denegado', () => getDoc(doc(beto, 'users', 'ana', 'private', 'profile')))
await t('otro usuario no lee los ajustes', 'denegado', () => getDoc(doc(beto, 'users', 'ana', 'private', 'settings')))
await t('otro usuario no escribe el correo', 'denegado', () => setDoc(doc(beto, 'users', 'ana', 'private', 'profile'), { email: 'x@example.com' }))
await t('@fport1 lee el correo (panel de Doomsday)', 'permitido', () => getDoc(doc(fport1, 'users', 'ana', 'private', 'profile')))
await t('@fport1 NO lee los ajustes privados', 'denegado', () => getDoc(doc(fport1, 'users', 'ana', 'private', 'settings')))
await t('@fport1 NO escribe el correo de otro', 'denegado', () => setDoc(doc(fport1, 'users', 'ana', 'private', 'profile'), { email: 'x@example.com' }))

console.log('===== launcher_sessions: tokens de Google =====')
await t('listar la colección sin sesión', 'denegado', () => getDocs(collection(anon, 'launcher_sessions')))
await t('listarla con sesión', 'denegado', () => getDocs(collection(ana, 'launcher_sessions')))
await t('el launcher lee SU código sin sesión', 'permitido', () => getDoc(doc(anon, 'launcher_sessions', 'codigoabc123')))
await t('la web deja los tokens (formato actual)', 'permitido', () => setDoc(doc(ana, 'launcher_sessions', 'nuevo1234567'), { idToken: 'eyJ', accessToken: '', createdAt: serverTimestamp() }))
await t('dejar tokens sin sesión', 'denegado', () => setDoc(doc(anon, 'launcher_sessions', 'nuevo7654321'), { idToken: 'eyJ', accessToken: '', createdAt: serverTimestamp() }))
await t('dejar otros campos', 'denegado', () => setDoc(doc(ana, 'launcher_sessions', 'nuevo0000000'), { idToken: 'e', accessToken: '', createdAt: serverTimestamp(), email: 'x' }))
await t('reescribir unos tokens ya puestos', 'denegado', () => setDoc(doc(ana, 'launcher_sessions', 'codigoabc123'), { idToken: 'otro', accessToken: '', createdAt: serverTimestamp() }))
await t('el launcher borra su código sin sesión', 'permitido', () => deleteDoc(doc(anon, 'launcher_sessions', 'codigoabc123')))

console.log('===== doomsday_access: lleva el correo =====')
await t('cada quien lee el suyo', 'permitido', () => getDoc(doc(ana, 'doomsday_access', 'ana')))
await t('otro usuario no lee el de otro', 'denegado', () => getDoc(doc(beto, 'doomsday_access', 'ana')))
await t('el admin lo lee', 'permitido', () => getDoc(doc(fport1, 'doomsday_access', 'ana')))
await t('sin sesión', 'denegado', () => getDoc(doc(anon, 'doomsday_access', 'ana')))

console.log(`\n${ok} bien, ${mal.length} mal`)
await env.cleanup()
process.exit(mal.length ? 1 : 0)
