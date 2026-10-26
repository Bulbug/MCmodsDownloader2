import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Search, Package, Download, Trash2, Plus, Check, AlertTriangle, ExternalLink, Loader2, Heart, Settings, Info, Sun, Moon, Bookmark, ListChecks } from 'lucide-react'
import Details from './Details.jsx'
import { gameVersions, search, resolve, mrpackToMods, j } from './api.js'

const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']
const SORTS = [['relevance', 'Relevance'], ['downloads', 'Downloads'], ['follows', 'Follows'], ['updated', 'Recently updated']]
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
const LOADER_META = { fabric: ['https://meta.fabricmc.net/v2/versions/loader', 'fabric-loader'], quilt: ['https://meta.quiltmc.org/v3/versions/loader', 'quilt-loader'] }
const arr = (k) => { const v = load(k, []); return Array.isArray(v) ? v : [] }
const toB64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))))
function validPack(d) {
  if (!d || typeof d.v !== 'string' || !LOADERS.includes(d.l) || !Array.isArray(d.m)) throw new Error('Not a valid pack')
  const m = d.m.filter((x) => x && /^[A-Za-z0-9]{6,12}$/.test(x.id)).slice(0, 100).map((x) => ({ id: x.id, title: String(x.title || x.id).slice(0, 80) }))
  if (!m.length) throw new Error('The pack contains no mods')
  return { v: d.v.slice(0, 20), l: d.l, m }
}
const CONFLICTS = [['starlight', 'scalablelux'], ['starlight', 'phosphor'], ['scalablelux', 'phosphor'], ['lithium', 'canary'], ['sodium', 'embeddium'], ['sodium', 'rubidium'], ['embeddium', 'rubidium'], ['iris', 'oculus']]
const PERF = { fabric: ['sodium', 'lithium', 'ferrite-core', 'modernfix', 'entityculling', 'immediatelyfast'], forge: ['embeddium', 'modernfix', 'ferrite-core', 'entityculling', 'immediatelyfast'] }
PERF.quilt = PERF.fabric; PERF.neoforge = PERF.forge
const q = (v, l) => `game_versions=${encodeURIComponent(JSON.stringify([v]))}&loaders=${encodeURIComponent(JSON.stringify([l]))}`
const NAV = [['browse', 'Browse mods', Search], ['selection', 'My selection', ListChecks], ['packs', 'Saved modpacks', Bookmark], ['favorites', 'Favorites', Heart], ['settings', 'Settings', Settings], ['about', 'About', Info]]
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
function save(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
const safe = (n) => n.replace(/[^A-Za-z0-9._+-]/g, '_').slice(0, 120)
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n)

