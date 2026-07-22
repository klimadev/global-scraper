/**
 * Content Script — Manifest V3
 *
 * Minimal loader: detect platform, import adapter, run engine.
 * No duplicated scraper code — delegates to core + adapter.
 */
(async () => {
  const { registry } = await import(chrome.runtime.getURL('core/registry.js'))
  const { ScraperEngine } = await import(chrome.runtime.getURL('core/engine.js'))

  // lazy import — side-effect registers adapter in registry
  await import(chrome.runtime.getURL('platforms/olx.js'))

  const adapter = registry.detect(location.href)
  if (!adapter) {
    console.log('[Scraper] Nenhum adaptador para esta página:', location.hostname)
    return
  }

  console.log(`[Scraper] Adaptador: ${adapter.name}`)

  // ── SPA guard: wait for cards to render ─────────────
  if (typeof adapter.waitForCards === 'function') {
    const found = await adapter.waitForCards(document)
    if (!found) {
      chrome.runtime.sendMessage({ type: 'error', message: 'Nenhum anúncio encontrado na página.' })
      return
    }
  }

  // ── Message listener (triggered by popup → background) ─
  if (!globalThis.__scraperListenerRegistered) {
    globalThis.__scraperListenerRegistered = true

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type !== 'start') return

      const engine = new ScraperEngine(adapter, msg.options || {}, (phase, done, total) => {
        chrome.runtime.sendMessage({
          type: phase === 'collect' ? 'collectprogress' : 'progress',
          done, total,
        })
      })

      engine.run(location.href)
        .then(results => {
          chrome.runtime.sendMessage({ type: 'complete', results, count: results.length })
        })
        .catch(err => {
          chrome.runtime.sendMessage({ type: 'error', message: err.message || 'Erro na extração' })
        })

      sendResponse({ ok: true })
      return true
    })
  }
})()
