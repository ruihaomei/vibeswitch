// Maintainer tool: makes the gallery stills shipped in plugin/assets/thumbs.
//
// It is NOT part of the installed plugin (the marketplace installs ./plugin only), and /vibe never runs it.
// It imports and runs the scene code of the theme checkouts you name, so name only checkouts you trust, for example
// a clone of anthropics/claude-plugins-official at a reviewed commit.
//
//   node tools/thumbs.mjs --theme-examples <claude-plugins-official>/plugins/theme-examples \
//     [--rainy-window <claude-code-themes>/themes/rainy-window] [--garden <claude-garden-theme>] \
//     [--chrome <path to Chrome or Edge>] [--out plugin/assets/thumbs]
//
// - Theme Examples and Rainy Window: each scene is built by the theme's own code and photographed by headless Chrome
//   at 1600 x 900, three seconds in, then saved as a 240 x 135 WebP still.
// - Garden: the first frame of its docs/preview.gif.
// - Backdrops: nothing. Its artwork may not be redistributed; the plugin reads Backdrops' own previews in place.
// Needs Node 22+, Chrome or Edge, cwebp, and macOS sips (Garden only).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    'theme-examples': { type: 'string' }, 'rainy-window': { type: 'string' }, garden: { type: 'string' },
    chrome: { type: 'string' }, out: { type: 'string', default: join(fileURLToPath(new URL('..', import.meta.url)), 'plugin', 'assets', 'thumbs') },
  },
})
const W = 1600, H = 900, SCALE = 0.5
const LIGHT_INK = '#1f1e1d', DARK_INK = '#f5f4ef'
const OUT = resolve(opt.out)

const chrome = [opt.chrome, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(p => p && existsSync(p))
if (!chrome) throw new Error('Chrome or Edge not found: pass --chrome <path>')
const cwebp = ['/opt/homebrew/bin/cwebp', '/usr/local/bin/cwebp'].find(existsSync) ?? 'cwebp'

// The themes import their own files without an extension ('./scenes/classic'); Node needs one.
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

const work = mkdtempSync(join(tmpdir(), 'vibeswitch-thumbs-'))
mkdirSync(OUT, { recursive: true })

const keep = (png, id) => execFileSync(cwebp, ['-quiet', '-q', '72', '-resize', '240', '135', png, '-o', join(OUT, `${id}.webp`)])

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
const made = []

if (opt['theme-examples']) {
  const { THEMES } = await import(pathToFileURL(join(resolve(opt['theme-examples']), 'hooks', 'themes.ts')).href)
  for (const t of THEMES) {
    const dark = t.window === 'dark'
    keep(photograph(t.id, layer(dark ? darkened(t.scene()) : t.scene(), dark ? '#141413' : '#faf9f5', dark ? DARK_INK : LIGHT_INK)), t.id)
    made.push(t.id)
  }
}

if (opt['rainy-window']) {
  const { sceneSvg } = await import(pathToFileURL(join(resolve(opt['rainy-window']), 'hooks', 'scene.ts')).href)
  const svg = sceneSvg()
  // It follows the app's mode: light on the left, dark on the right, split on the diagonal.
  const light = photograph('rainy-light', layer(svg, '#faf9f5', LIGHT_INK))
  const dark = photograph('rainy-dark', layer(svg, '#141413', DARK_INK))
  const img = png => `<img src="${pathToFileURL(png).href}" style="width:100%;height:100%;display:block">`
  keep(photograph('rainy-window', layer(img(light), '#faf9f5', LIGHT_INK)
    + layer(img(dark), '#141413', DARK_INK, `clip-path:polygon(100% 0,100% 100%,${Math.round(W / 3)}px 100%)`)), 'rainy-window')
  made.push('rainy-window')
}

if (opt.garden) {
  const png = join(work, 'garden.png')
  execFileSync('sips', ['-s', 'format', 'png', '-z', '135', '240', join(resolve(opt.garden), 'docs', 'preview.gif'), '--out', png], { stdio: 'ignore' })
  keep(png, 'garden')
  made.push('garden')
}

rmSync(work, { recursive: true, force: true })
console.log(`Made ${made.length} still(s) in ${OUT}`)
