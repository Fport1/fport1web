// GET /api/minecraft?username=TuNombre
// Server-side proxy to Mojang API (avoids CORS from browser)
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')
  if (!username) return Response.json({ error: 'username requerido' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      { next: { revalidate: 300 } } // cache 5 min
    )
    if (res.status === 404) return Response.json({ error: 'Usuario de Minecraft no encontrado' }, { status: 404 })
    if (!res.ok)            return Response.json({ error: 'Error al consultar Mojang' }, { status: res.status })
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Error de red' }, { status: 500 })
  }
}