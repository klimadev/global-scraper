/**
 * Platform Registry
 *
 * Auto-detects the right adapter for any URL.
 * Each adapter registers itself once imported.
 */
export class PlatformRegistry {
  constructor() {
    this._adapters = []
  }

  /** Register an adapter instance */
  register(adapter) {
    this._adapters.push(adapter)
  }

  /** Find adapter that matches the given URL */
  detect(url) {
    return this._adapters.find(a => a.matches(url)) || null
  }

  /** All registered adapters */
  get all() {
    return this._adapters
  }

  /** Get by key */
  get(key) {
    return this._adapters.find(a => a.key === key) || null
  }

  /**
   * Union of all host patterns for manifest.
   * Call at build-time or add via script.
   */
  get allHostPatterns() {
    return this._adapters.flatMap(a => a.hostPatterns)
  }
}

/** Singleton */
export const registry = new PlatformRegistry()
