/**
 * OLX Platform Adapter
 *
 * Selectors e parsing para olx.com.br
 */
import { PlatformAdapter } from './base.js'
import { registry } from '../core/registry.js'

class OlxAdapter extends PlatformAdapter {
  get name() { return 'OLX' }
  get key() { return 'olx' }
  get icon() { return '🏷️' }
  /** OLX violet. Derived ramp tints the whole popup while OLX is the target. */
  get brandColor() { return { l: 0.5, c: 0.26, h: 285 } }

  matches(url) {
    return /\.olx\.com\.br\//.test(url)
  }

  get hostPatterns() {
    return ['*://*.olx.com.br/*']
  }

  /**
   * Poll DOM until OLX cards render (SPA).
   * Called by content script before extraction.
   */
  async waitForCards(doc, timeout = 15000) {
    const t0 = Date.now()
    return new Promise((resolve) => {
      const check = () => {
        const found = doc.querySelectorAll('section.olx-adcard')
        if (found.length) return resolve(found.length)
        if (Date.now() - t0 > timeout) return resolve(0)
        requestAnimationFrame(check)
      }
      check()
    })
  }

  parseCards(doc) {
    const cards = doc.querySelectorAll('section.olx-adcard')
    return Array.from(cards, el => this._parseCard(el)).filter(Boolean)
  }

  _parseCard(el) {
    const title = el.querySelector('h2.olx-adcard__title')?.textContent?.trim() ?? ''
    const price = el.querySelector('h3.olx-adcard__price')?.textContent?.trim() ?? ''
    const rawUrl = el.querySelector('a.olx-adcard__link')?.href ?? ''
    const seller = el.querySelector('span[class*="TransactionalSellerRating_transactionalSellerName"]')?.textContent?.trim() ?? ''
    const location = el.querySelector('p.olx-adcard__location')?.textContent?.trim() ?? ''
    const rawImg = el.querySelector('.olx-adcard__media img')?.src ?? ''

    const url = rawUrl.split('?')[0]
    const img = rawImg.split('?')[0]

    if (!url) return null
    return { title, price, url, seller, location, img }
  }

  nextPageUrl(doc, page) {
    const url = new URL(doc.URL)
    url.searchParams.set('o', page + 1)
    return url.toString()
  }

  extractDetail(ad, doc) {
    const { description, adDetail, adDate, adProperties } = this._extractAll(doc.documentElement.innerHTML)
    return { ...ad, description, adDate, adDetail, adProperties }
  }

  /* ── Internals ────────────────────────────────────── */

  _balanceJSON(text, start) {
    let i = start, depth = 0
    do {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    } while (depth > 0 && i < text.length)
    return text.slice(start, i)
  }

  _extractAll(html) {
    let description = ''
    const ldMatch = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i)
    if (ldMatch) {
      try { description = JSON.parse(ldMatch[1].trim()).description ?? '' }
      catch { /* ignore */ }
    }

    let adDetail = {}
    let adDate = ''
    let adProperties = []

    const dlMatch = html.match(/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];?\s*window\.dataLayer\.push\(/)
    if (dlMatch) {
      const start = dlMatch.index + dlMatch[0].length
      const jsonStr = this._balanceJSON(html, start)
      try {
        const parsed = JSON.parse(jsonStr)
        const src = parsed.adDetail ? parsed : (Array.isArray(parsed) ? parsed.find(i => i.adDetail) : null)
        if (src) {
          adDetail = src.adDetail ?? {}
          adDate = src.adDate ?? src.adDetail?.adDate ?? ''
          adProperties = src.adProperties ?? []
        }
      } catch { /* ignore */ }
    }

    return { description, adDetail, adDate, adProperties }
  }
}

const olx = new OlxAdapter()
registry.register(olx)
export default olx
