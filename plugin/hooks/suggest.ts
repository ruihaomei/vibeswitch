// What the prompt box offers after `/vibe `: the subcommands, then scenes, matched by name or by mood word
// ("rain", "night", "paper", "koi"), so nobody has to remember an exact name. Pure, so it is tested on its own.

import type { PromptAutocompleteSuggestion } from 'claude-code'
import { CATEGORIES, type Theme } from './registry'

export const ACTIONS: readonly { word: string; about: string }[] = [
  { word: 'preview', about: 'Open the gallery: pictures and buttons' },
  { word: 'status', about: "What's showing now, and why" },
  { word: 'default', about: 'Use a scene in every session' },
  { word: 'project', about: 'Use a scene whenever you work in this folder' },
  { word: 'session', about: 'Use a scene in this session only' },
  { word: 'off', about: 'No scene in this session' },
  { word: 'list', about: 'Numbered list with a line on each scene' },
  { word: 'refresh', about: 'Look again for installed theme plugins' },
]

const LIMIT = 8

/** How well `theme` answers `word` (lower is better), or undefined for not at all. */
function rank(theme: Theme, word: string): number | undefined {
  if (theme.id.startsWith(word)) return 0
  if (theme.title.toLowerCase().split(/[\s,]+/).some(w => w.startsWith(word))) return 1
  const category = CATEGORIES.find(c => c.id === theme.category)?.title.toLowerCase() ?? ''
  if (word.length >= 3 && (theme.id.includes(word) || category.includes(word))) return 2
  if (word.length >= 3 && theme.blurb.toLowerCase().includes(word)) return 3
  return undefined
}

const row = (t: Theme): PromptAutocompleteSuggestion => ({ text: t.id, label: t.title, description: t.blurb })

function scenes(list: readonly Theme[], word: string): PromptAutocompleteSuggestion[] {
  return list
    .map((t, i) => ({ t, i, r: rank(t, word) }))
    .filter((x): x is { t: Theme; i: number; r: number } => x.r !== undefined)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => row(x.t))
}

/**
 * The rows for the token being typed, or undefined when the box isn't a `/vibe` command.
 * `before` is the draft up to the token, `token` the word at the cursor.
 */
export function vibeSuggestions(list: readonly Theme[], before: string, token: string): PromptAutocompleteSuggestion[] | undefined {
  const m = /^\s*\/vibe\s+((?:\S+\s+)*)$/i.exec(before)
  if (m === null) return undefined
  const words = (m[1] ?? '').trim().split(/\s+/).filter(w => w !== '').map(w => w.toLowerCase())
  const word = token.toLowerCase()
  if (words.length === 0) {
    const actions = ACTIONS.filter(a => a.word.startsWith(word)).map(a => ({ text: a.word, description: a.about }))
    return [...actions, ...scenes(list, word)].slice(0, LIMIT)
  }
  const head = words[0]
  if (words.length === 1 && (head === 'default' || head === 'project' || head === 'session')) {
    const extra = [{ text: 'none', description: 'No scene' }, ...(head === 'default' ? [] : [{ text: 'inherit', description: 'Undo this pick' }])]
    return [...extra.filter(x => x.text.startsWith(word)), ...scenes(list, word)].slice(0, LIMIT)
  }
  return []
}
