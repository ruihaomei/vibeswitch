// The gallery's pictures. VibeSwitch never runs a program or another plugin's code to make them.
//
// - Theme Examples, Rainy Window and Garden: small stills shipped in assets/thumbs (Apache-2.0 and MIT, see NOTICE).
// - Backdrops: its artwork may not be redistributed, so nothing is shipped. Where Backdrops is installed from its
//   own marketplace (neverblinks/backdrops), its preview stills are read in place from hooks/photos.ts, as text:
//   only `"id": 'data:image/...;base64,...'` literals are taken, nothing is imported or evaluated.
// A theme with no still keeps its drawn color card (preview.ts). The gallery draws at once with what is already
// read (peekArtwork) and loads the rest after (loadArtwork); every answer is kept for the session.

import type { EngineInterface } from 'claude-code'
import type { Theme } from './registry'

/** Every card is 16:9, the stills' own shape; the gallery draws it at this size. */
export const CARD = { width: 144, height: 81 } as const

/** Where Backdrops must come from before its preview file is read. */
export const BACKDROPS = { plugin: 'backdrops', repo: 'neverblinks/backdrops' } as const
/** Upper bounds on what is read from Backdrops: the file, and one still in it. */
const MAX_SOURCE = 2_000_000
const MAX_STILL = 200_000
const STILL = /"([a-z0-9-]{1,64})":\s*'(data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2})'/g
const ID = /^[a-z0-9-]{1,64}$/

const known = new Map<string, string | null>()
let photos: Promise<Record<string, string>> | undefined

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? ''
}

type Installed = { plugins?: Record<string, { installPath?: string }[]> }
type Marketplaces = Record<string, { source?: { source?: string; repo?: string } }>

/**
 * Where `plugin` is installed, only when Claude Code's own records say it came from a marketplace whose source is
 * the GitHub repository `repo`. A plugin of the same name from anywhere else is not read.
 */
export async function verifiedInstallPath($: EngineInterface, plugin: string, repo: string): Promise<string | undefined> {
  const dir = `${await home($)}/.claude/plugins`
  const installed = JSON.parse(await $.fs.read(`${dir}/installed_plugins.json`)) as Installed
  const markets = JSON.parse(await $.fs.read(`${dir}/known_marketplaces.json`)) as Marketplaces
  for (const [key, entries] of Object.entries(installed.plugins ?? {})) {
    const at = key.lastIndexOf('@')
    if (at <= 0 || key.slice(0, at) !== plugin) continue
    const source = markets[key.slice(at + 1)]?.source
    if (source?.source !== 'github' || source.repo?.toLowerCase() !== repo.toLowerCase()) continue
    const path = entries?.[0]?.installPath
    if (typeof path === 'string' && path.startsWith(`${dir}/`) && !path.includes('/../')) return path
  }
  return undefined
}

/** Backdrops' own previews, read as text from its hooks/photos.ts; {} when not installed from its marketplace. */
function backdropPhotos($: EngineInterface): Promise<Record<string, string>> {
  photos ??= (async () => {
    const root = await verifiedInstallPath($, BACKDROPS.plugin, BACKDROPS.repo)
    if (root === undefined) return {}
    const file = `${root}/hooks/photos.ts`
    if ((await $.fs.stat(file)).size > MAX_SOURCE) return {}
    const found: Record<string, string> = {}
    for (const m of (await $.fs.read(file)).matchAll(STILL)) {
      if (m[1] !== undefined && m[2] !== undefined && m[2].length <= MAX_STILL) found[m[1]] = m[2]
    }
    return found
  })().catch(() => ({}))
  return photos
}

/** The still shipped with VibeSwitch for `id`, as a data URL. */
async function shippedStill($: EngineInterface, id: string): Promise<string | undefined> {
  if (!ID.test(id)) return undefined
  const path = `${$.plugin.root}/assets/thumbs/${id}.webp`
  if (!(await $.fs.exists(path))) return undefined
  const { base64 } = await $.fs.read(path, { as: 'bytes' })
  return `data:image/webp;base64,${base64}`
}

/** A still in a card: 16:9, filled without stretching (it is 16:9 already), rounded like the color cards. */
function framed(id: string, href: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">`
    + `<defs><clipPath id="a-${id}"><rect width="320" height="180" rx="12"/></clipPath></defs>`
    + `<image href="${href}" width="320" height="180" preserveAspectRatio="xMidYMid slice" clip-path="url(#a-${id})"/>`
    + `<rect x="1" y="1" width="318" height="178" rx="11" fill="none" stroke="#808080" stroke-opacity="0.4" stroke-width="2"/>`
    + `</svg>`
}

/** What is known now: the card, null for none (color card), undefined when not read yet. */
export function peekArtwork(id: string): string | null | undefined {
  return known.get(id)
}

let loading: Promise<boolean> | undefined

/** Reads the cards of `themes` not read yet; true when it read any. One load at a time. */
export function loadArtwork($: EngineInterface, themes: readonly Theme[]): Promise<boolean> {
  const missing = themes.filter(t => !known.has(t.id))
  if (missing.length === 0) return Promise.resolve(false)
  loading ??= Promise.all(missing.map(t => artworkSvg($, t))).then(() => true).finally(() => { loading = undefined })
  return loading
}

/** The theme's own artwork as an Svg card, or undefined where there is none to show (use the color card). */
export async function artworkSvg($: EngineInterface, theme: Theme): Promise<string | undefined> {
  const seen = known.get(theme.id)
  if (seen !== undefined) return seen ?? undefined
  let href: string | undefined
  try {
    href = theme.provider === BACKDROPS.plugin ? (await backdropPhotos($))[theme.scene] : await shippedStill($, theme.id)
  } catch {
    href = undefined
  }
  const svg = href === undefined || !ID.test(theme.id) ? null : framed(theme.id, href)
  known.set(theme.id, svg)
  return svg ?? undefined
}

/** Forget what was read, so a theme plugin installed since shows its artwork. */
export function forgetArtwork(): void {
  known.clear()
  photos = undefined
}
