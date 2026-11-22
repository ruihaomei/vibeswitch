export type Gallery = { filter: string; tick: number }

declare module 'claude-code' {
  interface PluginState {
    'vibeswitch': {
      /** This session's override: a theme id, 'none', or '' for inherit. */
      session: string
      /** The gallery pane's filter and redraw counter. */
      gallery: Shaped<Gallery>
    }
  }
}
