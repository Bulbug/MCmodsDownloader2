import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  Search, Download, PackagePlus, Package, SlidersHorizontal, X,
  Check, Plus, LoaderCircle, Boxes, AlertTriangle, ExternalLink,
  ShieldCheck, Trash2, ChevronDown, Sparkles, Info, RefreshCw,
  Eye, Link2, AlertCircle, CheckCircle2, FileArchive, Zap
} from "lucide-react";

const API = "https://api.modrinth.com/v2";
const GAME_VERSIONS = [
  "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.1", "1.19.4",
  "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9"
];
const LOADERS = [
  { value: "fabric", label: "Fabric" },
  { value: "forge", label: "Forge" },
  { value: "quilt", label: "Quilt" },
  { value: "neoforge", label: "NeoForge" }
];

async function apiGet(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { "User-Agent": "DIVModpackBuilder/1.1.0 (web app)" }
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Modrinth API returned ${response.status}${message ? `: ${message.slice(0, 120)}` : ""}`);
  }
  return response.json();
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}
function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function cleanFilename(name) {
  return (name || "mod.jar").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}
function pickFile(version) {
  return version?.files?.find((file) => file.primary) || version?.files?.[0] || null;
}
function isJar(file) {
  return Boolean(file?.filename?.toLowerCase().endsWith(".jar"));
}
function versionSupports(version, gameVersion, loader) {
  return Boolean(
    version?.status === "listed" &&
    version.game_versions?.includes(gameVersion) &&
    version.loaders?.includes(loader) &&
    pickFile(version) &&
    isJar(pickFile(version))
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [gameVersion, setGameVersion] = useState("1.20.1");
  const [loader, setLoader] = useState("fabric");
  const [sort, setSort] = useState("relevance");
  const [results, setResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState([]);
  const [versionsByProject, setVersionsByProject] = useState({});
  const [loadingProject, setLoadingProject] = useState("");
  const [downloadState, setDownloadState] = useState({ busy: false, message: "", error: false, current: 0, total: 0 });
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [showSelected, setShowSelected] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [resolvedPreview, setResolvedPreview] = useState(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [compatibility, setCompatibility] = useState(null);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.project_id)), [selected]);
  const selectedSize = useMemo(() => selected.reduce((sum, item) => sum + (item.file?.size || 0), 0), [selected]);

  async function searchMods(term = query) {
    setLoadingSearch(true);
    setSearchError("");
    setSearchText(term.trim());
    try {
      const facets = [["project_type:mod"], [`versions:${gameVersion}`], [`categories:${loader}`]];
      const params = new URLSearchParams({
        query: term.trim(), facets: JSON.stringify(facets), index: sort, limit: "24"
      });
      const data = await apiGet(`/search?${params.toString()}`);
      setResults(data.hits || []);
    } catch (error) {
      setSearchError(`${error.message}. Check your connection and try again.`);
      setResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }

  useEffect(() => {
    searchMods("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameVersion, loader, sort]);

  async function getCompatibleVersions(projectId) {
    const cacheKey = `${projectId}:${gameVersion}:${loader}`;
    if (versionsByProject[cacheKey]) return versionsByProject[cacheKey];
    const params = new URLSearchParams({ game_versions: JSON.stringify([gameVersion]), loaders: JSON.stringify([loader]) });
    const versions = await apiGet(`/project/${projectId}/version?${params.toString()}&include_changelog=false`);
    setVersionsByProject((previous) => ({ ...previous, [cacheKey]: versions }));
    return versions;
  }

  async function addMod(project) {
    if (selectedIds.has(project.project_id)) return;
    setLoadingProject(project.project_id);
    setSearchError("");
    try {
      const versions = await getCompatibleVersions(project.project_id);
      const usable = versions.find((version) => versionSupports(version, gameVersion, loader));
      if (!usable) {
        setSearchError(`No compatible JAR version was found for ${project.title}.`);
        return;
      }
      const file = pickFile(usable);
      setSelected((current) => current.some((item) => item.project_id === project.project_id) ? current : [
        ...current,
        {
          project_id: project.project_id, title: project.title, slug: project.slug,
          icon_url: project.icon_url, description: project.description, author: project.author,
          downloads: project.downloads, version: usable, file, dependency: false,
          project_url: `https://modrinth.com/mod/${project.slug || project.project_id}`
        }
      ]);
      setCompatibility(null);
      setResolvedPreview(null);
    } catch (error) {
      setSearchError(`Couldn't load a compatible version for ${project.title}: ${error.message}`);
    } finally {
      setLoadingProject("");
    }
  }

  function removeMod(projectId) {
    setSelected((current) => current.filter((item) => item.project_id !== projectId));
    setCompatibility(null);
    setResolvedPreview(null);
  }

  async function resolveDependencies(initialItems) {
    const resolved = [...initialItems];
    const resolvedIds = new Set(resolved.map((item) => item.project_id));
    const checkedVersionIds = new Set();
    let cursor = 0;

    while (cursor < resolved.length) {
      if (resolved.length > 100) throw new Error("Dependency resolution stopped at 100 mods to prevent runaway downloads.");
      const parent = resolved[cursor++];
      if (!parent.version?.dependencies) continue;

      for (const dependency of parent.version.dependencies) {
        if (dependency.dependency_type !== "required") continue;
        if (dependency.project_id && resolvedIds.has(dependency.project_id)) continue;
        if (dependency.version_id && checkedVersionIds.has(dependency.version_id)) continue;

        let dependencyVersion = null;
        let projectId = dependency.project_id || null;
        if (dependency.version_id) {
          checkedVersionIds.add(dependency.version_id);
          try {
            dependencyVersion = await apiGet(`/version/${dependency.version_id}`);
            projectId = dependencyVersion.project_id || projectId;
          } catch { dependencyVersion = null; }
        }

        if (!dependencyVersion && projectId) {
          const versions = await getCompatibleVersions(projectId);
          dependencyVersion = versions.find((version) => versionSupports(version, gameVersion, loader));
        }

        if (!dependencyVersion) {
          const name = dependency.project_id || dependency.file_name || "unknown dependency";
          throw new Error(`Could not find a compatible required dependency (${name}). Try another Minecraft version or loader.`);
        }

        const dependencyFile = pickFile(dependencyVersion);
        if (!dependencyFile || !isJar(dependencyFile)) {
          throw new Error(`Required dependency ${dependencyVersion.name || dependencyVersion.id} does not provide a JAR file.`);
        }

        let title = dependency.file_name?.replace(/\.jar$/i, "") || dependencyVersion.name || "Required dependency";
        let slug = projectId;
        let icon_url = "";
        let description = "Required dependency for another selected mod.";
        if (projectId) {
          try {
            const project = await apiGet(`/project/${projectId}`);
            title = project.title || title;
            slug = project.slug || slug;
            icon_url = project.icon_url || "";
            description = project.description || description;
          } catch { /* Keep version metadata when project metadata is unavailable. */ }
        }

        if (projectId && resolvedIds.has(projectId)) continue;
        if (projectId) resolvedIds.add(projectId);

        resolved.push({
          project_id: projectId || dependencyVersion.id, title, slug, icon_url, description,
          version: dependencyVersion, file: dependencyFile, dependency: true,
          project_url: projectId ? `https://modrinth.com/mod/${slug || projectId}` : "https://modrinth.com"
        });
      }
    }
    return resolved;
  }

  async function checkCompatibility() {
    if (!selected.length || checkingDependencies) return;
    setCheckingDependencies(true);
    setSearchError("");
    try {
      const resolved = includeDependencies ? await resolveDependencies(selected) : selected;
      const invalid = resolved.filter((item) => !versionSupports(item.version, gameVersion, loader));
      if (invalid.length) {
        setCompatibility({ ok: false, resolved, invalid });
        setResolvedPreview(null);
      } else {
        setCompatibility({ ok: true, resolved, invalid: [] });
        setResolvedPreview(resolved);
      }
    } catch (error) {
      setCompatibility({ ok: false, resolved: selected, invalid: [] });
      setResolvedPreview(null);
      setSearchError(`Compatibility check failed: ${error.message}`);
    } finally {
      setCheckingDependencies(false);
    }
  }

  async function openDetails(project) {
    setDetailProject(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await apiGet(`/project/${project.project_id}`);
      const versions = await getCompatibleVersions(project.project_id);
      const compatible = versions.filter((version) => versionSupports(version, gameVersion, loader));
      setDetailProject({ ...data, compatibleVersions: compatible });
    } catch (error) {
      setDetailError(error.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function downloadZip() {
    if (!selected.length || downloadState.busy) return;
    setDownloadState({ busy: true, message: "Checking compatibility…", error: false, current: 0, total: 0 });
    try {
      let items = includeDependencies ? await resolveDependencies(selected) : [...selected];
      const invalid = items.filter((item) => !versionSupports(item.version, gameVersion, loader));
      if (invalid.length) throw new Error(`${invalid.length} mod${invalid.length === 1 ? " is" : "s are"} not compatible with ${gameVersion} / ${loader}.`);

      const zip = new JSZip();
      const modsFolder = zip.folder("mods");
      const usedNames = new Set();
      const manifestMods = [];
      let completed = 0;

      setDownloadState({ busy: true, message: `Preparing ${items.length} mod${items.length === 1 ? "" : "s"}…`, error: false, current: 0, total: items.length });

      for (const item of items) {
        setDownloadState({ busy: true, message: `Downloading ${completed + 1} of ${items.length}: ${item.title}`, error: false, current: completed, total: items.length });
        if (!item.file?.url || !isJar(item.file)) throw new Error(`${item.title} does not have a downloadable JAR file.`);
        const response = await fetch(item.file.url);
        if (!response.ok) throw new Error(`Download failed for ${item.title} (${response.status}). The file host may block browser downloads.`);
        const blob = await response.blob();
        if (blob.size === 0) throw new Error(`The downloaded file for ${item.title} was empty.`);
        let filename = cleanFilename(item.file.filename);
        const base = filename.replace(/\.jar$/i, "");
        let suffix = 2;
        while (usedNames.has(filename.toLowerCase())) filename = `${base}-${suffix++}.jar`;
        usedNames.add(filename.toLowerCase());
        modsFolder.file(filename, blob);
        manifestMods.push({
          project_id: item.project_id, title: item.title, version_id: item.version.id,
          version_number: item.version.version_number, filename, download_url: item.file.url,
          dependency: item.dependency
        });
        completed += 1;
        setDownloadState({ busy: true, message: `Downloaded ${completed} of ${items.length}: ${item.title}`, error: false, current: completed, total: items.length });
      }

      zip.file("manifest.json", JSON.stringify({
        name: "DIV Modpack Builder export", minecraft_version: gameVersion, loader,
        created_at: new Date().toISOString(), source: "Modrinth",
        note: "Extract the JAR files from the mods folder into the mods folder of a matching Minecraft profile. Install the matching loader separately.",
        mods: manifestMods
      }, null, 2));
      setDownloadState({ busy: true, message: "Creating ZIP archive…", error: false, current: items.length, total: items.length });
      const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `div-mods-${gameVersion}-${loader}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResolvedPreview(items);
      setCompatibility({ ok: true, resolved: items, invalid: [] });
      setDownloadState({ busy: false, message: `ZIP created with ${items.length} mod${items.length === 1 ? "" : "s"}.`, error: false, current: items.length, total: items.length });
    } catch (error) {
      setDownloadState((current) => ({ ...current, busy: false, message: error.message || "ZIP creation failed.", error: true }));
    }
  }

  const previewSize = (resolvedPreview || selected).reduce((sum, item) => sum + (item.file?.size || 0), 0);
  const displayItems = showSelected ? selected : results;
  const activeCompatibility = compatibility?.ok ? "Ready" : selected.length ? "Not checked" : "Waiting";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="DIV Modpack Builder home">
          <div className="brand-mark"><Boxes size={22} /></div>
          <div><strong>DIV<span>MODS</span></strong><small>MODPACK BUILDER</small></div>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${!showSelected ? "active" : ""}`} onClick={() => setShowSelected(false)}><Search size={17} /> Discover mods</button>
        <button className={`nav-item ${showSelected ? "active" : ""}`} onClick={() => setShowSelected(true)}><Package size={17} /> Your selection <span className="nav-count">{selected.length}</span></button>
        <div className="sidebar-bottom">
          <div className="side-tip"><Sparkles size={17} /><strong>Phase 1 core tools</strong><p>Search, inspect, verify dependencies, and export a reliable modpack.</p></div>
          <a className="modrinth-link" href="https://modrinth.com" target="_blank" rel="noreferrer"><span className="modrinth-dot" /> Powered by Modrinth <ExternalLink size={13} /></a>
          <div className="version-label">DIV Modpack Builder · v1.1</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{showSelected ? "Your selection" : "Discover mods"}</strong></div>
          <div className="topbar-right"><span className="status-dot" /> Modrinth API <span className="top-divider" /><span className="profile-mark">D</span></div>
        </header>

        <div className="page-wrap">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><span className="eyebrow-dot" /> PHASE 1 · RELIABLE CORE</div>
              <h1>Build your perfect<br /><span>modpack.</span></h1>
              <p>Find compatible mods, inspect releases, resolve required dependencies, verify your pack, and export everything in one ZIP.</p>
              <div className="hero-badges"><span><ShieldCheck size={14} /> Compatibility checks</span><span><FileArchive size={14} /> Dependency-aware ZIP</span></div>
            </div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="cube cube-back"><Boxes size={38} /></div><div className="cube cube-front"><Package size={55} /></div><div className="art-tag"><Zap size={14} /> READY WHEN YOU ARE</div></div>
          </section>

          <section className="filter-panel">
            <div className="filter-heading"><div><SlidersHorizontal size={17} /><strong>Configure your setup</strong></div><span>Changing these clears your current selection</span></div>
            <div className="filter-grid">
              <label className="field"><span>MINECRAFT VERSION</span><div className="select-wrap"><select value={gameVersion} onChange={(e) => { setGameVersion(e.target.value); setSelected([]); setVersionsByProject({}); setCompatibility(null); setResolvedPreview(null); }}><option value="1.8.9">Minecraft 1.8.9</option>{GAME_VERSIONS.filter(v => v !== "1.8.9").map(v => <option key={v} value={v}>Minecraft {v}</option>)}</select><ChevronDown size={15} /></div></label>
              <label className="field"><span>MOD LOADER</span><div className="select-wrap"><select value={loader} onChange={(e) => { setLoader(e.target.value); setSelected([]); setVersionsByProject({}); setCompatibility(null); setResolvedPreview(null); }}><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="quilt">Quilt</option><option value="neoforge">NeoForge</option></select><ChevronDown size={15} /></div></label>
              <label className="field"><span>SORT BY</span><div className="select-wrap"><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="relevance">Relevance</option><option value="downloads">Most downloaded</option><option value="updated">Recently updated</option><option value="newest">Newest</option></select><ChevronDown size={15} /></div></label>
            </div>
          </section>

          <div className="section-heading"><div><div className="section-kicker">{showSelected ? "YOUR COLLECTION" : "MODRINTH DISCOVERY"}</div><h2>{showSelected ? "Your selected mods" : "Find your next favorite"}</h2><p>{showSelected ? `${selected.length} mod${selected.length === 1 ? "" : "s"} in your collection` : searchText ? `Search results for “${searchText}”` : "Explore community-made mods for your Minecraft version."}</p></div><div className="result-pill"><span /> {showSelected ? `${selected.length} selected` : `${results.length} results`}</div></div>

          {!showSelected && <form className="search-bar" onSubmit={(e) => { e.preventDefault(); searchMods(query); }}><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mods, e.g. Sodium, minimap, performance..." aria-label="Search mods" />{query && <button type="button" className="clear-search" onClick={() => { setQuery(""); searchMods(""); }} aria-label="Clear search"><X size={16} /></button>}<button className="search-button" type="submit" disabled={loadingSearch}>{loadingSearch ? <LoaderCircle size={17} className="spin" /> : "Search mods"}</button></form>}

          {searchError && <div className="notice error-notice"><AlertTriangle size={17} /><span>{searchError}</span><button onClick={() => setSearchError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {downloadState.message && <div className={`notice ${downloadState.error ? "error-notice" : "success-notice"}`}><Info size={17} /><span>{downloadState.message}</span>{!downloadState.busy && <button onClick={() => setDownloadState({ busy: false, message: "", error: false, current: 0, total: 0 })} aria-label="Dismiss message"><X size={16} /></button>}</div>}
          {downloadState.busy && downloadState.total > 0 && <div className="progress-wrap"><div className="progress-head"><span>Build progress</span><b>{Math.round((downloadState.current / downloadState.total) * 100)}%</b></div><div className="progress-track"><div style={{ width: `${(downloadState.current / downloadState.total) * 100}%` }} /></div></div>}

          {!showSelected && <div className="active-filters"><span>Filtered for</span><b>{gameVersion}</b><b>{loader}</b><span className="filter-note"><ShieldCheck size={13} /> Compatible versions only</span></div>}

          {loadingSearch && !showSelected ? <div className="loading-state"><LoaderCircle size={28} className="spin" /><strong>Finding your next favorite mods…</strong><span>Checking Modrinth for compatible projects.</span></div> :
            <div className="mod-grid">
              {displayItems.map((item) => {
                const isSelected = selectedIds.has(item.project_id);
                const isLoading = loadingProject === item.project_id;
                return <article className="mod-card" key={item.project_id}>
                  <div className="card-top"><div className="mod-icon">{item.icon_url ? <img src={item.icon_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Boxes size={24} />}</div><div className="mod-meta"><span className="mod-author">{item.author || (item.dependency ? "Required dependency" : "Modrinth creator")}</span><button className="external-link" onClick={() => openDetails(item)} aria-label={`View details for ${item.title}`}><Eye size={14} /></button></div></div>
                  <h3>{item.title}</h3><p className="mod-description">{item.description || item.version?.name || "Community mod for Minecraft."}</p>
                  <div className="card-tags"><span>{loader}</span>{item.dependency && <span className="dependency-tag">Dependency</span>}{!item.dependency && <span>{formatNumber(item.downloads)} downloads</span>}</div>
                  <div className="card-footer"><span className="version-text">{item.version?.version_number ? `v${item.version.version_number}` : "Compatible release"}</span>{showSelected ? <button className="add-button remove-button" onClick={() => removeMod(item.project_id)}><Trash2 size={15} /> Remove</button> : <div className="card-actions"><button className="details-button" onClick={() => openDetails(item)}><Eye size={14} /> Details</button><button className={`add-button ${isSelected ? "added" : ""}`} onClick={() => isSelected ? removeMod(item.project_id) : addMod(item)} disabled={isLoading}>{isLoading ? <LoaderCircle size={15} className="spin" /> : isSelected ? <Check size={15} /> : <Plus size={16} />}{isLoading ? "Checking…" : isSelected ? "Added" : "Add"}</button></div>}</div>
                </article>;
              })}
            </div>}

          {!loadingSearch && !showSelected && results.length === 0 && !searchError && <div className="empty-state"><div className="empty-icon"><Search size={25} /></div><h3>No mods found</h3><p>Try another search term or change your Minecraft version or loader.</p><button className="secondary-button" onClick={() => { setQuery(""); searchMods(""); }}>Browse popular mods</button></div>}
          {!loadingSearch && showSelected && selected.length === 0 && <div className="empty-state"><div className="empty-icon"><PackagePlus size={25} /></div><h3>Your collection is empty</h3><p>Head to Discover mods and add the mods you want in your ZIP.</p><button className="secondary-button" onClick={() => setShowSelected(false)}>Discover mods</button></div>}

          <footer className="page-footer"><span>Made for players who love to customize.</span><span>Not affiliated with Mojang or Modrinth.</span></footer>
        </div>
      </main>

      <aside className="pack-sidebar">
        <div className="pack-title-row"><div><div className="section-kicker">YOUR WORKSPACE</div><h2>Modpack summary</h2></div><div className="pack-icon"><Package size={20} /></div></div>
        <div className="pack-preview"><div className="pack-preview-icon"><Boxes size={32} /></div><div><strong>My Minecraft Pack</strong><span>{gameVersion} · {loader}</span></div><span className="live-dot" /></div>
        <div className="stats-row"><div className="stat-box"><span>SELECTED MODS</span><strong>{selected.length}</strong></div><div className="stat-box"><span>EST. SIZE</span><strong>{formatBytes(selectedSize)}</strong></div></div>

        <div className={`compat-box ${compatibility?.ok ? "is-good" : compatibility ? "is-bad" : ""}`}>
          <div className="compat-title"><span><ShieldCheck size={16} /> Compatibility</span><b>{activeCompatibility}</b></div>
          {compatibility?.ok ? <div className="compat-lines"><span><CheckCircle2 size={13} /> {compatibility.resolved.length} compatible mod{compatibility.resolved.length === 1 ? "" : "s"}</span><span><CheckCircle2 size={13} /> {gameVersion} · {loader}</span>{includeDependencies && <span><CheckCircle2 size={13} /> Required dependencies resolved</span>}</div> : <p>Run a check before exporting to verify your selected mods and dependencies.</p>}
        </div>

        <div className="pack-list-heading"><strong>Included mods</strong><span>{selected.length}/∞</span></div>
        <div className="pack-list">{selected.length === 0 ? <div className="pack-empty"><div><PackagePlus size={22} /></div><strong>Nothing here yet</strong><p>Your selected mods will appear here. Add a few to get started.</p></div> : selected.map((item) => <div className="pack-item" key={item.project_id}><div className="mini-icon">{item.icon_url ? <img src={item.icon_url} alt="" /> : <Boxes size={17} />}</div><div className="pack-item-text"><strong>{item.title}</strong><span>{item.version?.version_number || "Compatible version"}{item.dependency ? " · Dependency" : ""}</span></div><button onClick={() => removeMod(item.project_id)} aria-label={`Remove ${item.title}`}><X size={15} /></button></div>)}</div>

        <div className="pack-bottom">
          <label className="dependency-toggle"><input type="checkbox" checked={includeDependencies} onChange={(e) => { setIncludeDependencies(e.target.checked); setCompatibility(null); setResolvedPreview(null); }} /><span className="custom-check"><Check size={12} /></span><span><strong>Include required dependencies</strong><small>Automatically resolve compatible dependencies</small></span></label>
          <button className="check-button" onClick={checkCompatibility} disabled={!selected.length || checkingDependencies}>{checkingDependencies ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}{checkingDependencies ? "Checking pack…" : "Check compatibility"}</button>
          {resolvedPreview && <div className="preview-note"><Link2 size={14} /><span><strong>{resolvedPreview.length} files ready</strong><small>Estimated download: {formatBytes(previewSize)}</small></span></div>}
          <div className="zip-info"><Info size={15} /><span>Creates a ZIP with a <code>mods/</code> folder and a manifest. Install the matching loader separately.</span></div>
          <button className="download-button" onClick={downloadZip} disabled={!selected.length || downloadState.busy}>{downloadState.busy ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}{downloadState.busy ? "Building your ZIP…" : "Download mods ZIP"}<span>{selected.length}</span></button>
          {downloadState.error && <button className="retry-button" onClick={downloadZip} disabled={downloadState.busy}><RefreshCw size={14} /> Retry download</button>}
          <div className="safe-note"><ShieldCheck size={14} /> Files are fetched directly from Modrinth</div>
        </div>
      </aside>

      {(detailLoading || detailProject || detailError) && <div className="modal-backdrop" onClick={() => { if (!detailLoading) { setDetailProject(null); setDetailError(""); } }}><div className="details-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => { setDetailProject(null); setDetailError(""); }}><X size={18} /></button>
        {detailLoading ? <div className="modal-loading"><LoaderCircle size={30} className="spin" /><strong>Loading mod details…</strong></div> : detailError ? <div className="modal-loading"><AlertCircle size={30} /><strong>Couldn't load details</strong><p>{detailError}</p></div> : <>
          <div className="detail-head"><div className="detail-icon">{detailProject.icon_url ? <img src={detailProject.icon_url} alt="" /> : <Boxes size={32} />}</div><div><span className="section-kicker">MOD DETAILS</span><h2>{detailProject.title}</h2><p>{detailProject.author || "Modrinth project"}</p></div></div>
          <p className="detail-description">{detailProject.description || "No description available."}</p>
          <div className="detail-stats"><span><b>{formatNumber(detailProject.downloads)}</b> downloads</span><span><b>{detailProject.followers || 0}</b> followers</span><span><b>{detailProject.compatibleVersions?.length || 0}</b> compatible releases</span></div>
          <div className="detail-section"><strong>Current setup</strong><div className="compat-release">{detailProject.compatibleVersions?.length ? <><CheckCircle2 size={16} /><span>{detailProject.compatibleVersions[0].version_number} is compatible with {gameVersion} / {loader}</span></> : <><AlertTriangle size={16} /><span>No compatible JAR release found for {gameVersion} / {loader}</span></>}</div></div>
          <div className="detail-actions"><a href={detailProject.project_url || `https://modrinth.com/mod/${detailProject.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open on Modrinth</a><button onClick={() => { const project = { project_id: detailProject.id, title: detailProject.title, slug: detailProject.slug, icon_url: detailProject.icon_url, description: detailProject.description, author: detailProject.author, downloads: detailProject.downloads }; setDetailProject(null); addMod(project); }} disabled={!detailProject.compatibleVersions?.length || selectedIds.has(detailProject.id)}><Plus size={15} /> {selectedIds.has(detailProject.id) ? "Already added" : "Add mod"}</button></div>
        </>}
      </div></div>}
    </div>
  );
}
