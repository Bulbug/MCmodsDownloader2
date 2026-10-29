// Modrinth project types supported by the builder.
// `loader: true` means releases are filtered by the selected mod loader.
export const TYPES = [
  { id: 'mod', label: 'Mods', dir: 'mods', loader: true },
  { id: 'modpack', label: 'Modpacks', dir: 'modpacks', loader: true },
  { id: 'resourcepack', label: 'Resource packs', dir: 'resourcepacks', loader: false },
  { id: 'shader', label: 'Shaders', dir: 'shaderpacks', loader: false },
  { id: 'datapack', label: 'Data packs', dir: 'datapacks', loader: false },
]
export const T = Object.fromEntries(TYPES.map((t) => [t.id, t]))
export const typeOf = (x) => (T[x] ? x : 'mod')
