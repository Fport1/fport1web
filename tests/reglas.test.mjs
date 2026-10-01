// Pruebas de firestore.rules y storage.rules contra el emulador.
// Se ejecutan con:  npm run test:reglas
//
// Cubren la tabla de APRENDIZAJE.md §3 y, sobre todo, el FORMATO ACTUAL que ya
// sube el launcher: un fallo aquí significaría rechazar datos que hoy entran.
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import fs from 'node:fs'

const env = await initializeTestEnvironment({
  projectId: 'fport1-social-test',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  storage: { rules: fs.readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
})

// El uid real: storage.rules lo lleva fijo, asi que el test no puede inventarse otro.
const UID_FPORT1 = 'KSLnFnpX1ibA1RgJ1aifB2VWOyi1'
// Perfil de @fport1: es lo que miran las reglas para permitir los borrados.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'users', UID_FPORT1), { usernameSlug: 'fport1' })
})

const anon = env.unauthenticatedContext().firestore()
const admin = env.authenticatedContext(UID_FPORT1).firestore()
const anonSt = env.unauthenticatedContext().storage()
const adminSt = env.authenticatedContext(UID_FPORT1).storage()

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

// ───────── datos de ejemplo ─────────
const resumen = {
  minutes: 10, counted: 9, fpsAvg: 57.6, fpsMin: 12, msptAvg: 21.2, msptP95: 39.6,
  errorsPerMin: 0, warningsPerMin: 1.5, lagPerMin: 0.4, worldLoadMs: 8297,
}
const outcome = (extra = {}, quitar = []) => {
  const base = {
    kind: 'mod', target: 'sodium', mc: '1.20.1', loader: 'forge', v: '1.10.1',
    modVersion: '0.5.8', mods: ['sodium'], before: resumen, after: resumen,
    ranAfter: true, verdict: 'mejor', lessonId: 'abc123', at: serverTimestamp(), ...extra,
  }
  quitar.forEach(k => delete base[k])
  return base
}
// FORMATO ACTUAL del launcher: sin `live`. Es el caso que no se puede romper.
const partidaActual = {
  mc: '1.20.1', loader: 'forge', v: '1.10.1', mods: ['jei'], modCount: 1,
  minutes: 45, crashed: false, sig: '', loadSeconds: 30, lagWarnings: 2, errors: 0,
  warnings: 3, noisy: { create: 3 }, at: serverTimestamp(),
}
const live = {
  fpsAvg: 97.2, fpsP5: 52, msptAvg: 7.7, msptP95: 12.8, lagPerMin: 0.2,
  worldLoadMs: 8297, dimLoadMs: 1200, memMaxMb: 4016, samples: 45,
  topEntities: { 'minecraft:zombie': 20 },
}
const mundoCompleto = {
  mode: 'survival', difficulty: 'normal', hardcore: false, cheats: false, dims: 2,
  gen: 'default', datapacks: 1, rules: 0, minutes: 45, killed: 10, killedBy: 1,
  deaths: 1, mined: 200,
}

console.log('===== play_sessions: no romper lo que ya funciona =====')
await t('formato ACTUAL del launcher, sin live', 'permitido',
  () => setDoc(doc(anon, 'play_sessions', 'partidaA1'), partidaActual))
await t('con world completo y sin live', 'permitido',
  () => setDoc(doc(anon, 'play_sessions', 'partidaA2'), { ...partidaActual, world: mundoCompleto }))
await t('con live válido', 'permitido',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB1'), { ...partidaActual, live }))
await t('live con topEntities de 11 entradas', 'denegado',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB2'),
    { ...partidaActual, live: { ...live, topEntities: Object.fromEntries(Array.from({ length: 11 }, (_, i) => ['e' + i, 1])) } }))
