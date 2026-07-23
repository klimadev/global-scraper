/**
 * Platform Adapter Base
 *
 * Each marketplace implements this interface.
 * The engine calls these methods polymorphically.
 */
export class PlatformAdapter {
  /** Human-readable name */
  get name() { throw new Error('implement name') }
  /** Short key like 'olx' */
  get key() { throw new Error('implement key') }
  /** Icon emoji or path */
  get icon() { return '🌐' }
  /**
   * Brand color as an OKLCH seed { l, c, h }. The popup derives the full
   * accent ramp from this single seed. Override per platform.
   */
  get brandColor() { return { l: 0.52, c: 0.27, h: 285 } }

  /**
   * Check if this adapter handles the given URL.
   * Called on every page — keep it cheap.
   */
  matches(url) { throw new Error('implement matches(url)') }

  /**
   * Extract ad cards from the current listing page document.
   * Returns array of raw card objects { title, price, url, ... }.
   */
  parseCards(doc) { throw new Error('implement parseCards(doc)') }

  /**
   * Return the next-page URL, or null if at last page.
   * Receives current document and current page number (1-based).
   */
  nextPageUrl(doc, page) { return null }

  /**
   * Extract full details from a single ad page.
   * Receives the ad's parsed card + the detail page document.
   * Returns enriched ad object.
   */
  extractDetail(ad, doc) { return ad }

  /**
   * Default config form fields shown in popup.
   * Override to add platform-specific options.
   */
  getConfig() {
    return {
      minimal: true,
      batchSize: 20,
      timeout: 15000,
    }
  }

  /**
   * Host patterns for host_permissions manifest.
   */
  get hostPatterns() {
    return []
  }
}
