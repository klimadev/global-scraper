# Global Scraper — Product

## What it is

A Chrome extension that extracts marketplace listing data (ads: title, price,
seller, location, image, detail) from a currently-open search page. The popup
is the entire UI: detects the platform from the active tab, exposes run config,
streams progress, shows a preview, and lets the user download / copy / rerun.

The engine is a multi-platform registry (currently OLX) with one adapter per
marketplace. The popup adapts to whichever platform the user is on.

## Register

**Product / tool** — design serves the task. Users open the popup mid-flow on a
listing page, configure a scrape, and leave with data. Density, speed, and
earned familiarity over decoration. No marketing prose, no hero metrics, no
editorial typography.

## Target users

Scrapers, resellers, market researchers, and analysts in Brazil (pt-BR UI)
doing bulk listing extraction. Power users who care about batch size, timeout,
offset, and goal — they tune these deliberately. They open this dozens of
times a day; every interaction must be fast and predictable.

## Platform = brand

The popup colors itself in the **scrap target's** brand — not the extension's
own brand. When the active tab is on `olx.com.br`, the accent, primary button,
progress bar, and focus rings adopt OLX's violet. A future Mercado Livre adapter
would adopt ML's yellow without touching markup.

This is the single identity-relevant choice in an otherwise restrained tool:
brand-as-accent, not brand-as-surface. One saturated color carries the
interactive surface; everything else stays neutral.

## Strategic design principles

1. **Brand follows target.** One `--brand` token drives every accent. Platform
   adapter owns its brand color; the popup consumes it. No hardcoded accent.
2. **Restrained surface, committed accent.**-neutral near-white surface, ink
   text, violet touches primary actions + state only. Never decorate with it.
3. **States are first-class.** idle / scraping / complete / error / unsupported
   each need a complete, distinct, legible treatment — this is a state machine.
4. **Dense, not cramped.** A 400px popup with real config. Labels visible,
   numbers editable, history collapsible. Density is the virtue here.
5. **Motion conveys state, nothing else.** Progress, state transition, feedback.
   No load choreography, no staggered reveals, no decorative motion.
6. **Reduced motion and contrast are non-negotiable.** ≥4.5:1 body text, real
   focus rings, instant fallback when the OS asks for less motion.

## Anti-references (what this is NOT)

- Not a SaaS dashboard with sidebar + topbar. It is a 400px popup.
- Not a marketing landing page. No hero, no metric cards, no eyebrow kickers.
- Not cream/sand warm-neutral AI default. Surface is neutral; brand carries
  identity.
- Not a glassmorphic card stack. Flat surfaces with one shared radius.
- Not emoji-as-iconography beyond the platform chip (kept as a familiar flag).

## Status

- pt-BR UI strings are in the markup/JS. i18n is a future hardening pass, not
  this design pass.
- Only OLX adapter ships. Theming is built generically so the next adapter
  only provides a brand color.
