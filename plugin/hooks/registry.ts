// The theme registry. To support a new theme:
//  - a theme of a provider already listed: add one line to THEMES;
//  - a theme from a new plugin: add a provider (its plugin name, its own
//    slash command, and the arguments that turn one theme on for this session),
//    then its themes.
// `scene` is the backdrop scene name the plugin passes to $.theme.set; the
// switcher uses it to stop a provider's other scenes from overlapping.

export type Provider = {
  /** The plugin's name, as `next.origin.plugin` reports it. */
  plugin: string
  /** The plugin's own slash command, without the slash. */
  command: string
  /** Arguments to that command that show `themeId` (in this session where the plugin allows it). */
  activate: (themeId: string) => string
  /** One line on how the plugin keeps its own choice. */
  note: string
}

export type Category = 'adaptive' | 'cinematic' | 'light' | 'dark' | 'interactive'

/** List order and headings. */
export const CATEGORIES: readonly { id: Category; title: string }[] = [
  { id: 'adaptive', title: 'Follows light & dark mode' },
  { id: 'cinematic', title: 'Cinematic dusk & night' },
  { id: 'light', title: 'Light & paper' },
  { id: 'dark', title: 'Night & dark' },
  { id: 'interactive', title: 'Interactive (pointer, some with sound)' },
]

export type Theme = {
  id: string
  title: string
  provider: string
  /** The backdrop scene name the plugin passes to $.theme.set. */
  scene: string
  category: Category
  /** Which window it is made for; 'both' follows the app's own mode. */
  mode: 'light' | 'dark' | 'both'
  /** Preview colors: page (light and dark for 'both'), then an accent where the theme has one. */
  colors: readonly string[]
  blurb: string
  sound?: boolean
}

export const PROVIDERS: Readonly<Record<string, Provider>> = {
  'rainy-window': {
    plugin: 'rainy-window',
    command: 'rainy-window',
    activate: () => 'on',
    note: 'One theme; /rainy-window off persists across sessions, so the switcher sends "on" when it is chosen.',
  },
  'garden-theme': {
    plugin: 'garden-theme',
    command: 'garden',
    activate: () => '',
    note: 'One theme; always sets itself at session start and on window attach.',
  },
  backdrops: {
    plugin: 'backdrops',
    command: 'backdrops',
    activate: id => `${id} session`,
    note: 'Picker; keeps its own default (Reaching unless changed). The switcher uses session-only picks.',
  },
  'theme-examples': {
    plugin: 'theme-examples',
    command: 'custom-theme',
    activate: id => `${id} session`,
    note: 'Official examples (0.6.0, 38 themes, from anthropics/claude-plugins-official); keeps per-project and per-session choices. The switcher uses session-only picks.',
  },
}

type Extra = { sound?: boolean }

const backdrop = (id: string, title: string, colors: readonly string[], blurb: string, extra: Extra = {}): Theme =>
  ({ id, title, provider: 'backdrops', scene: id, category: 'cinematic', mode: 'dark', colors, blurb, ...extra })

const example = (id: string, title: string, category: Category, mode: 'light' | 'dark', tint: string, blurb: string, extra: Extra = {}): Theme =>
  ({ id, title, provider: 'theme-examples', scene: id, category, mode, colors: [tint], blurb, ...extra })

