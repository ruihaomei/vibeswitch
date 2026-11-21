// A small drawn card per theme for the gallery pane: a mock app window in the theme's own colors
// (page, sidebar, lines of text, the accent where it has one), with marks for pointer and sound.
// It is a color preview; the Preview button shows the real, animated theme.

import type { Theme } from './registry'

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0)
}

const inkOn = (bg: string) => (luminance(bg) > 0.35 ? '#2b2a28' : '#eeeae2')
const shade = (bg: string) => (luminance(bg) > 0.35 ? '#000000' : '#ffffff')

/** One half of the window: page, sidebar and text lines on `bg`. */
function windowPart(bg: string, accent: string | undefined, clip: string): string {
  const ink = inkOn(bg)
  return `<g clip-path="url(#${clip})">`
    + `<rect width="120" height="72" fill="${bg}"/>`
    + `<rect width="26" height="72" fill="${shade(bg)}" fill-opacity="0.07"/>`
    + `<rect x="5" y="8" width="16" height="3" rx="1.5" fill="${ink}" fill-opacity="0.35"/>`
    + `<rect x="5" y="15" width="12" height="3" rx="1.5" fill="${ink}" fill-opacity="0.25"/>`
    + `<rect x="36" y="14" width="64" height="4" rx="2" fill="${ink}" fill-opacity="0.75"/>`
    + `<rect x="36" y="23" width="52" height="4" rx="2" fill="${ink}" fill-opacity="0.5"/>`
    + `<rect x="36" y="32" width="58" height="4" rx="2" fill="${ink}" fill-opacity="0.5"/>`
    + `<rect x="36" y="54" width="74" height="10" rx="5" fill="${shade(bg)}" fill-opacity="0.08" stroke="${accent ?? ink}" stroke-opacity="0.6"/>`
    + (accent !== undefined ? `<circle cx="104" cy="59" r="3" fill="${accent}"/>` : '')
    + `</g>`
}

export function previewSvg(theme: Theme): string {
  const [first = '#888888', second, third] = theme.colors
  const both = theme.mode === 'both'
  const accent = both ? third : second
  const parts = both
    ? windowPart(first, accent, 'k-all') + windowPart(second ?? first, accent, 'k-half')
    : windowPart(first, accent, 'k-all')
  const ink = inkOn(first)
  const marks = (theme.category === 'interactive' ? '<path d="M8 50 l0 14 l4 -4 l3 6 l2 -1 l-3 -6 l5 0 z" fill="#ffffff" stroke="#222222" stroke-width="0.8"/>' : '')
    + (theme.sound === true ? `<text x="8" y="44" font-size="10" fill="${ink}" fill-opacity="0.8">♪</text>` : '')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72" width="120" height="72">`
    + `<defs><clipPath id="k-all"><rect width="120" height="72" rx="6"/></clipPath>`
    + `<clipPath id="k-half"><path d="M120 0 L120 72 L40 72 Z"/></clipPath></defs>`
    + parts + marks
    + `<rect x="0.5" y="0.5" width="119" height="71" rx="6" fill="none" stroke="#808080" stroke-opacity="0.4"/>`
    + `</svg>`
}
