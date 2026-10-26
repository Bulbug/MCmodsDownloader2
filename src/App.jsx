import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Search, Package, Download, Trash2, Plus, Check, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { gameVersions, search, resolve } from './api.js'

const LOADERS = ['fabric', 'forge', 'neoforge', 'quilt']
const SORTS = [['relevance', 'Relevance'], ['downloads', 'Downloads'], ['follows', 'Follows'], ['updated', 'Recently updated']]
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }
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
  const abort = useRef(null)

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

  async function exportZip(only) {
    const zip = new JSZip(), files = [], failed = []
    const list = only || ready
    setDl({ running: true, done: 0, total: list.length, current: '', failed: [] })
    for (const [i, p] of list.entries()) {
      setDl((d) => ({ ...d, current: p.file.filename, done: i }))
      try {
        const r = await fetch(p.file.url)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const name = safe(p.file.filename)
        zip.file('mods/' + name, await r.blob())
        files.push({ project: p.title, projectId: p.id, versionId: p.version.id, url: `https://modrinth.com/mod/${p.slug}`, file: name, reason: p.root ? 'selected' : 'required by ' + [...p.requiredBy].join(', ') })
      } catch (e) { failed.push(p) }
    }
    setDl((d) => ({ ...d, stage: 'Building ZIP…' }))
    zip.file('manifest.json', JSON.stringify({ app: 'DIV Modpack Builder', exported: new Date().toISOString(), minecraft: version, loader, mods: files, failed: failed.map((p) => p.title) }, null, 2))
    zip.file('README.txt', `DIV Modpack Builder\nMinecraft ${version} / ${loader}\n\nThis archive contains mod JAR files only. It is not a complete Minecraft instance.\nInstall Minecraft and the ${loader} loader, then copy the JARs from mods/ into your profile's mods folder.\nRequired dependencies were resolved from Modrinth metadata; this does not guarantee a crash-free pack.\n`)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `div-modpack-${version}-${loader}.zip`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    setDl({ running: false, done: files.length, total: list.length, failed })
  }

  return (
    <div className="app">
      <header>
        <div className="brand"><Package size={22} /> DIV Modpack Builder</div>
        <select value={version} onChange={(e) => setVersion(e.target.value)} aria-label="Minecraft version">{versions.map((v) => <option key={v}>{v}</option>)}</select>
        <select value={loader} onChange={(e) => setLoader(e.target.value)} aria-label="Mod loader">{LOADERS.map((l) => <option key={l}>{l}</option>)}</select>
        <button className="ghost mobile" onClick={() => setPanel(!panel)}>Selection ({selected.length})</button>
      </header>
      <main>
        <section className="browse">
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
                      <a href={`https://modrinth.com/mod/${h.slug}`} target="_blank" rel="noreferrer">Details <ExternalLink size={12} /></a>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {busy && <p className="empty"><Loader2 className="spin" size={16} /> Loading…</p>}
          {!busy && hits.length < total && <button className="more" onClick={() => runSearch(hits.length, true)}>Load more ({total - hits.length} left)</button>}
        </section>
        <aside className={panel ? 'open' : ''}>
          <h2>My selection ({selected.length})</h2>
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
          <div className={'status ' + (broken.length ? 'bad' : ready.length ? 'ok' : '')}>
            {broken.length ? `Incompatible: ${broken.length} mod(s) have no release for ${version} on ${loader}. Remove them or change version/loader.` : ready.length ? 'All required dependencies resolved from Modrinth. Mod-to-mod conflicts are not checked.' : 'Nothing to check yet.'}
          </div>
          <p className="small">{ready.length} files · {(ready.reduce((n, p) => n + (p.file.size || 0), 0) / 1048576).toFixed(1)} MB</p>
          {dl && (
            <div className="dl">
              <progress value={dl.done} max={dl.total || 1} />
              <small>{dl.running ? `${dl.stage || dl.current} (${dl.done}/${dl.total})` : `${dl.done}/${dl.total} downloaded`}</small>
              {!!dl.failed?.length && <div className="err">Failed: {dl.failed.map((f) => f.title).join(', ')} <button onClick={() => exportZip(dl.failed)}>Retry failed</button></div>}
            </div>
          )}
          <button className="primary wide" disabled={!canExport} onClick={() => exportZip()}><Download size={16} /> Download ZIP</button>
          {!!selected.length && <button className="ghost wide" onClick={() => confirm('Clear all selected mods?') && setSelected([])}>Clear selection</button>}
        </aside>
      </main>
    </div>
  )
}
