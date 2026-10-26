import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  Search, Download, PackagePlus, Package, SlidersHorizontal, X,
  Check, Plus, Minus, LoaderCircle, Boxes, AlertTriangle, Github,
  ExternalLink, ShieldCheck, Trash2, ChevronDown, Sparkles, Info
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
    headers: { "User-Agent": "DIVModpackBuilder/1.0.0 (web app)" }
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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [downloadState, setDownloadState] = useState({ busy: false, message: "", error: false });
  const [includeDependencies, setIncludeDependencies] = useState(true);
  const [showSelected, setShowSelected] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.project_id)), [selected]);

  async function searchMods(term = query) {
    setLoadingSearch(true);
    setSearchError("");
    setSearchText(term.trim());
    try {
      const facets = [
        ["project_type:mod"],
        [`versions:${gameVersion}`],
        [`categories:${loader}`]
      ];
      const params = new URLSearchParams({
        query: term.trim(),
        facets: JSON.stringify(facets),
        index: sort,
        limit: "24"
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
    // Load a starter selection of popular mods from the selected filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameVersion, loader, sort]);

  async function getCompatibleVersions(projectId) {
    if (versionsByProject[projectId]) return versionsByProject[projectId];
    const params = new URLSearchParams({
      game_versions: JSON.stringify([gameVersion]),
      loaders: JSON.stringify([loader])
    });
    const versions = await apiGet(`/project/${projectId}/version?${params.toString()}&include_changelog=false`);
    setVersionsByProject((previous) => ({ ...previous, [projectId]: versions }));
    return versions;
  }

  async function addMod(project) {
    if (selectedIds.has(project.project_id)) return;
    setLoadingProject(project.project_id);
    setSearchError("");
    try {
      const versions = await getCompatibleVersions(project.project_id);
      const usable = versions.find((version) => version.status === "listed" && pickFile(version) && isJar(pickFile(version)));
      if (!usable) {
        setSearchError(`No compatible JAR version was found for ${project.title}.`);
        return;
      }
      const file = pickFile(usable);
      setSelected((current) => current.some((item) => item.project_id === project.project_id) ? current : [
        ...current,
        {
          project_id: project.project_id,
          title: project.title,
          slug: project.slug,
          icon_url: project.icon_url,
          version: usable,
          file,
          dependency: false,
          project_url: `https://modrinth.com/mod/${project.slug || project.project_id}`
        }
      ]);
    } catch (error) {
      setSearchError(`Couldn't load a compatible version for ${project.title}: ${error.message}`);
    } finally {
      setLoadingProject("");
    }
  }

  function removeMod(projectId) {
    setSelected((current) => current.filter((item) => item.project_id !== projectId));
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
          } catch {
            dependencyVersion = null;
          }
        }

        if (!dependencyVersion && projectId) {
          const params = new URLSearchParams({
            game_versions: JSON.stringify([gameVersion]),
            loaders: JSON.stringify([loader])
          });
          const versions = await apiGet(`/project/${projectId}/version?${params.toString()}&include_changelog=false`);
          dependencyVersion = versions.find((version) =>
            version.status === "listed" &&
            version.game_versions?.includes(gameVersion) &&
            version.loaders?.includes(loader) &&
            pickFile(version) && isJar(pickFile(version))
          );
        }

        if (!dependencyVersion) {
          const name = dependency.project_id || dependency.file_name || "unknown dependency";
          throw new Error(`Could not find a compatible required dependency (${name}). Remove the parent mod or try a different game version/loader.`);
        }

        const dependencyFile = pickFile(dependencyVersion);
        if (!dependencyFile || !isJar(dependencyFile)) {
          throw new Error(`Required dependency ${dependencyVersion.name || dependencyVersion.id} does not provide a JAR file.`);
        }

        if (dependencyVersion.game_versions?.length && !dependencyVersion.game_versions.includes(gameVersion)) {
          throw new Error(`A required dependency (${dependencyVersion.name || dependencyVersion.id}) does not support Minecraft ${gameVersion}.`);
        }
        if (dependencyVersion.loaders?.length && !dependencyVersion.loaders.includes(loader)) {
          throw new Error(`A required dependency (${dependencyVersion.name || dependencyVersion.id}) does not support ${loader}.`);
        }

        if (projectId && resolvedIds.has(projectId)) continue;
        if (projectId) resolvedIds.add(projectId);

        let title = dependency.file_name?.replace(/\.jar$/i, "") || dependencyVersion.name || "Required dependency";
        let slug = projectId;
        let icon_url = "";
        if (projectId) {
          try {
            const project = await apiGet(`/project/${projectId}`);
            title = project.title || title;
            slug = project.slug || slug;
            icon_url = project.icon_url || "";
          } catch { /* A version can still be packaged if project metadata is unavailable. */ }
        }

        resolved.push({
          project_id: projectId || dependencyVersion.id,
          title,
          slug,
          icon_url,
          version: dependencyVersion,
          file: dependencyFile,
          dependency: true,
          project_url: projectId ? `https://modrinth.com/mod/${slug || projectId}` : "https://modrinth.com"
        });
      }
    }
    return resolved;
  }

  async function downloadZip() {
    if (!selected.length || downloadState.busy) return;
    setDownloadState({ busy: true, message: "Checking compatibility…", error: false });
    try {
      let items = [...selected];
      if (includeDependencies) {
        items = await resolveDependencies(items);
      }

      const zip = new JSZip();
      const modsFolder = zip.folder("mods");
      const usedNames = new Set();
      const manifestMods = [];
      let completed = 0;

      for (const item of items) {
        setDownloadState({
          busy: true,
          message: `Downloading ${completed + 1} of ${items.length}: ${item.title}`,
          error: false
        });
        if (!item.file?.url || !isJar(item.file)) {
          throw new Error(`${item.title} does not have a downloadable JAR file.`);
        }
        const response = await fetch(item.file.url);
        if (!response.ok) throw new Error(`Download failed for ${item.title} (${response.status}). The file host may block browser downloads.`);
        const blob = await response.blob();
        if (blob.size === 0) throw new Error(`The downloaded file for ${item.title} was empty.`);
        let filename = cleanFilename(item.file.filename);
        const base = filename.replace(/\.jar$/i, "");
        let suffix = 2;
        while (usedNames.has(filename.toLowerCase())) {
          filename = `${base}-${suffix++}.jar`;
        }
        usedNames.add(filename.toLowerCase());
        modsFolder.file(filename, blob);
        manifestMods.push({
          project_id: item.project_id,
          title: item.title,
          version_id: item.version.id,
          version_number: item.version.version_number,
          filename,
          download_url: item.file.url,
          dependency: item.dependency
        });
        completed += 1;
      }

      zip.file("manifest.json", JSON.stringify({
        name: "DIV Modpack Builder export",
        minecraft_version: gameVersion,
        loader,
        created_at: new Date().toISOString(),
        source: "Modrinth",
        note: "Extract the JAR files from the mods folder into the mods folder of a matching Minecraft profile. Install the matching loader separately.",
        mods: manifestMods
      }, null, 2));
      setDownloadState({ busy: true, message: "Creating ZIP archive…", error: false });
      const content = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 4 } });
      const url = URL.createObjectURL(content);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `div-mods-${gameVersion}-${loader}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState({ busy: false, message: `ZIP created with ${items.length} mod${items.length === 1 ? "" : "s"}.`, error: false });
    } catch (error) {
      setDownloadState({ busy: false, message: error.message || "ZIP creation failed.", error: true });
    }
  }

  const totalSize = selected.reduce((sum, item) => sum + (item.file?.size || 0), 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="DIV Modpack Builder home">
          <div className="brand-mark"><Boxes size={22} /></div>
          <div><strong>DIV<span>MODS</span></strong><small>MODPACK BUILDER</small></div>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className={`nav-item ${!showSelected ? "active" : ""}`} onClick={() => setShowSelected(false)}>
          <Search size={17} /> Discover mods
        </button>
        <button className={`nav-item ${showSelected ? "active" : ""}`} onClick={() => setShowSelected(true)}>
          <Package size={17} /> Your selection <span className="nav-count">{selected.length}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="side-tip"><Sparkles size={17} /><strong>Build your own pack</strong><p>Pick your favorite mods. We'll bundle them into one ZIP.</p></div>
          <a className="modrinth-link" href="https://modrinth.com" target="_blank" rel="noreferrer"><span className="modrinth-dot" /> Powered by Modrinth <ExternalLink size={13} /></a>
          <div className="version-label">DIV Modpack Builder · v1.0</div>
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
              <div className="eyebrow"><span className="eyebrow-dot" /> YOUR NEXT ADVENTURE STARTS HERE</div>
              <h1>Build your perfect<br /><span>modpack.</span></h1>
              <p>Find the mods you love. Choose your version. Download everything in one neat ZIP, ready for your Minecraft setup.</p>
              <div className="hero-badges"><span><ShieldCheck size={14} /> Compatibility filters</span><span><Package size={14} /> One ZIP download</span></div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="cube cube-back"><Boxes size={38} /></div>
              <div className="cube cube-front"><Package size={55} /></div>
              <div className="art-tag"><Sparkles size={14} /> YOUR PACK, YOUR RULES</div>
            </div>
          </section>

          <section className="filter-panel">
            <div className="filter-heading"><div><SlidersHorizontal size={17} /><strong>Configure your setup</strong></div><span>Choose before you add mods</span></div>
            <div className="filter-grid">
              <label className="field"><span>MINECRAFT VERSION</span><div className="select-wrap"><select value={gameVersion} onChange={(e) => { setGameVersion(e.target.value); setSelected([]); setVersionsByProject({}); }}><option value="1.8.9">Minecraft 1.8.9</option>{GAME_VERSIONS.filter(v => v !== "1.8.9").map(v => <option key={v} value={v}>Minecraft {v}</option>)}</select><ChevronDown size={15} /></div></label>
              <label className="field"><span>MOD LOADER</span><div className="select-wrap"><select value={loader} onChange={(e) => { setLoader(e.target.value); setSelected([]); setVersionsByProject({}); }}><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="quilt">Quilt</option><option value="neoforge">NeoForge</option></select><ChevronDown size={15} /></div></label>
              <label className="field"><span>SORT BY</span><div className="select-wrap"><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="relevance">Relevance</option><option value="downloads">Most downloaded</option><option value="updated">Recently updated</option><option value="newest">Newest</option></select><ChevronDown size={15} /></div></label>
            </div>
          </section>

          <div className="section-heading">
            <div><div className="section-kicker">{showSelected ? "YOUR COLLECTION" : "MODRINTH DISCOVERY"}</div><h2>{showSelected ? "Your selected mods" : "Find your next favorite"}</h2><p>{showSelected ? `${selected.length} mod${selected.length === 1 ? "" : "s"} in your collection` : "Explore community-made mods for your Minecraft version."}</p></div>
            <div className="result-pill"><span /> {showSelected ? `${selected.length} selected` : `${results.length} results`}</div>
          </div>

          {!showSelected && <form className="search-bar" onSubmit={(e) => { e.preventDefault(); searchMods(query); }}>
            <Search size={19} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mods, e.g. Sodium, minimap, performance..." aria-label="Search mods" />
            {query && <button type="button" className="clear-search" onClick={() => { setQuery(""); searchMods(""); }} aria-label="Clear search"><X size={16} /></button>}
            <button className="search-button" type="submit" disabled={loadingSearch}>{loadingSearch ? <LoaderCircle size={17} className="spin" /> : "Search mods"}</button>
          </form>}

          {searchError && <div className="notice error-notice"><AlertTriangle size={17} /><span>{searchError}</span><button onClick={() => setSearchError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {downloadState.message && <div className={`notice ${downloadState.error ? "error-notice" : "success-notice"}`}><Info size={17} /><span>{downloadState.message}</span>{!downloadState.busy && <button onClick={() => setDownloadState({ busy: false, message: "", error: false })} aria-label="Dismiss message"><X size={16} /></button>}</div>}

          {!showSelected && <div className="active-filters"><span>Filtered for</span><b>{gameVersion}</b><b>{loader}</b><span className="filter-note"><ShieldCheck size={13} /> Compatible versions only</span></div>}

          {loadingSearch && !showSelected ? <div className="loading-state"><LoaderCircle size={28} className="spin" /><strong>Finding your next favorite mods…</strong><span>Checking Modrinth for compatible projects.</span></div> :
            <div className="mod-grid">
              {(showSelected ? selected : results).map((item) => {
                const isSelected = selectedIds.has(item.project_id);
                const isLoading = loadingProject === item.project_id;
                return <article className="mod-card" key={item.project_id}>
                  <div className="card-top"><div className="mod-icon">{item.icon_url ? <img src={item.icon_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Boxes size={24} />}</div><div className="mod-meta"><span className="mod-author">{item.author || (item.dependency ? "Required dependency" : "Modrinth creator")}</span><a className="external-link" href={item.project_url || `https://modrinth.com/mod/${item.slug || item.project_id}`} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} on Modrinth`}><ExternalLink size={14} /></a></div></div>
                  <h3>{item.title}</h3>
                  <p className="mod-description">{item.description || item.version?.name || "Community mod for Minecraft."}</p>
                  <div className="card-tags"><span>{loader}</span>{item.dependency && <span className="dependency-tag">Dependency</span>}{!item.dependency && <span>{formatNumber(item.downloads)} downloads</span>}</div>
                  <div className="card-footer">
                    <span className="version-text">{item.version?.version_number ? `v${item.version.version_number}` : "Compatible release"}</span>
                    {showSelected ? <button className="add-button remove-button" onClick={() => removeMod(item.project_id)}><Trash2 size={15} /> Remove</button> :
                      <button className={`add-button ${isSelected ? "added" : ""}`} onClick={() => isSelected ? removeMod(item.project_id) : addMod(item)} disabled={isLoading}>{isLoading ? <LoaderCircle size={15} className="spin" /> : isSelected ? <Check size={15} /> : <Plus size={16} />}{isLoading ? "Checking…" : isSelected ? "Added" : "Add mod"}</button>}
                  </div>
                </article>;
              })}
            </div>
          }

          {!loadingSearch && !showSelected && results.length === 0 && !searchError && <div className="empty-state"><div className="empty-icon"><Search size={25} /></div><h3>No mods found</h3><p>Try another search term or change your Minecraft version or loader.</p><button className="secondary-button" onClick={() => { setQuery(""); searchMods(""); }}>Browse popular mods</button></div>}
          {!loadingSearch && showSelected && selected.length === 0 && <div className="empty-state"><div className="empty-icon"><PackagePlus size={25} /></div><h3>Your collection is empty</h3><p>Head to Discover mods and add the mods you want in your ZIP.</p><button className="secondary-button" onClick={() => setShowSelected(false)}>Discover mods</button></div>}

          <footer className="page-footer"><span>Made for players who love to customize.</span><span>Not affiliated with Mojang or Modrinth.</span></footer>
        </div>
      </main>

      <aside className="pack-sidebar">
        <div className="pack-title-row"><div><div className="section-kicker">YOUR WORKSPACE</div><h2>Modpack summary</h2></div><div className="pack-icon"><Package size={20} /></div></div>
        <div className="pack-preview"><div className="pack-preview-icon"><Boxes size={32} /></div><div><strong>My Minecraft Pack</strong><span>{gameVersion} · {loader}</span></div><span className="live-dot" /></div>
        <div className="stats-row"><div className="stat-box"><span>SELECTED MODS</span><strong>{selected.length}</strong></div><div className="stat-box"><span>EST. SIZE</span><strong>{formatBytes(totalSize)}</strong></div></div>
        <div className="pack-list-heading"><strong>Included mods</strong><span>{selected.length}/∞</span></div>
        <div className="pack-list">
          {selected.length === 0 ? <div className="pack-empty"><div><PackagePlus size={22} /></div><strong>Nothing here yet</strong><p>Your selected mods will appear here. Add a few to get started.</p></div> :
            selected.map((item) => <div className="pack-item" key={item.project_id}><div className="mini-icon">{item.icon_url ? <img src={item.icon_url} alt="" /> : <Boxes size={17} />}</div><div className="pack-item-text"><strong>{item.title}</strong><span>{item.version?.version_number || "Compatible version"}{item.dependency ? " · Dependency" : ""}</span></div><button onClick={() => removeMod(item.project_id)} aria-label={`Remove ${item.title}`}><X size={15} /></button></div>)
          }
        </div>
        <div className="pack-bottom">
          <label className="dependency-toggle"><input type="checkbox" checked={includeDependencies} onChange={(e) => setIncludeDependencies(e.target.checked)} /><span className="custom-check"><Check size={12} /></span><span><strong>Include required dependencies</strong><small>Automatically add compatible dependencies</small></span></label>
          <div className="zip-info"><Info size={15} /><span>Creates a ZIP with a <code>mods/</code> folder and a manifest. Install the matching loader separately.</span></div>
          <button className="download-button" onClick={downloadZip} disabled={!selected.length || downloadState.busy}>{downloadState.busy ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}{downloadState.busy ? "Building your ZIP…" : "Download mods ZIP"}<span>{selected.length}</span></button>
          <div className="safe-note"><ShieldCheck size={14} /> Files are fetched directly from Modrinth</div>
        </div>
      </aside>
    </div>
  );
}
