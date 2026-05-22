import { auth, storage } from '@/lib/firebase'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'

function safeName(name) {
  return String(name || 'file').replace(/[^\w.\-]+/g, '_')
}

async function uploadBlob(file, path) {
  const r = sRef(storage, path)
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' })
  const url = await getDownloadURL(r)
  return { url, path }
}

export async function uploadMessageAttachment(cid, file, kind) {
  const me = auth.currentUser?.uid
  if (!me) throw new Error('No auth user')
  const ts = Date.now()
  const base = `${ts}_${me}_${safeName(file.name || kind)}`
  const path = `uploads/${me}/conversations/${cid}/${base}`
  const { url } = await uploadBlob(file, path)
  return {
    kind: kind || 'file',
    name: file.name || base,
    url,
    path,
    size: file.size || null,
    contentType: file.type || null,
  }
}

export async function uploadManyAttachments(cid, items = []) {
  const out = []
  for (const it of items) {
    const kind = it.kind || 'file'
    const file = it.file || it
    out.push(await uploadMessageAttachment(cid, file, kind))
  }
  return out
}
