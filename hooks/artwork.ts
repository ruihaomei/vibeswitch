// The gallery's pictures: each theme's own artwork, from what is installed on this machine.
//
// - Backdrops: the plugin's own preview stills (its hooks/photos.ts), read in place, never copied.
// - The others: the stills tools/thumbs.mjs made from each installed plugin's own scene (or, for Garden, its
//   docs/preview.gif), kept in ~/.cache/vibeswitch/thumbs for this machine only.
// - Official Theme Examples also ship as stills in assets/thumbs (Apache-2.0, see NOTICE), used when the cache has none.
// A theme with neither keeps its drawn color card (preview.ts). The gallery draws at once with what is already
// read (peekArtwork) and loads the rest after (loadArtwork); every answer is kept for the session.

import type { EngineInterface } from 'claude-code'
import type { Theme } from './registry'

/** Every card is 16:9, the stills' own shape; the gallery draws it at this size. */
export const CARD = { width: 144, height: 81 } as const

const known = new Map<string, string | null>()
let photos: Promise<Record<string, string>> | undefined

async function home($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? ''
}

export async function thumbsDir($: EngineInterface): Promise<string> {
  return `${await home($)}/.cache/vibeswitch/thumbs`
}

/** Where a plugin is installed, from Claude Code's own record. */
async function installPath($: EngineInterface, plugin: string): Promise<string | undefined> {
  const record = JSON.parse(await $.fs.read(`${await home($)}/.claude/plugins/installed_plugins.json`)) as {
    plugins?: Record<string, { installPath?: string }[]>
  }
  const key = Object.keys(record.plugins ?? {}).find(k => k.split('@')[0] === plugin)
  return key === undefined ? undefined : record.plugins?.[key]?.[0]?.installPath
}

/** Backdrops' own previews: `"id": 'data:image/webp;base64,...'` lines in hooks/photos.ts. */
function backdropPhotos($: EngineInterface): Promise<Record<string, string>> {
  photos ??= (async () => {
    const root = await installPath($, 'backdrops')
    if (root === undefined) return {}
    const source = await $.fs.read(`${root}/hooks/photos.ts`)
    const found: Record<string, string> = {}
    for (const m of source.matchAll(/"([a-z0-9-]+)":\s*'(data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+)'/g)) {
      if (m[1] !== undefined && m[2] !== undefined) found[m[1]] = m[2]
    }
    return found
  })().catch(() => ({}))
  return photos
}

async function cachedStill($: EngineInterface, id: string): Promise<string | undefined> {
  for (const dir of [await thumbsDir($), `${$.plugin.root}/assets/thumbs`]) for (const [ext, mime] of [['webp', 'image/webp'], ['jpg', 'image/jpeg']] as const) {
    const path = `${dir}/${id}.${ext}`
    if (!(await $.fs.exists(path))) continue
    const { base64 } = await $.fs.read(path, { as: 'bytes' })
    return `data:${mime};base64,${base64}`
  }
  return undefined
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
    href = theme.provider === 'backdrops' ? (await backdropPhotos($))[theme.scene] : await cachedStill($, theme.id)
  } catch {
    href = undefined
  }
  const svg = href === undefined ? null : framed(theme.id, href)
  known.set(theme.id, svg)
  return svg ?? undefined
}

/** Forget what was read, after the stills are made again. */
export function forgetArtwork(): void {
  known.clear()
  photos = undefined
}