export const THEMES: readonly Theme[] = [
  // Follows the app's mode
  { id: 'rainy-window', title: 'Rainy Window', provider: 'rainy-window', scene: 'rainy-window', category: 'adaptive', mode: 'both',
    colors: ['#E9E3D6', '#12142A', '#5562C9'], blurb: "Clawd's room on a rainy day in halftone dots: rain at the window, a record spinning." },
  // A light paper theme with live dials
  { id: 'garden', title: 'Garden', provider: 'garden-theme', scene: 'garden', category: 'light', mode: 'light',
    colors: ['#efe6d3', '#2f5d8c'], blurb: 'Cream paper, four hand-drawn dials with live session figures, a tree that grows.' },
  // Cinematic dusk & night: the Backdrops picker
  backdrop('reaching', 'Reaching', ['#000000', '#d8dde6'], 'Two hands in dots; a wave turns them to ASCII. Artwork by @samdape.'),
  backdrop('magenta-hour', 'Magenta Hour', ['#0d0a1c', '#ff7a93'], 'A synthwave Miami dusk: palms, a causeway, the sun going down over a violet bay.', { sound: true }),
  backdrop('after-hours', 'After Hours', ['#08071a', '#4fd8ff'], 'A synthwave Miami night: the city lit up across the bay, seen from a rooftop.'),
  backdrop('crossing-hour', 'Crossing Hour', ['#09091c', '#ffad6e'], 'Tower Bridge at sunset: a cyclist rides out of the sun and across, on a loop.'),
  backdrop('promenade', 'Promenade', ['#0d0a1c', '#ff9a86'], 'The Brooklyn Bridge at dusk: a cyclist rides the promenade toward the sun, on a loop.'),
  backdrop('coast-road', 'Coast Road', ['#0b0a1c', '#ffb877'], 'Bixby Creek Bridge, Big Sur, at sunset: a cyclist rides north toward the sun setting…'),
  backdrop('ocean-road', 'Ocean Road', ['#071019', '#f2c79a'], 'The Atlantic Ocean Road in Norway at dusk: a cyclist rides the long curve.'),
  backdrop('fractal-glass', 'Fractal Glass', ['#04070c', '#5a9ef5'], 'A blue glow drifts behind fluted glass.'),
  backdrop('night-hearth', 'Night Hearth', ['#070504', '#f07a32'], 'A warm glow breathes in the corner of a dark, grainy screen.'),
  // Light & paper: official examples made for light windows
  example('honu-lagoon', 'Honu Lagoon', 'light', 'light', '#e6fbff', 'A live ASCII lagoon from above: a tile turtle swims by a sand island'),
  example('koi-mosaic', 'Koi Mosaic', 'light', 'light', '#eef8f1', 'A tiled koi pond from above: two koi, lily pads, slow ripples.'),
  example('halftone-dawn', 'Halftone Dawn', 'light', 'light', '#f6ead9', 'A two-ink riso sunrise: halftone dots that breathe outward.'),
  example('plotter-tide', 'Plotter Tide', 'light', 'light', '#f4efe4', 'Pen-plotter tide lines drawing themselves on warm paper.'),
  example('dither-dunes', 'Dither Dunes', 'light', 'light', '#f1e8d6', 'One-bit dunes on sand paper, shaded in dots, under a terracotta sun'),
  example('paper-garden', 'Paper Garden', 'light', 'light', '#fbf6ec', 'Cut-paper leaves at the edges of a warm white sheet, one coral bloom.'),
  // Night & dark: official examples made for dark windows
  example('halftone-dusk', 'Halftone Dusk', 'dark', 'dark', '#1f2336', 'The riso sunrise on night-blue stock: an ember sun in breathing dots.'),
  example('plotter-tide-night', 'Plotter Tide, Night', 'dark', 'dark', '#141a27', 'The plotter\'s tide chart in pale ink on blue-black night paper.'),
  example('dither-dunes-night', 'Dither Dunes Night', 'dark', 'dark', '#1c1712', 'The same dunes after dark: pale dots on umber, an ember sun'),
  example('paper-garden-kraft', 'Paper Garden, Kraft', 'dark', 'dark', '#35312a', 'Cut-paper leaves at the edges of dark kraft paper, one coral bloom.'),
  example('night-reef', 'Night Reef', 'dark', 'dark', '#0a1430', 'The lagoon after dark: a turtle and a ray that glow as they swim'),
  example('snow-pines', 'Snow Pines', 'dark', 'dark', '#14143a', 'An ASCII pine forest at dusk, snow drifting down through the trees.'),
  example('braille-stars', 'Braille Stars', 'dark', 'dark', '#0a1430', 'A slow night sky drawn dot by dot on a braille grid.'),
  example('teletext-clouds', 'Block Clouds', 'dark', 'dark', '#0d173f', 'Night clouds built from blocks on a teletext grid, drifting in'),
  example('vector-range', 'Vector Range', 'dark', 'dark', '#0e2f27', 'Phosphor mountains on black; an amber beam keeps retracing them.'),
  example('departure-board', 'Departure Board', 'dark', 'dark', '#1a120b', 'An amber LED board re-lettering itself, row by row.'),
  example('blueprint', 'Blueprint', 'dark', 'dark', '#0c2444', 'A cyanotype sheet; a comet goes round its plotted orbit in the corner.'),
  example('deep-water', 'Deep Water', 'dark', 'dark', '#062c3a', 'Light falling through deep water, and one quiet turtle'),
  example('aurora', 'Aurora', 'dark', 'dark', '#14123a', 'Northern lights swaying over a dark ridge'),
  example('ember', 'Ember', 'dark', 'dark', '#2a0d12', 'A warm glow in the corners and a few embers rising'),
  // Interactive: shader scenes that answer the pointer (two with sound), each in a light and a night version
  example('duck-pond', 'Duck Pond', 'interactive', 'light', '#e8ecd9', 'Rubber ducks on a pixel pond, and a press drops bugs for them to eat.'),
  example('duck-pond-night', 'Duck Pond, Night', 'interactive', 'dark', '#0f2433', 'Rubber ducks on a pixel pond, and a press drops bugs for them to eat.'),
  example('falling-sand', 'Falling Sand', 'interactive', 'light', '#f5ebd6', 'Pixel sand pours down stone shelves, and a press pours more.', { sound: true }),
  example('falling-sand-night', 'Falling Sand, Night', 'interactive', 'dark', '#1c1424', 'Pixel sand pours down stone shelves, and a press pours more.', { sound: true }),
  example('field-lines', 'Field Lines', 'interactive', 'light', '#f3f1e7', 'A magnetic field drawn in short dashes that turn toward your pointer.'),
  example('field-lines-night', 'Field Lines, Night', 'interactive', 'dark', '#22282b', 'A magnetic field drawn in short dashes that turn toward your pointer.'),
  example('garden-beetles', 'Garden Beetles', 'interactive', 'light', '#ece5d3', 'Pixel beetles on a garden path that hide when your pointer comes near.'),
  example('garden-beetles-night', 'Garden Beetles, Night', 'interactive', 'dark', '#27393a', 'Pixel beetles on a garden path that hide when your pointer comes near.'),
  example('koi-pond', 'Koi Pond', 'interactive', 'light', '#d7e4e0', 'A pond from above with ripples at your pointer and koi fed by a press.', { sound: true }),
  example('koi-pond-night', 'Koi Pond, Night', 'interactive', 'dark', '#0e1824', 'A pond from above with ripples at your pointer and koi fed by a press.', { sound: true }),
  example('ripple-tank', 'Ripple Tank', 'interactive', 'light', '#d6e7e0', 'Water striders on a printed pond, where your pointer sends out rings.'),
  example('ripple-tank-night', 'Ripple Tank, Night', 'interactive', 'dark', '#112e34', 'Water striders on a printed pond, where your pointer sends out rings.'),
  example('sea-sparkle', 'Sea Sparkle', 'interactive', 'light', '#ecf0ee', 'A night sea in three inks, where your pointer stirs plankton to glow.'),
  example('sea-sparkle-night', 'Sea Sparkle, Night', 'interactive', 'dark', '#090e1c', 'A night sea in three inks, where your pointer stirs plankton to glow.'),
  example('semicolony', 'Semicolony', 'interactive', 'light', '#f1ece0', 'Code punctuation living as small creatures, magnified at your pointer.'),
  example('semicolony-night', 'Semicolony, Night', 'interactive', 'dark', '#13161c', 'Code punctuation living as small creatures, magnified at your pointer.'),
  example('star-chart', 'Star Chart', 'interactive', 'light', '#ece2ca', 'An engraved sky map that links nearby stars to your pointer.'),
  example('star-chart-night', 'Star Chart, Night', 'interactive', 'dark', '#101b30', 'An engraved sky map that links nearby stars to your pointer.'),
]
