// The gate's rule, kept pure so it can be tested on its own.
import { PROVIDERS, THEMES } from './registry'

export const NONE = 'none'

export function providerKeyOfPlugin(plugin: string): string | undefined {
  return Object.keys(PROVIDERS).find(key => PROVIDERS[key]?.plugin === plugin)
}

/** Whether a theme.set from `plugin` with `scene` may stand while `target` is selected. */
export function mayDraw(target: string, providerKey: string, scene: string | undefined): boolean {
  if (target === NONE) return false
  const theme = THEMES.find(t => t.id === target)
  if (theme === undefined || theme.provider !== providerKey) return false
  // Another known scene of the same provider (e.g. Backdrops' own default) is held back;
  // unknown scenes of the chosen provider (previews, overlays) pass.
  const otherKnown = scene !== undefined && scene !== theme.scene && THEMES.some(t => t.provider === providerKey && t.scene === scene)
  return !otherKnown
}

