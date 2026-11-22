import { expect, test } from 'claude-code/testing'

import { mayDraw, providerKeyOfPlugin } from '../hooks/gate'
import { THEMES } from '../hooks/registry'

const CONFIG = '/home/t/.config/vibeswitch/config.json'

// A stand-in engine: a file system in memory, the theme plugins' commands, and a log of what was set.
// A key starting with '*' matches any path ending in the rest (for files under the plugin's own folder).
function engine(on: any, files: Record<string, string>, log: { sets: string[]; runs: string[]; clears: number }, reads: string[] = [], commands?: object[]) {
  const key = (path: string) => (path in files ? path : Object.keys(files).find(k => k.startsWith('*') && path.endsWith(k.slice(1))))
  const at = (path: string) => {
    const k = key(path)
    if (k === undefined) throw new Error(`ENOENT ${path}`)
    return files[k]!
  }
  on('env.get', () => ({ value: '/home/t' }))
  on('fs.exists', (_: any, e: any) => ({ value: key(e.path) !== undefined }))
  on('fs.stat', (_: any, e: any) => ({ value: { kind: 'file', size: at(e.path).length } }))
  on('fs.read', (_: any, e: any) => {
    reads.push(e.path)
    return { value: e.as === 'bytes' ? { base64: at(e.path) } : at(e.path) }
  })
  on('fs.write', (_: any, e: any) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('session.root', () => ({ value: '/proj/a' }))
  on('command.register', () => ({ value: { command: 'vibe' } }))
  on('command.list', () => ({
    value: commands ?? [
      { name: 'rainy-window', description: '', source: 'plugin', plugin: 'rainy-window' },
      { name: 'garden', description: '', source: 'plugin', plugin: 'garden-theme' },
      { name: 'backdrops', description: '', source: 'plugin', plugin: 'backdrops' },
      { name: 'custom-theme', description: '', source: 'plugin', plugin: 'theme-examples' },
    ],
  }))
  on('command.run', (_: any, e: any) => {
    log.runs.push(`/${e.command} ${e.args}`.trim())
    return { text: 'ok' }
  })
  on('theme.set', (_: any, e: any) => {
    log.sets.push(e.backdrop?.scene ?? '?')
    return { value: { isDrawn: true, requestId: 'r' } }
  })
  on('theme.clear', () => {
    log.clears++
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('clock.after', () => ({ value: undefined })) // timers fire at once here
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
}

const run = async ($: any, args: string) => {
  const text = (await $.command.run({ command: 'vibe', args })).text as string
  await new Promise(r => (globalThis as any).setTimeout(r, 30)) // the provider command runs just after the answer
  return text
}
const config = (files: Record<string, string>) => JSON.parse(files[CONFIG] ?? '{}')

test('first start writes the official Honu Lagoon as the default and turns it on', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  expect(config(files).default).toBe('honu-lagoon')
  expect(log.runs).toContain('/custom-theme honu-lagoon session')
  const menu = await run($, '')
  expect(menu).toContain('12. Honu Lagoon  ☀  ← active')
})

test('switching session, project and default keeps each layer apart', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })

  await run($, 'garden')
  expect(log.runs.at(-1)).toBe('/garden')
  await run($, 'session after hours')
  expect(log.runs.at(-1)).toBe('/backdrops after-hours session')
  await run($, 'rainy window')
  expect(log.runs.at(-1)).toBe('/rainy-window on')

  // Project override leaves the default alone; the session override still wins.
  await run($, 'project garden')
  expect(config(files).default).toBe('honu-lagoon')
  expect(config(files).projects['/proj/a']).toBe('garden')
  expect(await run($, 'status')).toContain('Active: Rainy Window')

  // Clearing the session override falls back to the project.
  await run($, 'session inherit')
  expect(await run($, 'status')).toContain('Active: Garden')

  // Changing the default does not touch the project.
  await run($, 'default after-hours')
  expect(config(files).projects['/proj/a']).toBe('garden')
  expect(await run($, 'status')).toContain('Active: Garden')

  // Clearing the project falls back to the default.
  await run($, 'project inherit')
  expect(config(files).projects['/proj/a']).toBe(undefined)
  expect(await run($, 'status')).toContain('Active: After Hours')

  // Explicit none is not inherit.
  await run($, 'off')
  expect(log.clears).toBe(1)
  expect(await run($, 'status')).toContain('Session override: none')
})

test('the gate rule: one provider, one scene', () => {
  const key = (plugin: string) => providerKeyOfPlugin(plugin) ?? ''
  // After Hours selected: only backdrops' after-hours scene may stand.
  expect(mayDraw('after-hours', key('rainy-window'), 'rainy-window')).toBe(false)
  expect(mayDraw('after-hours', key('garden-theme'), 'garden')).toBe(false)
  expect(mayDraw('after-hours', key('backdrops'), 'reaching')).toBe(false)
  expect(mayDraw('after-hours', key('backdrops'), 'after-hours')).toBe(true)
  // Rainy Window selected, then none.
  expect(mayDraw('rainy-window', key('rainy-window'), 'rainy-window')).toBe(true)
  expect(mayDraw('rainy-window', key('theme-examples'), 'ember')).toBe(false)
  expect(mayDraw('none', key('rainy-window'), 'rainy-window')).toBe(false)
  // An unregistered plugin is never gated.
  expect(providerKeyOfPlugin('some-other-mod')).toBe(undefined)
})