export default function App() {
  const [versions, setVersions] = useState([])
  const [version, setVersion] = useState(() => load('div.version', ''))
  const [loader, setLoader] = useState(() => load('div.loader', 'fabric'))
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('downloads')
  const [hits, setHits] = useState([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [selected, setSelected] = useState(() => load('div.selected', []))
  const [plan, setPlan] = useState([])
  const [planBusy, setPlanBusy] = useState(false)
  const [dl, setDl] = useState(null)
  const [panel, setPanel] = useState(false)
  const [view, setView] = useState('browse')
  const [favs, setFavs] = useState(() => arr('div.favs').filter((f) => f && f.id && f.title))
  const [packs, setPacks] = useState(() => arr('div.packs').filter((p) => p && p.id && p.name && Array.isArray(p.mods)))
  const [detail, setDetail] = useState(null)
  const [packName, setPackName] = useState('')
  const [note, setNote] = useState('')
  const [updates, setUpdates] = useState({})
  const [pending, setPending] = useState({})
  const [perfBusy, setPerfBusy] = useState(false)
  const abort = useRef(null)
  const cancel = useRef(null)

  useEffect(() => {
    gameVersions().then((v) => { setVersions(v); setVersion((c) => c || v[0]) }).catch((e) => setError(e.message))
  }, [tick])
  useEffect(() => { localStorage.setItem('div.version', JSON.stringify(version)); localStorage.setItem('div.loader', JSON.stringify(loader)) }, [version, loader])
  useEffect(() => { localStorage.setItem('div.selected', JSON.stringify(selected)) }, [selected])

  const runSearch = (offset, append) => {
    if (!version) return
    abort.current?.abort()
    const ac = (abort.current = new AbortController())
    setBusy(true); setError('')
    search({ query, version, loader, sort, offset }, ac.signal)
      .then((r) => { setHits((h) => (append ? [...h, ...r.hits] : r.hits)); setTotal(r.total_hits) })
      .catch((e) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ac.signal.aborted && setBusy(false))
  }
  useEffect(() => { const t = setTimeout(() => runSearch(0, false), 350); return () => clearTimeout(t) }, [query, version, loader, sort, tick])

  useEffect(() => {
    if (!version || !selected.length) { setPlan([]); return }
    let dead = false
    setPlanBusy(true)
    resolve(selected, version, loader).then((p) => !dead && setPlan(p)).catch((e) => !dead && setError(e.message)).finally(() => !dead && setPlanBusy(false))
    return () => { dead = true }
  }, [selected, version, loader])

  const toggle = (h) => setSelected((s) => (s.some((x) => x.id === h.project_id) ? s.filter((x) => x.id !== h.project_id) : [...s, { id: h.project_id, title: h.title }]))
  const broken = plan.filter((p) => p.error)
  const ready = plan.filter((p) => p.file)
  const canExport = ready.length > 0 && !broken.length && !planBusy && !dl?.running

  useEffect(() => { localStorage.setItem('div.favs', JSON.stringify(favs)) }, [favs])
  useEffect(() => { localStorage.setItem('div.packs', JSON.stringify(packs)) }, [packs])
  const toggleFav = (f) => setFavs((a) => (a.some((x) => x.id === f.id) ? a.filter((x) => x.id !== f.id) : [...a, f]))
  const addRemove = (id, title) => setSelected((s) => (s.some((x) => x.id === id) ? s.filter((x) => x.id !== id) : [...s, { id, title }]))
  const savePack = () => { setPacks((p) => [...p, { id: crypto.randomUUID(), name: packName.trim() || `Pack ${p.length + 1}`, version, loader, mods: selected, saved: Date.now(), vers: Object.fromEntries(ready.map((x) => [x.id, { vid: x.version.id, num: x.version.version_number, title: x.title }])) }]); setPackName('') }
  const openPack = (p) => {
    if (selected.length && !confirm('Replace your current selection with this pack?')) return
    setVersion(p.version); setLoader(LOADERS.includes(p.loader) ? p.loader : 'fabric'); setSelected(p.mods.filter((m) => m && m.id)); setView('browse')
  }
  const renamePack = (p) => { const n = prompt('Rename pack', p.name)?.trim(); if (n) setPacks((a) => a.map((x) => (x.id === p.id ? { ...x, name: n } : x))) }
  const dupPack = (p) => setPacks((a) => [...a, { ...p, id: crypto.randomUUID(), name: p.name + ' (copy)' }])
  const delPack = (p) => confirm(`Delete "${p.name}"?`) && setPacks((a) => a.filter((x) => x.id !== p.id))
  const resetAll = () => {
    if (!confirm('Erase saved packs, favorites and selection from this browser?')) return
    Object.keys(localStorage).filter((k) => k.startsWith('div.')).forEach((k) => localStorage.removeItem(k))
    setPacks([]); setFavs([]); setSelected([])
  }

  const applyPack = (d) => {
    if (selected.length && !confirm('Replace your current selection with this pack?')) return
    setVersion(d.v); setLoader(d.l); setSelected(d.m); setView('browse')
  }
  useEffect(() => {
    const m = location.hash.match(/^#pack=(.+)$/)
    if (!m) return
    history.replaceState(null, '', location.pathname)
    try { applyPack(validPack(fromB64(m[1]))) } catch { setNote('That share link is invalid or damaged.') }
  }, [])
  async function copyLink() {
    const url = `${location.origin}${location.pathname}#pack=${toB64({ v: version, l: loader, m: selected })}`
    try { await navigator.clipboard.writeText(url); setNote('Share link copied.') } catch { prompt('Copy this share link:', url) }
  }
  async function importFile(e) {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    setNote('Importing…')
    try {
      let d, extra = ''
      if (f.name.endsWith('.mrpack')) {
        const z = await JSZip.loadAsync(f)
        const entry = z.file('modrinth.index.json')
        if (!entry) throw new Error('modrinth.index.json is missing')
        const idx = JSON.parse(await entry.async('string'))
        const { mods, missing } = await mrpackToMods(idx)
        const dep = idx.dependencies || {}
        const key = [['fabric-loader', 'fabric'], ['quilt-loader', 'quilt'], ['neoforge', 'neoforge'], ['forge', 'forge']].find(([k]) => dep[k])
        d = { v: dep.minecraft, l: key ? key[1] : loader, m: mods }
        if (missing) extra = ` ${missing} file(s) were not found on Modrinth and were skipped.`
      } else {
        const man = JSON.parse(await f.text())
        d = { v: man.minecraft, l: man.loader, m: (man.mods || []).filter((x) => x.reason === 'selected').map((x) => ({ id: x.projectId, title: x.project })) }
      }
      applyPack(validPack(d))
      setNote('Imported ' + d.m.length + ' mods.' + extra)
    } catch (err) { setNote('Import failed: ' + err.message) }
  }

  const slugSet = new Set(plan.map((p) => p.slug).filter(Boolean))
  const conflicts = CONFLICTS.filter(([a, b]) => slugSet.has(a) && slugSet.has(b)).map(([a, b]) => `${plan.find((p) => p.slug === a).title} and ${plan.find((p) => p.slug === b).title}`)
  async function addPerf() {
    setPerfBusy(true); setNote('')
    try {
      const slugs = PERF[loader] || PERF.fabric
      const projs = await j(`/projects?ids=${encodeURIComponent(JSON.stringify(slugs))}`)
      const add = [], skip = []
      for (const p of projs) {
        if (selected.some((s) => s.id === p.id)) continue
        const v = await j(`/project/${p.id}/version?${q(version, loader)}`)
        v.length ? add.push({ id: p.id, title: p.title }) : skip.push(p.title)
      }
      setSelected((s) => [...s, ...add])
      setNote(`Added ${add.length} performance mod(s).` + (skip.length ? ` No ${loader} release for ${version}: ${skip.join(', ')}.` : ''))
    } catch (e) { setNote('Could not add performance mods: ' + e.message) } finally { setPerfBusy(false) }
  }
  async function checkUpdates(p) {
    const set = (m) => setUpdates((u) => ({ ...u, [p.id]: m }))
    if (!p.vers) { set('No version data saved. Re-save this pack to enable update checks.'); return }
    set('Checking…')
    try {
      const out = [], next = { ...p.vers }
      for (const [id, o] of Object.entries(p.vers)) {
        const vs = await j(`/project/${id}/version?${q(p.version, p.loader)}`)
        const latest = vs.find((x) => x.version_type === 'release') || vs[0]
        if (latest && latest.id !== o.vid) { out.push(`${o.title}: ${o.num} → ${latest.version_number}`); next[id] = { vid: latest.id, num: latest.version_number, title: o.title } }
      }
      if (out.length) setPending((x) => ({ ...x, [p.id]: next }))
      set(out.length ? `${out.length} update(s): ${out.join('; ')}` : 'Everything is up to date.')
    } catch (e) { set('Check failed: ' + e.message) }
  }

  const [theme, setTheme] = useState(() => (load('div.theme', 'dark') === 'light' ? 'light' : 'dark'))
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('div.theme', JSON.stringify(theme)) }, [theme])

  function updatePack(p) {
    const next = pending[p.id]
    if (!next) return
    if (selected.length && !confirm('Replace your current selection with the updated pack?')) return
    setPacks((a) => a.map((x) => (x.id === p.id ? { ...x, vers: next } : x)))
    setPending(({ [p.id]: _, ...rest }) => rest)
    setUpdates((u) => ({ ...u, [p.id]: 'Updated. Download from the selection panel to get the new files.' }))
    setVersion(p.version); setLoader(p.loader); setSelected(p.mods.filter((m) => m && m.id)); setView('browse')
  }

  async function exportZip(only) {
    const ac = (cancel.current = new AbortController())
    const zip = new JSZip(), files = [], failed = []
    const list = only || ready
    setDl({ running: true, done: 0, total: list.length, current: '', failed: [] })
    for (const [i, p] of list.entries()) {
      if (ac.signal.aborted) break
      setDl((d) => ({ ...d, current: p.file.filename, done: i }))
      try {
        const r = await fetch(p.file.url, { signal: ac.signal })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const buf = await r.arrayBuffer()
        const want = p.file.hashes?.sha512
        if (want && hex(await crypto.subtle.digest('SHA-512', buf)) !== want) throw new Error('Hash mismatch')
        const name = safe(p.file.filename)
        zip.file('mods/' + name, buf)
        files.push({ project: p.title, projectId: p.id, versionId: p.version.id, url: `https://modrinth.com/mod/${p.slug}`, file: name, verified: !!want, reason: p.root ? 'selected' : 'required by ' + [...p.requiredBy].join(', ') })
      } catch (err) { if (ac.signal.aborted) break; failed.push(p) }
    }
    if (ac.signal.aborted) { setDl({ running: false, cancelled: true, done: files.length, total: list.length, failed: [] }); return }
    setDl((d) => ({ ...d, stage: 'Building ZIP…' }))
    zip.file('manifest.json', JSON.stringify({ app: 'DIV Modpack Builder', exported: new Date().toISOString(), minecraft: version, loader, mods: files, failed: failed.map((p) => p.title) }, null, 2))
    zip.file('README.txt', `DIV Modpack Builder\nMinecraft ${version} / ${loader}\n\nThis archive contains mod JAR files only. It is not a complete Minecraft instance.\nInstall Minecraft and the ${loader} loader, then copy the JARs from mods/ into your profile's mods folder.\nRequired dependencies were resolved from Modrinth metadata; this does not guarantee a crash-free pack.\n`)
    save(await zip.generateAsync({ type: 'blob' }), `div-modpack-${version}-${loader}.zip`)
    setDl({ running: false, done: files.length, total: list.length, failed })
  }

  async function exportMrpack() {
    setDl({ running: true, done: 0, total: 1, stage: 'Looking up loader version…', failed: [] })
    try {
      const [u, key] = LOADER_META[loader]
      const lv = (await (await fetch(u)).json()).find((x) => x.stable !== false)?.version
      if (!lv) throw new Error('Could not find a loader version')
      const zip = new JSZip()
      zip.file('modrinth.index.json', JSON.stringify({
        formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: `DIV Modpack ${version}`,
        dependencies: { minecraft: version, [key]: lv },
        files: ready.map((p) => ({ path: 'mods/' + safe(p.file.filename), hashes: { sha1: p.file.hashes.sha1, sha512: p.file.hashes.sha512 }, env: { client: 'required', server: 'required' }, downloads: [p.file.url], fileSize: p.file.size })),
      }, null, 2))
      save(await zip.generateAsync({ type: 'blob' }), `div-modpack-${version}-${loader}.mrpack`)
      setDl({ running: false, done: 1, total: 1, note: `.mrpack created with ${ready.length} mods and ${key} ${lv}.`, failed: [] })
    } catch (err) {
      setDl({ running: false, done: 0, total: 1, note: '.mrpack export failed: ' + err.message, failed: [] })
    }
  }

  return (
    <div className="app">
      <header>
        <div className="brand"><b>DIV</b> Modpack Builder</div>
        <button className="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Minecraft version">{versions.map((v) => <option key={v}>{v}</option>)}</select>
        <select value={loader} onChange={(e) => setLoader(e.target.value)} aria-label="Mod loader">{LOADERS.map((l) => <option key={l}>{l}</option>)}</select>
        <button className="ghost mobile" onClick={() => setPanel(!panel)}>Selection ({selected.length})</button>
      </header>
      <main>
        <nav className="side" aria-label="Main">
          {NAV.map(([id, label, Icon]) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => (id === 'selection' ? setPanel(true) : setView(id))}><Icon size={16} /> {label}</button>
          ))}
        </nav>
        <section className="browse" hidden={view !== 'browse'}>
          <h1 className="title">Mods for Minecraft {version} <span>{loader}</span></h1>
          <div className="bar">
            <label className="search"><Search size={16} /><input placeholder="Search mods" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          {error && <div className="err"><AlertTriangle size={16} /> {error} <button onClick={() => setTick((t) => t + 1)}>Retry</button></div>}
          {!busy && !error && !hits.length && <p className="empty">No mods found for Minecraft {version} on {loader}. Try another search, version or loader.</p>}
          <div className="grid">
            {hits.map((h) => {
              const on = selected.some((x) => x.id === h.project_id)
              return (
                <article key={h.project_id} className="card">
                  <img src={h.icon_url || ''} alt="" width="48" height="48" />
                  <div className="body">
                    <h3>{h.title}</h3>
                    <p>{h.description}</p>
                    <small>by {h.author} · {fmt(h.downloads)} downloads · {h.display_categories?.join(', ')}</small>
                    <div className="row">
                      <button className={on ? 'on' : 'primary'} onClick={() => toggle(h)}>{on ? <><Check size={14} /> Added</> : <><Plus size={14} /> Add</>}</button>
                      <button onClick={() => setDetail({ id: h.project_id, title: h.title })}>Details</button>
                      <button className={'icon' + (favs.some((f) => f.id === h.project_id) ? ' on' : '')} aria-label="Favorite" onClick={() => toggleFav({ id: h.project_id, title: h.title, icon: h.icon_url, slug: h.slug })}><Heart size={14} /></button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {busy && <p className="empty"><Loader2 className="spin" size={16} /> Loading…</p>}
          {!busy && hits.length < total && <button className="more" onClick={() => runSearch(hits.length, true)}>Load more ({total - hits.length} left)</button>}
        </section>
        {view === 'favorites' && (
          <section className="browse">
            <h2>Favorites ({favs.length})</h2>
            {!favs.length && <p className="empty">Tap the heart on any mod to keep it here.</p>}
            <div className="grid">
              {favs.map((f) => {
                const on = selected.some((x) => x.id === f.id)
                return (
                  <article key={f.id} className="card">
                    <img src={f.icon || ''} alt="" width="48" height="48" />
                    <div className="body"><h3>{f.title}</h3>
                      <div className="row">
                        <button className={on ? 'on' : 'primary'} onClick={() => addRemove(f.id, f.title)}>{on ? 'Added' : 'Add'}</button>
                        <button onClick={() => setDetail({ id: f.id, title: f.title })}>Details</button>
                        <button className="icon" aria-label="Remove favorite" onClick={() => toggleFav(f)}><Trash2 size={14} /></button>
                      </div></div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        {view === 'packs' && (
          <section className="browse">
            <h2>Saved modpacks</h2>
            <div className="bar">
              <input style={{ flex: 1 }} placeholder="Name this pack" value={packName} onChange={(e) => setPackName(e.target.value)} />
              <button className="primary" disabled={!selected.length} onClick={savePack}>Save current selection</button>
            </div>
            {!packs.length && <p className="empty">No saved packs yet. Pick some mods, name the pack and save it.</p>}
            <ul>
              {packs.map((p) => (
                <li key={p.id}>
                  <div><b>{p.name}</b><small>{p.mods.length} mods · Minecraft {p.version} · {p.loader}</small>{updates[p.id] && <small>{updates[p.id]}</small>}</div>
                  <div className="row">
                    <button onClick={() => checkUpdates(p)}>Check updates</button>{pending[p.id] && <button className="primary" onClick={() => updatePack(p)}>Update pack</button>}<button onClick={() => openPack(p)}>Open</button><button onClick={() => renamePack(p)}>Rename</button>
                    <button onClick={() => dupPack(p)}>Duplicate</button><button className="icon" aria-label="Delete pack" onClick={() => delPack(p)}><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="filebtn">Import .mrpack or manifest.json<input type="file" accept=".mrpack,.json" hidden onChange={importFile} /></label>
            <button className="ghost wide" onClick={resetAll}>Reset all local data</button>
          </section>
        )}
        {view === 'settings' && (
          <section className="browse">
            <h2>Settings</h2>
            <p>Theme</p>
            <div className="row">
              {['dark', 'light'].map((m) => <button key={m} className={theme === m ? 'on' : ''} onClick={() => setTheme(m)}>{m === 'dark' ? 'Dark' : 'Light'}</button>)}
            </div>
            <p>Your selection, favorites, saved packs and theme are stored only in this browser.</p>
            <button className="ghost" onClick={resetAll}>Reset all local data</button>
          </section>
        )}
        {view === 'about' && (
          <section className="browse">
            <h2>About DIV Modpack Builder</h2>
            <p>Search Modrinth mods, pick a Minecraft version and loader, and download your selection with its required dependencies as one ZIP or .mrpack.</p>
            <p>All mod data and files come from the Modrinth API. This is an unofficial tool and is not affiliated with Modrinth, Mojang or Microsoft.</p>
            <p>The ZIP contains mod JAR files only, not a full Minecraft instance. Install Minecraft and the matching loader separately, then place the JARs in your profile's mods folder.</p>
            <p>Dependency resolution and the known-conflict warnings reduce problems but cannot guarantee a crash-free pack.</p>
          </section>
        )}
        <aside className={panel ? 'open' : ''}>
          <button className="ghost mobile" onClick={() => setPanel(false)}>Close</button>
          <h2>My selection ({selected.length})</h2>
          <button className="ghost wide" disabled={perfBusy} onClick={addPerf}>{perfBusy ? 'Adding…' : 'Add performance mods'}</button>
          {planBusy && <p><Loader2 className="spin" size={14} /> Resolving dependencies…</p>}
          <ul>
            {plan.map((p) => (
              <li key={p.id} className={p.error ? 'bad' : ''}>
                <div><b>{p.title}</b>
                  <small>{p.error ? p.error : p.root ? p.file?.filename : 'Dependency of ' + [...p.requiredBy].join(', ')}</small></div>
                {p.root && <button className="icon" aria-label={`Remove ${p.title}`} onClick={() => setSelected((s) => s.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button>}
              </li>
            ))}
          </ul>
          {!selected.length && <p className="empty">Add mods to start your pack.</p>}
          {plan.optional?.some((o) => !selected.some((s) => s.id === o.id)) && (
            <div className="opt">
              <small>Optional dependencies (not included unless you add them)</small>
              {plan.optional.filter((o) => !selected.some((s) => s.id === o.id)).map((o) => (
                <div key={o.id} className="row"><span>{o.title}</span><button onClick={() => setSelected((s) => [...s, o])}><Plus size={12} /> Add</button></div>
              ))}
            </div>
          )}
          <div className={'status ' + (broken.length ? 'bad' : ready.length ? 'ok' : '')}>
            {broken.length ? `Incompatible: ${broken.length} mod(s) have no release for ${version} on ${loader}. Remove them or change version/loader.` : ready.length ? 'All required dependencies resolved from Modrinth. Mod-to-mod conflicts are not checked.' : 'Nothing to check yet.'}
          </div>
          {conflicts.map((c) => <div key={c} className="status warn">{c}: commonly reported as incompatible. Remove one unless you have verified they work together.</div>)}
          <p className="small">{ready.length} files · {(ready.reduce((n, p) => n + (p.file.size || 0), 0) / 1048576).toFixed(1)} MB</p>
          {dl && (
            <div className="dl">
              <progress value={dl.done} max={dl.total || 1} />
              <small>{dl.running ? `${dl.stage || dl.current} (${dl.done}/${dl.total})` : dl.note || `${dl.cancelled ? 'Cancelled. ' : ''}${dl.done}/${dl.total} downloaded`}</small>
              {!!dl.failed?.length && <div className="err">Failed: {dl.failed.map((f) => f.title).join(', ')} <button onClick={() => exportZip(dl.failed)}>Retry failed</button></div>}
            </div>
          )}
          {dl?.running ? (
            <button className="wide" onClick={() => cancel.current?.abort()}>Cancel download</button>
          ) : (
            <>
              <button className="primary wide" disabled={!canExport} onClick={() => exportZip()}><Download size={16} /> Download ZIP</button>
              <button className="wide" disabled={!canExport || !LOADER_META[loader]} onClick={exportMrpack}>Export .mrpack</button>
              {!LOADER_META[loader] && <small>.mrpack export supports Fabric and Quilt for now.</small>}
            </>
          )}
          {!!selected.length && <button className="ghost wide" onClick={() => confirm('Clear all selected mods?') && setSelected([])}>Clear selection</button>}
          {!!selected.length && <button className="ghost wide" onClick={copyLink}>Copy share link</button>}
          {note && <p className="small" role="status">{note}</p>}
        </aside>
      </main>
      {detail && <Details item={detail} version={version} loader={loader} onClose={() => setDetail(null)} />}
    </div>
  )
}
