// VibeSwitch: one command over the installed theme plugins.
//
// Each theme plugin sets its own look at session start, so installed together
// they overwrite one another. This mod does two things only:
//  1. It holds back $.theme.set calls from registered theme plugins other than
//     the one the session should show (a hook on `theme.set`), so backdrops
//     never stack or flicker between providers.
//  2. It turns the chosen theme on through that plugin's own slash command
//     ($.command.run), so each plugin keeps its own drawing, animation and logic.
// Plugins not in the registry are never touched.
//
// Which theme: session override > project preference > global default.
// The default and project preferences live in ~/.config/vibeswitch/config.json;
// the session override lives in $.state and ends with the session.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { CARD, forgetArtwork, loadArtwork, peekArtwork, thumbsDir } from './artwork'
import { mayDraw, NONE, providerKeyOfPlugin } from './gate'
import { previewSvg } from './preview'
import { CATEGORIES, PROVIDERS, THEMES, type Category, type Provider, type Theme } from './registry'

const COMMAND = 'vibe'
const SESSION = { plugin: 'vibeswitch', key: 'session' } as const
const GALLERY = 'vibeswitch-gallery'
/** The gallery pane's filter, and a counter bumped after a pick so the pane redraws its marks. */
const gallery = atom({ plugin: 'vibeswitch', key: 'gallery' } as const, { filter: 'all', tick: 0 }, { shape: 'gallery-1' })
const INITIAL_DEFAULT = 'honu-lagoon'

type Config = { default: string; projects: Record<string, string>; providers?: string[] }
type Layer = 'session' | 'project' | 'default'
type Resolved = { target: string; from: Layer }

/** The resolved theme of this session (id or 'none'); undefined until read, or when the config can't be read. */
let resolved: Resolved | undefined
let applyFailed = false
/** The session override as this module last wrote it; a $.state read inside the same dispatch still sees the old value. */
let sessionOverride: string | undefined
/** The scene a registered provider set and the gate let through in this session ('' for none yet). */
let standingScene = ''

// ---------- config ----------

async function configPath($: EngineInterface): Promise<string> {
  const home = await $.env.get('HOME')
  return `${home ?? ''}/.config/vibeswitch/config.json`
}

async function readConfig($: EngineInterface): Promise<Config> {
  const path = await configPath($)
  if (!(await $.fs.exists(path))) {
    const fresh: Config = { default: INITIAL_DEFAULT, projects: {} }
    await writeConfig($, fresh)
    return fresh
  }
  const raw: unknown = JSON.parse(await $.fs.read(path))
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path} is not a JSON object`)
  const obj = raw as Record<string, unknown>
  const projects = typeof obj.projects === 'object' && obj.projects !== null ? (obj.projects as Record<string, string>) : {}
  return {
    default: typeof obj.default === 'string' ? obj.default : INITIAL_DEFAULT,
    projects: { ...projects },
    providers: Array.isArray(obj.providers) ? obj.providers.filter((p): p is string => typeof p === 'string') : undefined,
  }
}

async function writeConfig($: EngineInterface, config: Config): Promise<void> {
  const out: Record<string, unknown> = { default: config.default, projects: config.projects }
  if (config.providers !== undefined) out.providers = config.providers
  await $.fs.write(await configPath($), `${JSON.stringify(out, null, 2)}\n`)
}

// ---------- resolution ----------

const themeById = (id: string): Theme | undefined => THEMES.find(t => t.id === id)
const isValue = (v: string | undefined): v is string => v !== undefined && v !== '' && (v === NONE || themeById(v) !== undefined)
const titleOf = (v: string): string => (v === NONE ? 'none (original appearance)' : (themeById(v)?.title ?? v))

async function projectKey($: EngineInterface): Promise<string> {
  return $.session.root()
}

async function layers($: EngineInterface) {
  const config = await readConfig($)
  const session = sessionOverride ?? (await $.state.get(SESSION)).value ?? ''
  const project = await projectKey($)
  return { config, session, project, projectValue: config.projects[project] ?? '' }
}

async function resolve($: EngineInterface): Promise<Resolved | undefined> {
  if (resolved !== undefined) return resolved
  try {
    const { config, session, projectValue } = await layers($)
    if (isValue(session)) resolved = { target: session, from: 'session' }
    else if (isValue(projectValue)) resolved = { target: projectValue, from: 'project' }
    else resolved = { target: isValue(config.default) ? config.default : INITIAL_DEFAULT, from: 'default' }
  } catch (err) {
    $.ui.log(`VibeSwitch: config unreadable, not coordinating themes: ${String(err)}`, { to: 'debug' })
    resolved = undefined
  }
  return resolved
}

// ---------- activation ----------

async function commandExists($: EngineInterface, provider: Provider): Promise<boolean> {
  const commands = await $.command.list()
  return commands.some(c => c.name === provider.command && (c.plugin === undefined || c.plugin === provider.plugin))
}

/** Shows the resolved theme now. Returns a problem line, or undefined when it went through. */
async function apply($: EngineInterface, target: string): Promise<string | undefined> {
  if (target === NONE) {
    await $.theme.clear()
    return undefined
  }
  const theme = themeById(target)
  const provider = theme === undefined ? undefined : PROVIDERS[theme.provider]
  if (theme === undefined || provider === undefined) return `Unknown theme "${target}".`
  if (!(await commandExists($, provider))) return `${theme.title} needs the ${provider.plugin} plugin, whose /${provider.command} command isn't loaded in this session.`
  const out = await $.command.run({ command: provider.command, args: provider.activate(theme.id) })
  const text = out.text ?? ''
  if (/^No theme|^Unknown|^Try /i.test(text)) return `${provider.plugin} answered: ${text}`
  return undefined
}

