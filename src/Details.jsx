import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { j } from './api.js'
const enc = (a) => encodeURIComponent(JSON.stringify(a))
const clean = (s = '') => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '').replace(/[#*_`>]/g, '').replace(/\n{3,}/g, '\n\n').trim()

export default function Details({ item, version, loader, onClose }) {
  const [p, setP] = useState(null)
  const [vers, setVers] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    Promise.all([j(`/project/${item.id}`), j(`/project/${item.id}/version?game_versions=${enc([version])}&loaders=${enc([loader])}`)])
      .then(([a, b]) => { if (!dead) { setP(a); setVers(b) } })
      .catch((e) => !dead && setErr(e.message))
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => { dead = true; window.removeEventListener('keydown', k) }
  }, [item.id, version, loader])
  return (
    <div className="modal" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <button className="icon close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        <h2>{item.title}</h2>
        {err && <div className="err">{err}</div>}
        {!p && !err && <p className="empty">Loading…</p>}
        {p && (
          <>
            <p>{p.description}</p>
            <div className={'status ' + (vers.length ? 'ok' : 'bad')}>
              {vers.length ? `${vers.length} release(s) for Minecraft ${version} on ${loader}.` : `No ${loader} release for Minecraft ${version}.`}
            </div>
            <p className="small">License: {p.license?.name || p.license?.id || 'not listed'} · Loaders: {p.loaders.join(', ')} · Categories: {p.categories.join(', ') || 'none'}</p>
            <a href={`https://modrinth.com/mod/${p.slug}`} target="_blank" rel="noreferrer">Open on Modrinth <ExternalLink size={12} /></a>
            <h3>About</h3>
            <p className="pre">{clean(p.body).slice(0, 1500)}{p.body.length > 1500 ? '…' : ''}</p>
            <h3>Releases for your settings</h3>
            {vers.slice(0, 5).map((v) => (
              <div key={v.id} className="rel">
                <b>{v.version_number}</b> <small>{v.version_type} · {new Date(v.date_published).toLocaleDateString()} · {v.game_versions.slice(-3).join(', ')}</small>
                {v.changelog && <p className="pre small">{clean(v.changelog).slice(0, 400)}</p>}
              </div>
            ))}
            {!vers.length && <p className="empty">Change the version or loader to see releases.</p>}
          </>
        )}
      </div>
    </div>
  )
}