test('a non-default start turns on the chosen provider', async ($, on) => {
  const files: Record<string, string> = { [CONFIG]: JSON.stringify({ default: 'after-hours', projects: {} }) }
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  expect(log.runs).toEqual(['/backdrops after-hours session'])
})

test('refresh records the providers it finds', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  const text = await run($, 'refresh')
  expect(text).toContain('Registered 4 provider(s), 49 theme(s)')
  expect(config(files).providers).toEqual(['rainy-window', 'garden-theme', 'backdrops', 'theme-examples'])
})


test('the list is grouped, numbered in category order, and names all 38 official examples', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  const text = await run($, 'list')
  for (const heading of ['Follows light & dark mode (1)', 'Cinematic dusk & night (9)', 'Light & paper (7)', 'Night & dark (14)', 'Interactive (pointer, some with sound) (18)']) {
    expect(text).toContain(heading)
  }
  expect(text).toContain('Opening the theme gallery')
  expect(THEMES.filter(t => t.provider === 'theme-examples').length).toBe(38)
  // Number 2 is the first cinematic theme, as the list prints it.
  expect(text).toContain(' 2. Reaching')
  await run($, '2')
  expect(log.runs.at(-1)).toBe('/backdrops reaching session')
})

test('the gallery pane draws a preview per theme and Preview applies it', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'vibeswitch', component: 'Pane', requestId: 'vibeswitch-gallery', surface: 'desktop',
    props: { title: 'Themes', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as any)
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(49)
  await ui.press({ key: 'p-garden' })
  await new Promise(r => (globalThis as any).setTimeout(r, 30))
  expect(log.runs.at(-1)).toBe('/garden')
  expect(await run($, 'status')).toContain('Active: Garden')
  await ui.unmount()
})

const pane = {
  plugin: 'vibeswitch', component: 'Pane', requestId: 'vibeswitch-gallery', surface: 'desktop',
  props: { title: 'Themes', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
}
const records = (backdropsKey: string, repo: string) => ({
  '/home/t/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: { [backdropsKey]: [{ installPath: '/home/t/.claude/plugins/cache/bd' }] } }),
  '/home/t/.claude/plugins/known_marketplaces.json': JSON.stringify({ [backdropsKey.split('@')[1]!]: { source: { source: 'github', repo } } }),
  '/home/t/.claude/plugins/cache/bd/hooks/photos.ts': `export const PHOTOS = {\n  "reaching": 'data:image/webp;base64,UkVBQ0g=',\n}`,
})
const drawn = async ($: any) => {
  const ui = await $.ui.mount(pane as any)
  await new Promise(r => (globalThis as any).setTimeout(r, 50))
  const svgs = await ui.findAll({ type: 'Svg' })
  await ui.unmount()
  return svgs
}

test('the gallery shows the shipped stills and Backdrops\' own, and the color card elsewhere', async ($, on) => {
  const files: Record<string, string> = { ...records('backdrops@backdrops', 'neverblinks/backdrops'), '*/assets/thumbs/koi-pond.webp': 'S09J' }
  const reads: string[] = []
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log, reads)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(pane as any)
  // The first draw is color cards; the pictures arrive in a second draw.
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(49)
  await ui.unmount()
  const svgs = await drawn($)
  const sources: string[] = svgs.map((s: any) => String(s.props.source))
  expect(svgs.length).toBe(49)
  expect(sources.filter(s => s.includes('<image href="data:')).length).toBe(2)
  expect(sources.some(s => s.includes('data:image/webp;base64,UkVBQ0g='))).toBe(true)
  expect(sources.some(s => s.includes('data:image/webp;base64,S09J'))).toBe(true)
  expect(svgs.every((s: any) => s.props.width === 144 && s.props.height === 81)).toBe(true)
  expect(reads.some(p => p.includes('/.cache/'))).toBe(false)
})

test('a plugin named backdrops from another marketplace is never read', async ($, on) => {
  const files: Record<string, string> = records('backdrops@lookalike', 'someone/backdrops')
  const reads: string[] = []
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log, reads)
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  const sources: string[] = (await drawn($)).map((s: any) => String(s.props.source))
  expect(sources.some(s => s.includes('UkVBQ0g='))).toBe(false)
  expect(reads.some(p => p.endsWith('/photos.ts'))).toBe(false)
})

test('a same-named command that is not a plugin command is never run', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log, [], [{ name: 'custom-theme', description: '', source: 'user' }])
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  expect(await run($, 'night reef')).toContain('No theme')
  expect(await run($, 'refresh')).toContain('Registered 0 provider(s)')
  expect(log.runs.filter(r => r.startsWith('/custom-theme'))).toEqual([])
})

test('nothing VibeSwitch does starts a process', async ($, on) => {
  const files: Record<string, string> = {}
  const log = { sets: [] as string[], runs: [] as string[], clears: 0 }
  engine(on, files, log)
  const spawned: string[] = []
  on('process.run', (_: any, e: any) => { spawned.push(String(e.argv)); return { deny: 'not in tests' } as any })
  await $.session.start({ cwd: '/proj/a', surface: 'desktop', isInteractive: true })
  for (const args of ['', 'list', 'refresh', 'preview', 'status', 'night reef', 'default koi mosaic', 'project garden', 'off']) await run($, args)
  await new Promise(r => (globalThis as any).setTimeout(r, 1100))
  expect(spawned).toEqual([])
})