// ---------- parsing and text ----------

/** The registered providers whose command this session has (the config's list, once refresh wrote one). */
async function loadedProviders($: EngineInterface): Promise<string[]> {
  const commands = await $.command.list()
  return Object.keys(PROVIDERS).filter(key => {
    const p = PROVIDERS[key]
    return p !== undefined && commands.some(c => c.name === p.command && (c.plugin === undefined || c.plugin === p.plugin))
  })
}

async function available($: EngineInterface): Promise<Theme[]> {
  const config = await readConfig($)
  const providers = config.providers ?? (await loadedProviders($))
  const rank = (t: Theme) => CATEGORIES.findIndex(c => c.id === t.category)
  // Numbered in category order, so the list, the pane and /vibe <n> agree.
  return THEMES.filter(t => providers === undefined || providers.includes(t.provider))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map(x => x.t)
}

/** A theme id, 'none', '' (inherit), or undefined when it names nothing. */
async function parseValue($: EngineInterface, words: string): Promise<string | undefined> {
  const key = words.trim().toLowerCase()
  if (key === 'inherit') return ''
  if (key === 'none' || key === 'off') return NONE
  const list = await available($)
  if (/^\d+$/.test(key)) return list[Number(key) - 1]?.id
  const norm = key.replace(/[\s_,]+/g, '-').replace(/-+/g, '-')
  return list.find(t => t.id === norm || t.title.toLowerCase().replace(/[\s,]+/g, '-').replace(/-+/g, '-') === norm)?.id
}

const MODE_MARK = { light: '☀', dark: '☾', both: '◐' } as const

function tags(t: Theme): string {
  return `${MODE_MARK[t.mode]}${t.category === 'interactive' ? ' ✋' : ''}${t.sound === true ? ' ♪' : ''}`
}

async function menuText($: EngineInterface, header: string, withBlurbs: boolean): Promise<string> {
  const list = await available($)
  const now = await resolve($)
  const lines: string[] = [header]
  for (const cat of CATEGORIES) {
    const rows = list.map((t, i) => ({ t, n: i + 1 })).filter(x => x.t.category === cat.id)
    if (rows.length === 0) continue
    lines.push('', `${cat.title} (${rows.length})`)
    for (const { t, n } of rows) {
      const active = now?.target === t.id ? '  ← active' : ''
      lines.push(`  ${String(n).padStart(2)}. ${t.title}  ${tags(t)}${active}`)
      if (withBlurbs) lines.push(`      ${t.blurb}`)
    }
  }
  lines.push(
    '',
    '☀ light window  ☾ dark window  ◐ follows the app  ✋ answers the pointer  ♪ sound',
    'Pick:  /vibe <number|name>          (this session)',
    '       /vibe default <number|name>  (all sessions)',
    '       /vibe project <number|name>  (this project)',
    '       /vibe preview  (gallery pane with previews)  ·  off  ·  status  ·  refresh',
  )
  return lines.join('\n')
}

