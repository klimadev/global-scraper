/**
 * Extraction Engine
 *
 * Platform-agnostic. Give it a PlatformAdapter and it does the rest.
 * Runs inside a page context (content script or console-pasted).
 *
 * Lifecycle:
 *   1. scan listing page (parseCards)
 *   2. paginate (nextPageUrl)
 *   3. enrich each ad (extractDetail, batched)
 *   4. return results
 */
export class ScraperEngine {
  /**
   * @param {PlatformAdapter} adapter
   * @param {object} opts
   * @param {number}  opts.pages     - max pages to scan (default 10)
   * @param {number}  opts.limit     - max total ads (default Infinity)
   * @param {number}  opts.offset    - skip first N ads (default 0)
   * @param {number}  opts.batchSize - detail fetch batch (default 10)
   * @param {number}  opts.timeout   - per-ad fetch timeout ms (default 15000)
   * @param {boolean} opts.minimal   - skip detail fetch (default false)
   * @param {(phase:string, done:number, total:number) => void} onProgress
   */
  constructor(adapter, opts = {}, onProgress = null) {
    this.adapter = adapter
    this.pages = opts.pages ?? 10
    this.limit = opts.limit ?? Infinity
    this.offset = opts.offset ?? 0
    this.batchSize = opts.batchSize ?? 10
    this.timeout = opts.timeout ?? 15000
    this.minimal = opts.minimal ?? false
    this.onProgress = onProgress || (() => {})
  }

  /** Run the full extraction pipeline */
  async run(startUrl = location.href) {
    const ads = await this._collect(startUrl)
    this.onProgress('collect', ads.length, ads.length)
    if (this.minimal || this.limit === 0) return ads
    return this._enrich(ads)
  }

  /* ── Phase 1: collect ads from listing pages ────────── */
  async _collect(startUrl) {
    const all = []
    let url = startUrl
    for (let p = 1; p <= this.pages && all.length < this.limit; p++) {
      const doc = url === startUrl ? document : await this._fetchDoc(url)
      if (!doc) break
      const cards = this.adapter.parseCards(doc)
      if (!cards.length) break
      for (const card of cards) {
        if (all.length >= this.limit) break
        all.push(card)
      }
      this.onProgress('collect', all.length, this.limit)
      url = this.adapter.nextPageUrl(doc, p)
      if (!url) break
    }
    // apply offset
    const sliced = this.offset > 0 ? all.slice(this.offset) : all
    this.onProgress('collect', sliced.length, sliced.length)
    return sliced
  }

  /* ── Phase 2: enrich each ad with detail page data ──── */
  async _enrich(ads) {
    const results = []
    for (let i = 0; i < ads.length; i += this.batchSize) {
      const batch = ads.slice(i, i + this.batchSize)
      const fetched = await Promise.allSettled(
        batch.map(ad => this._fetchDetail(ad))
      )
      for (const f of fetched) {
        results.push(f.status === 'fulfilled' ? f.value : {
          ...f.reason.ad,
          adDetail: { _error: f.reason.message },
        })
      }
      this.onProgress('details', results.length, ads.length)
    }
    return results
  }

  async _fetchDetail(ad) {
    if (!ad.url) return ad
    const doc = await this._fetchDoc(ad.url, this.timeout)
    if (!doc) return { ...ad, adDetail: { _error: 'fetch-failed' } }
    return this.adapter.extractDetail(ad, doc)
  }

  /* ── Fetch helper ───────────────────────────────────── */
  async _fetchDoc(url, timeout = 15000) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const parser = new DOMParser()
      return parser.parseFromString(html, 'text/html')
    } catch (err) {
      return null
    }
  }
}