await t('live con campo inventado', 'denegado',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB3'), { ...partidaActual, live: { ...live, playerName: 'Pepe' } }))
await t('live con fpsAvg absurdo (99999)', 'denegado',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB4'), { ...partidaActual, live: { ...live, fpsAvg: 99999 } }))
await t('live con texto donde va un número', 'denegado',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB5'), { ...partidaActual, live: { ...live, msptAvg: 'x'.repeat(5000) } }))
await t('partida con nombre de mundo', 'denegado',
  () => setDoc(doc(anon, 'play_sessions', 'partidaB6'), { ...partidaActual, world: { mode: 'survival', name: 'Mi mundo' } }))

console.log('===== live_outcomes =====')
await t('completo y válido', 'permitido',
  () => setDoc(doc(anon, 'live_outcomes', 'res00001'), outcome()))
await t('sin before (veredicto sin datos de antes)', 'permitido',
  () => setDoc(doc(anon, 'live_outcomes', 'res00002'), outcome({ verdict: 'sin datos de antes' }, ['before'])))
await t('un anonimo NO lo lee', 'denegado',
  () => getDoc(doc(anon, 'live_outcomes', 'res00001')))
await t('@fport1 si lo lee', 'permitido',
  () => getDoc(doc(admin, 'live_outcomes', 'res00001')))
await t('con label', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00003'), outcome({ label: 'lo que sea' })))
await t('con player', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00004'), outcome({ player: 'Pepe' })))
await t('con uuid', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00005'), outcome({ uuid: '123' })))
await t('kind fuera de la lista', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00006'), outcome({ kind: 'loquesea' })))
await t('verdict inventado', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00007'), outcome({ verdict: 'genial' })))
await t('target con espacios', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00008'), outcome({ target: 'mi mod' })))
await t('target con mayúsculas', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00009'), outcome({ target: 'Sodium' })))
await t('target larguísimo', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00010'), outcome({ target: 'a'.repeat(100) })))
await t('before.minutes = 5000', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00011'), outcome({ before: { ...resumen, minutes: 5000 } })))
await t('before con campo extra', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00012'), outcome({ before: { ...resumen, worldName: 'x' } })))
await t('before con texto en un número', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00013'), outcome({ before: { ...resumen, fpsAvg: 'y'.repeat(5000) } })))
await t('at distinto de request.time', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'res00014'), outcome({ at: new Date(2020, 0, 1) })))
await t('id con formato inválido', 'denegado',
  () => setDoc(doc(anon, 'live_outcomes', 'x'), outcome()))
await t('modificar uno ya creado', 'denegado',
  () => updateDoc(doc(anon, 'live_outcomes', 'res00001'), { verdict: 'peor' }))
await t('borrar sin ser @fport1', 'denegado',
  () => deleteDoc(doc(anon, 'live_outcomes', 'res00001')))
await t('@fport1 lo borra', 'permitido',
  () => deleteDoc(doc(admin, 'live_outcomes', 'res00001')))

console.log('===== storage ai-data =====')
await t('escribir en ai-data desde el cliente', 'denegado',
  () => uploadBytes(ref(anonSt, 'ai-data/perf/2026/09/x.json.gz'), new Uint8Array([1, 2, 3])))
await t('leer de ai-data desde el cliente', 'denegado',
  () => getDownloadURL(ref(anonSt, 'ai-data/perf/2026/09/x.json.gz')))

console.log('===== no se rompió nada de antes =====')
await t('ai_lessons con kind', 'permitido',
  () => setDoc(doc(anon, 'ai_lessons', 'leccion00001'),
    { kind: 'construccion', title: 't', symptom: 's', cause: 'c', fix: 'f', mc: '1.20.1', loader: 'forge', worked: 0, failed: 0, created: serverTimestamp() }))
await t('crash_signatures', 'permitido',
  () => setDoc(doc(anon, 'crash_signatures', '0123456789abcdef01234567'),
    { sig: 'NullPointer', mc: '1.20.1', loader: 'forge', count: 1, lastSeen: serverTimestamp() }))
await t('launcher_installs', 'permitido',
  () => setDoc(doc(anon, 'launcher_installs', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    { firstSeen: serverTimestamp(), lastSeen: serverTimestamp(), v: '1.10.1', launches: 1 }))
await t('anónimo NO lee launcher_installs', 'denegado',
  () => getDoc(doc(anon, 'launcher_installs', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')))

console.log('===== github_tokens: cerrada a cal y canto =====')
await t('anonimo NO lo lee', 'denegado', () => getDoc(doc(anon, 'github_tokens', UID_FPORT1)))
await t('ni el propio fport1 lo lee', 'denegado', () => getDoc(doc(admin, 'github_tokens', UID_FPORT1)))
await t('anonimo NO escribe', 'denegado', () => setDoc(doc(anon, 'github_tokens', UID_FPORT1), { token: 'x' }))
await t('ni el propio fport1 escribe', 'denegado', () => setDoc(doc(admin, 'github_tokens', UID_FPORT1), { token: 'x' }))

console.log('===== fport1_projects: sigue igual =====')
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'fport1_projects', 'zzPub'), { published: true, downloads: 5 })
  await setDoc(doc(ctx.firestore(), 'fport1_projects', 'zzPriv'), { published: false, downloads: 0 })
})
await t('cualquiera ve lo publicado', 'permitido', () => getDoc(doc(anon, 'fport1_projects', 'zzPub')))
await t('nadie ve el borrador', 'denegado', () => getDoc(doc(anon, 'fport1_projects', 'zzPriv')))
await t('suma 1 descarga', 'permitido', () => updateDoc(doc(anon, 'fport1_projects', 'zzPub'), { downloads: 6 }))
await t('suma 5 descargas', 'denegado', () => updateDoc(doc(anon, 'fport1_projects', 'zzPriv'), { downloads: 5 }))
await t('otro publica un borrador', 'denegado', () => updateDoc(doc(anon, 'fport1_projects', 'zzPriv'), { published: true }))
await t('fport1 publica', 'permitido', () => updateDoc(doc(admin, 'fport1_projects', 'zzPriv'), { published: true }))

console.log('===== storage: puente temporal =====')
await t('anonimo NO sube al temporal', 'denegado', () => uploadBytes(ref(anonSt, 'fport1/tmp/' + UID_FPORT1 + '/x.jar'), new Uint8Array([1])))
await t('fport1 sube al temporal', 'permitido', () => uploadBytes(ref(adminSt, 'fport1/tmp/' + UID_FPORT1 + '/x.jar'), new Uint8Array([1])))
await t('nadie lee el temporal', 'denegado', () => getDownloadURL(ref(anonSt, 'fport1/tmp/' + UID_FPORT1 + '/x.jar')))

await env.cleanup()
console.log(`\nresumen: ${ok} correctas, ${mal.length} fallidas`)
if (mal.length) {
  console.log('fallaron:', mal.join(' | '))
  process.exit(1)
}