/** Opens the gallery pane; says so, or why no window shows it. */
/** Opens the gallery without waiting for its first draw; a pane that is not placed says why in a toast. */
async function openGallery($: EngineInterface): Promise<string> {
  void $.ui.open({ id: GALLERY, title: 'Themes', focus: true })
    .then(opened => { if (!opened.isPlaced) $.ui.toast(`VibeSwitch: gallery not shown: ${opened.reason}`) })
    .catch(err => $.ui.toast(`VibeSwitch: gallery not shown: ${String(err)}`))
  return 'Opening the theme gallery beside the chat (desktop app, Code tab): Preview tries a theme live in this session.'
}

async function statusText($: EngineInterface): Promise<string> {
  resolved = undefined
  const now = await resolve($)
  const { config, session, project, projectValue } = await layers($)
  const show = (v: string) => (v === '' ? 'inherit' : titleOf(v))
  const mark = (layer: Layer) => (now?.from === layer ? '  ← in effect' : '')
  return [
    `Active: ${now === undefined ? 'unknown (config unreadable)' : titleOf(now.target)}`,
    `  Session override: ${show(session)}${mark('session')}`,
    `  Project (${project}): ${show(projectValue)}${mark('project')}`,
    `  Global default: ${titleOf(config.default)}${mark('default')}`,
    `Order: session > project > default. Config: ${await configPath($)}`,
  ].join('\n')
}

async function refresh($: EngineInterface): Promise<string> {
  const config = await readConfig($)
  const found = await loadedProviders($)
  const before = config.providers ?? []
  const added = found.filter(k => !before.includes(k))
  const removed = before.filter(k => !found.includes(k))
  await writeConfig($, { ...config, providers: found })
  const count = THEMES.filter(t => found.includes(t.provider)).length
  return [
    `Registered ${found.length} provider(s), ${count} theme(s): ${found.join(', ') || 'none'}.`,
    added.length > 0 ? `New: ${added.join(', ')}.` : 'Nothing new.',
    removed.length > 0 ? `No longer loaded: ${removed.join(', ')}.` : '',
    'A theme plugin not in hooks/registry.ts needs a registry entry before it can be switched.',
    'Remaking the gallery previews from the installed themes in the background (about half a minute).',
  ].filter(Boolean).join('\n')
}

/** Remakes the gallery's stills with tools/thumbs.mjs (Node and Chrome on this machine); says how it went. */
async function remakeArtwork($: EngineInterface): Promise<string> {
  let node = 'node'
  for (const p of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) if (await $.fs.exists(p)) { node = p; break }
  const run = await $.process.run([node, '--no-warnings', `${$.plugin.root}/tools/thumbs.mjs`], { cwd: await thumbsDir($).then(d => d.replace(/\/thumbs$/, '')).catch(() => undefined), timeoutMs: 300000 })
  forgetArtwork()
  const said = (run.stdout.trim() || run.stderr.trim()).split('\n').pop() ?? ''
  return run.exitCode === 0 ? `VibeSwitch: ${said}` : `VibeSwitch: previews not remade (${said || `exit ${run.exitCode}`})`
}

// ---------- changing a layer ----------

