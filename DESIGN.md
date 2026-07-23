# Global Scraper — Design

Visual system for the Chrome extension popup. Brand = scrap target. OKLCH
throughout. One fixable file (`popup/popup.css`) plus the platform adapter's
brand color.

## Theme

Light, neutral surface, single committed brand accent. Dense tool register.
Reduced-motion safe. 400px-wide popup; not fluid, fixed sizing at high DPI.

## Color tokens (OKLCH)

Default seed = OLX. The popup sets `--brand` (and its derived ramp) on
`#app` from the detected adapter's `brandColor`. Derivations are functions of
the seed, expressed as static steps so the ramp stays perceptually even and
contrast holds regardless of seed hue.

| Token | OKLCH | Use |
|---|---|---|
| `--brand` | `0.52 0.27 285` | seed — accent default/hover花椒 active/focus-ring/progress/platform-chip-text |
| `--brand-strong` | `0.42 0.28 285` | hover on primary |
| `--brand-press` | `0.36 0.26 285` | active on primary |
| `--brand-soft` | `0.95 0.04 var(--brand-h)` | soft chip/selected-row tint, focus glow |
| `--brand-faint` | `0.97 0.02 var(--brand-h)` | progress track, faint hover |
| `--brand-contrast` | `1 0 0` | text on brand (white) |
| `--bg` | `0.99 0.002 var(--brand-h)` | popup surface |
| `--surface` | `1 0 0` | inset panels (table, history) on hover |
| `--ink` | `0.22 0.01 var(--brand-h)` | body text — ≥4.5:1 on bg |
| `--ink-strong` | `0.16 0.01 var(--brand-h)` | headings |
| `--muted` | `0.52 0.015 var(--brand-h)` | labels, secondary rows — ≥4.5:1 on bg |
| `--line` | `0.90 0.005 var(--brand-h)` | hairlines, control borders |
| `--line-strong` | `0.82 0.008 var(--brand-h)` | control border on hover |
| `--danger` | `0.54 0.21 25` | error text/border |
| `--danger-soft` | `0.96 0.03 25` | error tint |
| `--success` | `0.55 0.15 145` | copy-feedback, complete accent |

`--brand-h` carries the seed hue so neutrals stay slightly tinted toward the
target brand (0.005–0.015 chroma — never the warm-neutral default).

### Seed derivation (per adapter)

Adapter exposes `brandColor` as an OKLCH seed: `{ l, c, h }` or a CSS string.
At runtime the popup sets:

```
--brand-h: <h>;
--brand: oklch(<l> <c> <h>);
```

Strong/press/soft/faint are derived by fixed L/C deltas from the seed, so one
seed produces a coherent ramp. Defined in CSS `:root` and overridden on `#app`.

## Typography

One family. denser, fixed scale.

```
--font: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
--scale: 1.15
```

| Role | Size | Weight | Tracking |
|---|---|---|---|
| popup title | 15px | 650 | -0.01em |
| platform name | 15px | 650 | 0 |
| section label (history summary) | 12px | 600 | 0 |
| field label | 11px | 600 | 0 |
| input value | 13px | 500 | 0 |
| body / result count | 13-14px | 600 | 0 |
| muted secondary | 11px | 500 | 0 |
| table | 12px | 400 | 0 |

`text-wrap: balance` on the popup title and result-count headings.

## Shape & elevation

- Radius scale: `--r-sm 6px` (controls), `--r-md 10px` (panels/preview),
  `--r-lg 14px` (outer app shell), `--r-pill 999px` (platform chip).
- Single hairline border `--line` for controls and panels. No nested borders.
- Elevation: no shadows on idle surfaces. One `--shadow-pop` on the primary
  action only (subtle). Dropdowns/shadows not needed (no portals in popup).
- Focus ring: `0 0 0 3px var(--brand-soft)` with a `--brand` 1.5px inner ring
  drawn by `box-shadow` inset — visible on every interactive element.

## z-index scale

```
--z-base: 1
--z-sticky: 2   (preview thead)
--z-overlay: 10
```

## Components

### Primary button
`--brand` bg, `--brand-contrast` text, `--r-sm`, 8px/?? padding, full-width for
the extract action. hover → `--brand-strong`; active → `--brand-press`;
disabled → `--line-strong` bg, `--muted` text; focus ring; `--shadow-pop` when
not disabled. No gradient.

### Secondary button
transparent bg, `--line` border, `--ink` text; hover `--brand-faint` bg +
`--line-strong` border. Used for copy / delete / retry.

### Link button
no border, `--brand` text, underline on hover.

### Platform chip (header)
pill, `--brand-soft` bg, `--brand` manuscript text, platform icon + name +
version. The single committed-brand surface — identity lives here.

### Form field
top label, number input, `--line` border; focus → `--line` tick 1.5px +
`--brand`, brand-soft glow ring. Row layout: 2-up with 8px gap; the "minimo"
checkbox lives in the grid as its own cell.

### Progress
indeterminate-first: brand spinner, then a `--brand-faint` track with `--brand`
fill, 150ms width transitions. Brand-as-state, motion-conveying.

### Preview table
sticky thead `--surface` bg + `--line` bottom, 12px rows, ellipsis on long
cells, max-height scroll. No zebra; `--brand-faint` hover.

### History
collapsible, list rows: count + platform • timestamp + delete. Subtle.

### States
idle / scraping / complete / error / unsupported. Each owns a distinct
composition but shares the shell, header, and controls. Transitions are state
changes, not page load choreography — fade 160ms only.

## Motion

- All transitions 150–220ms, `ease-out` (cubic-bezier(.2, .8, .2, 1)).
- Spinner: 800ms linear (standard).
- Progress bar: 200ms width.
- State-swaps: opacity 160ms crossfade (not gated on a class reveal — content
  is visible by default; the transition enhances, never gates).
- `@media (prefers-reduced-motion: reduce)`: spinner → static ring with pulse;
  width/opacity transitions → instant; the only motion left is a 1.5s opacity
  pulse on the progress "active" pill so the user still sees "working".

## Accessibility

- All interactive controls keyboard-reachable, real focus rings, 44px-clickable
  targets minimized but inputs/buttons ≥ 32px height.
- `aria-live` polite on progress-text and copy-feedback so screen readers
  announce state.
- Color contrast ≥4.5:1 body, ≥3:1 large; placeholder text uses `--muted`
  (verified ≥4.5:1, not gray-on-tint).
- `role="status"` on the scraping state region.
- Error messages associated to the form via `aria-describedby`.

## Responsive

Popup is fixed-400px. No breakpoints. Only guard: long titles/locations in the
preview use ellipsis; long result-count copy stays under the shell width.
Heading overflow tested at the popup width (no clamp scaling needed).
