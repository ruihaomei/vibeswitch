// Builds the gallery's thumbnails from the installed theme plugins' own artwork, for this machine only.
//
//   node <this repo>/tools/thumbs.mjs   (or /vibe refresh)
//
// - Theme Examples and Rainy Window: each scene is built by the plugin's own code and photographed by headless
//   Chrome at 1600 x 900, three seconds in (how Backdrops made its own previews), then saved as a 240 x 135 still.
// - Garden: the first frame of the plugin's own docs/preview.gif.
// - Backdrops: nothing here; the gallery reads the plugin's own previews (hooks/photos.ts) where they are installed.
//
// Output: ~/.cache/vibeswitch/thumbs/<theme id>.webp (or .jpg without cwebp) and manifest.json, never inside a
// plugin. These are local derivatives of third-party artwork for personal use: do not publish or share them.
// Nothing needs to be installed; it uses Node, Chrome (or Edge) and macOS sips, and cwebp where present.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HOME = homedir()
const OUT = join(HOME, '.cache', 'vibeswitch', 'thumbs')
const W = 1600, H = 900, SCALE = 0.5 // Chrome's smallest; keep() makes it 240 x 135
const LIGHT_INK = '#1f1e1d', DARK_INK = '#f5f4ef'

// The plugins import their own files without an extension ('./scenes/classic'); Node needs one.
registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) {
      const url = new URL(spec, ctx.parentURL)
      const path = fileURLToPath(url)
      if (!existsSync(path)) for (const ext of ['.ts', '.tsx']) if (existsSync(path + ext)) return next(url.href + ext, ctx)
    }
    return next(spec, ctx)
  },
})

function installed(name) {
  const file = join(HOME, '.claude', 'plugins', 'installed_plugins.json')
  const plugins = JSON.parse(readFileSync(file, 'utf8')).plugins ?? {}
  const key = Object.keys(plugins).find(k => k.split('@')[0] === name)
  const entry = key ? plugins[key]?.[0] : undefined
  return entry?.installPath && existsSync(entry.installPath) ? { path: entry.installPath, version: entry.version } : undefined
}

function findTool(...names) {
  const dirs = [...(process.env.PATH ?? '').split(':'), '/opt/homebrew/bin', '/usr/local/bin', '/opt/anaconda3/bin']
  for (const n of names.filter(Boolean)) {
    if (n.startsWith('/')) { if (existsSync(n)) return n; continue }
    for (const d of dirs) if (d && existsSync(join(d, n))) return join(d, n)
  }
  return undefined
}

const chrome = findTool(process.env.CHROME ?? '', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium')
const cwebp = findTool('cwebp')
const work = mkdtempSync(join(tmpdir(), 'vibeswitch-thumbs-'))
mkdirSync(OUT, { recursive: true })

/** A PNG becomes the cached still: webp where cwebp exists, else jpeg through sips. */
function keep(png, id) {
  for (const ext of ['webp', 'jpg']) rmSync(join(OUT, `${id}.${ext}`), { force: true })
  if (cwebp) execFileSync(cwebp, ['-quiet', '-q', '72', '-resize', '240', '135', png, '-o', join(OUT, `${id}.webp`)])
  else execFileSync('sips', ['-z', '135', '240', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', png, '--out', join(OUT, `${id}.jpg`)], { stdio: 'ignore' })
}

/** One page, one photograph: the scene at the window size, three seconds into its animation. Returns the PNG. */
function photograph(id, body) {
  const html = join(work, `${id}.html`), png = join(work, `${id}.png`)
  writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}`
    + `.w{position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden}.w>svg{display:block;width:100%;height:100%}</style>${body}`)
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    `--user-data-dir=${join(work, 'profile')}`, `--window-size=${W},${H}`, `--force-device-scale-factor=${SCALE}`,
    '--virtual-time-budget=3000', `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore', timeout: 60000 })
  if (!existsSync(png)) throw new Error('the browser made no picture')
  return png
}

const layer = (svg, bg, ink, clip = '') => `<div class="w" style="background:${bg};color:${ink};${clip}">${svg}</div>`
const darkened = svg => svg.replaceAll('@media (prefers-color-scheme:dark)', '@media all')

const made = [], failed = [], sources = {}
const attempt = (id, fn) => { try { fn(); made.push(id) } catch (error) { failed.push(`${id}: ${error.message ?? error}`) } }

if (!chrome) failed.push('Chrome or Edge not found: only Garden can be made')

const examples = installed('theme-examples')
if (examples && chrome) {
  sources['theme-examples'] = examples.version
  const { THEMES } = await import(pathToFileURL(join(examples.path, 'hooks', 'themes.ts')).href)
  for (const t of THEMES) {
    attempt(t.id, () => {
      const dark = t.window === 'dark'
      const svg = dark ? darkened(t.scene()) : t.scene()
      keep(photograph(t.id, layer(svg, dark ? '#141413' : '#faf9f5', dark ? DARK_INK : LIGHT_INK)), t.id)
    })
  }
}

const rainy = installed('rainy-window')
if (rainy && chrome) {
  sources['rainy-window'] = rainy.version
  try {
    const { sceneSvg } = await import(pathToFileURL(join(rainy.path, 'hooks', 'scene.ts')).href)
    const svg = sceneSvg()
    // It follows the app's mode: light on the left, dark on the right, split on the diagonal. Each mode is its own
    // page, since the scene's gradients take the text color where they are defined.
    const light = photograph('rainy-light', layer(svg, '#faf9f5', LIGHT_INK))
    const dark = photograph('rainy-dark', layer(svg, '#141413', DARK_INK))
    const img = png => `<img src="${pathToFileURL(png).href}" style="width:100%;height:100%;display:block">`
    keep(photograph('rainy-window', layer(img(light), '#faf9f5', LIGHT_INK)
      + layer(img(dark), '#141413', DARK_INK, `clip-path:polygon(100% 0,100% 100%,${Math.round(W / 3)}px 100%)`)), 'rainy-window')
    made.push('rainy-window')
  } catch (error) { failed.push(`rainy-window: ${error.message ?? error}`) }
}

const garden = installed('garden-theme')
if (garden) {
  sources['garden-theme'] = garden.version
  attempt('garden', () => {
    const png = join(work, 'garden.png')
    execFileSync('sips', ['-s', 'format', 'png', '-z', '135', '240', join(garden.path, 'docs', 'preview.gif'), '--out', png], { stdio: 'ignore' })
    keep(png, 'garden')
  })
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), sources, themes: made, failed }, null, 2) + '\n')
rmSync(work, { recursive: true, force: true })
console.log(`Made ${made.length} thumbnail(s) in ${OUT}${failed.length ? `; failed: ${failed.join('; ')}` : ''}`)