async function setLayer($: EngineInterface, layer: Layer, value: string): Promise<string> {
  const before = (await resolve($))?.target
  if (layer === 'session') {
    await $.state.set(SESSION, value)
    sessionOverride = value
  } else {
    const config = await readConfig($)
    if (layer === 'default') config.default = value
    else {
      const key = await projectKey($)
      if (value === '') delete config.projects[key]
      else config.projects[key] = value
    }
    await writeConfig($, config)
  }
  resolved = undefined
  const now = await resolve($)
  const what = value === '' ? 'inherit' : titleOf(value)
  const scope = layer === 'session' ? 'This session' : layer === 'project' ? 'This project' : 'Global default'
  let line = `${scope}: ${what}.`
  if (now === undefined) return `${line} (Config unreadable; nothing switched.)`
  if (now.target !== before || layer === 'session') {
    const target = now.target
    if (target === NONE) {
      await $.theme.clear()
    } else {
      // A command hook can't run another command itself (it would wait on its own turn),
      // so the provider's command runs just after this answer.
      $.clock.after(1, () => {
        void apply($, target)
          .then(problem => { if (problem !== undefined) $.ui.toast(`VibeSwitch: ${problem}`) })
          .catch(err => $.ui.log(`VibeSwitch: ${String(err)}`, { to: 'debug' }))
      })
    }
    line += ` Now showing ${titleOf(target)} (from ${now.from}).`
  } else if (now.from !== layer) {
    line += ` This session keeps ${titleOf(now.target)} (its ${now.from} setting wins).`
  }
  return line
}


// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Switch theme: menu, list, status, default|project|session <theme|inherit|none>, off, refresh',
      argumentHint: '[<n|theme> | list | status | default|project|session <theme|inherit|none> | off | refresh]',
    })
    resolved = undefined
    applyFailed = false
    const result = await next(e)
    const now = await resolve($)
    // 'none' at start sets and clears nothing: the gate already holds the registered themes back.
    // Skip when the chosen plugin already put its own scene up during start (no extra transcript line).
    const already = now !== undefined && standingScene !== '' && standingScene === themeById(now.target)?.scene
    if (now !== undefined && now.target !== NONE && !already) {
      const problem = await apply($, now.target).catch(err => String(err))
      applyFailed = problem !== undefined
      if (problem !== undefined) $.ui.log(`VibeSwitch: ${problem}`, { to: 'debug' })
    }
    return result
  })

  // A plugin that loaded after this one may not have answered at start; try once more when a window attaches.
  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const result = await next(e)
    const now = await resolve($)
    if (applyFailed && now !== undefined && now.target !== NONE) {
      applyFailed = (await apply($, now.target).catch(err => String(err))) !== undefined
    }
    return result
  }).catch(($, e, next) => next(e))

  // The gate: one theme at a time.
  on('theme.set', async ($, e, next) => {
    const providerKey = providerKeyOfPlugin(next.origin.plugin)
    if (providerKey === undefined) return next(e)
    const now = await resolve($)
    if (now === undefined) return next(e)
    const scene = e.backdrop !== undefined && 'scene' in e.backdrop ? e.backdrop.scene : undefined
    if (mayDraw(now.target, providerKey, scene)) {
      if (scene !== undefined) standingScene = scene
      return next(e)
    }
    return { value: { isDrawn: false as const, reason: `held back by VibeSwitch (${titleOf(now.target)} is selected); to show this one, use /vibe` } }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(w => w !== '')
    const head = (words[0] ?? '').toLowerCase()
    const rest = words.slice(1).join(' ')

    if (head === '') return { text: await menuText($, 'Themes:', false) }
    if (head === 'list') return { text: `${await menuText($, 'Available themes:', true)}\n\n${await openGallery($)}` }
    if (head === 'preview' || head === 'gallery') return { text: await openGallery($) }
    if (head === 'status') return { text: await statusText($) }
    if (head === 'refresh') {
      const text = await refresh($)
      $.clock.after(1, () => {
        void remakeArtwork($).then(line => $.ui.toast(line)).catch(err => $.ui.toast(`VibeSwitch: previews not remade (${String(err)})`))
      })
      return { text }
    }
    if (head === 'off') return { text: await setLayer($, 'session', NONE) }

    if (head === 'default' || head === 'project' || head === 'session') {
      if (rest === '') return { text: `Usage: /vibe ${head} <number|theme|none${head === 'default' ? '' : '|inherit'}>` }
      const value = await parseValue($, rest)
      if (value === undefined) return { text: `No theme "${rest}". /vibe list shows them.` }
      if (head === 'default' && value === '') return { text: 'The global default has nothing to inherit from: give a theme or none.' }
      return { text: await setLayer($, head, value) }
    }

    const value = await parseValue($, words.join(' '))
    if (value === undefined) return { text: `No theme or command "${words.join(' ')}".\n\n${await menuText($, 'Themes:', false)}` }
    return { text: await setLayer($, 'session', value) }
  }).catch(() => ({ text: 'VibeSwitch hit an error; /vibe status shows the config path.' }))

  // The gallery: one row per theme with a drawn preview card, grouped and filterable,
  // and buttons that apply it to this session (a live preview), the project or the default.
  on('ui.render', { component: 'Pane', requestId: GALLERY }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const view = await read($, gallery)
    const list = await available($)
    const now = await resolve($)
    const pick = (layer: Layer, id: string) => () => {
      void setLayer($, layer, id)
        .then(line => { $.ui.toast(line); return update($, gallery, g => ({ ...g, tick: g.tick + 1 })) })
        .catch(err => $.ui.toast(`VibeSwitch: ${String(err)}`))
    }
    const setFilter = (filter: string) => () => { void update($, gallery, g => ({ ...g, filter })) }
    const numbered = list.map((t, i) => ({ t, n: i + 1 }))
    const shown = CATEGORIES.filter(c => view.filter === 'all' || view.filter === c.id)
    // Draws at once with the pictures already read (color cards for the rest), then reads the shown categories'
    // pictures and draws again; each picture is read once a session (artwork.ts keeps them).
    const art = new Map<string, string | undefined>()
    if (Svg !== undefined) {
      const wanted = list.filter(t => shown.some(c => c.id === t.category))
      for (const t of wanted) art.set(t.id, peekArtwork(t.id) ?? undefined)
      if (wanted.some(t => peekArtwork(t.id) === undefined)) {
        $.clock.after(1, () => {
          void loadArtwork($, wanted)
            .then(read => (read ? update($, gallery, g => ({ ...g, tick: g.tick + 1 })) : undefined))
            .catch(err => $.ui.log(`VibeSwitch: gallery pictures: ${String(err)}`, { to: 'debug' }))
        })
      }
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text>Active: <Text bold>{now === undefined ? 'unknown' : titleOf(now.target)}</Text>{now === undefined ? '' : ` (from ${now.from})`}</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button key="f-all" label="All" dimColor={view.filter !== 'all'} onPress={setFilter('all')} />
          {CATEGORIES.map(c => (
            <Button key={`f-${c.id}`} label={c.title} dimColor={view.filter !== c.id} onPress={setFilter(c.id)} />
          ))}
          <Button key="inherit" label="Undo session pick" onPress={pick('session', '')} />
          <Button key="none" label="Original look" onPress={pick('session', NONE)} />
        </Box>
        {shown.map(cat => {
          const rows = numbered.filter(x => x.t.category === (cat.id as Category))
          if (rows.length === 0) return <Box key={`c-${cat.id}`} />
          return (
            <Box key={`c-${cat.id}`} flexDirection="column" gap={1}>
              <Text bold>{cat.title} ({rows.length})</Text>
              {rows.map(({ t, n }) => (
                <Box key={`t-${t.id}`} flexDirection="row" gap={1} alignItems="center">
                  {Svg !== undefined && (
                    <Svg source={art.get(t.id) ?? previewSvg(t)} alt={art.get(t.id) !== undefined ? `${t.title}: the theme's own artwork` : `${t.title} colors`} width={CARD.width} height={CARD.height} />
                  )}
                  <Box flexDirection="column" flexShrink={1}>
                    <Text><Text bold>{n}. {t.title}</Text> {tags(t)}{now?.target === t.id ? '  ● active' : ''}</Text>
                    <Text dimColor>{t.blurb}</Text>
                    <Box flexDirection="row" gap={1}>
                      <Button key={`p-${t.id}`} label="Preview" variant="primary" onPress={pick('session', t.id)} />
                      <Button key={`d-${t.id}`} label="Default" dimColor onPress={pick('default', t.id)} />
                      <Button key={`j-${t.id}`} label="Project" dimColor onPress={pick('project', t.id)} />
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  }).catch(($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>VibeSwitch could not draw the gallery. /vibe list shows the themes as text.</Text>
  })
}
