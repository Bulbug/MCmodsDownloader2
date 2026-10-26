const BASE = 'https://api.modrinth.com/v2'
const cache = new Map()
const enc = (a) => encodeURIComponent(JSON.stringify(a))
export async function j(path, signal) {
  if (cache.has(path)) return cache.get(path)
  const r = await fetch(BASE + path, { signal })
  if (r.status === 429) throw new Error('Modrinth rate limit reached. Wait a moment and retry.')
  if (!r.ok) throw new Error(`Modrinth returned ${r.status} for ${path}`)
  const data = await r.json()
  cache.set(path, data)
  return data
}
export const gameVersions = async () =>
  (await j('/tag/game_version')).filter((v) => v.version_type === 'release').map((v) => v.version)
export function search({ query, version, loader, sort, offset }, signal) {
  const facets = [['project_type:mod'], [`versions:${version}`], [`categories:${loader}`]]
  return j(`/search?query=${encodeURIComponent(query)}&facets=${enc(facets)}&index=${sort}&offset=${offset}&limit=20`, signal)
}
// Recursively resolves required dependencies for the chosen version + loader.
export async function resolve(roots, gv, loader) {
  const out = new Map()
  async function visit(id, by) {
    if (out.has(id)) { if (by) out.get(id).requiredBy.add(by); return }
    const e = { id, title: id, requiredBy: new Set(by ? [by] : []), root: false }
    out.set(id, e)
    const [p, vers] = await Promise.all([
      j(`/project/${id}`),
      j(`/project/${id}/version?game_versions=${enc([gv])}&loaders=${enc([loader])}`),
    ])
    e.title = p.title; e.slug = p.slug; e.icon = p.icon_url
    const v = vers.find((x) => x.version_type === 'release') || vers[0]
    if (!v) { e.error = `No ${loader} release for Minecraft ${gv}`; return }
    e.version = v
    e.file = v.files.find((f) => f.primary) || v.files[0]
    for (const d of v.dependencies || []) {
      if (d.dependency_type !== 'required') continue
      let pid = d.project_id
      if (!pid && d.version_id) pid = (await j(`/version/${d.version_id}`)).project_id
      if (pid) await visit(pid, p.title)
    }
  }
  for (const r of roots) {
    try { await visit(r.id, null) } catch (err) {
      out.set(r.id, { id: r.id, title: r.title, requiredBy: new Set(), error: err.message })
    }
    if (out.has(r.id)) out.get(r.id).root = true
  }
  return [...out.values()]
}
