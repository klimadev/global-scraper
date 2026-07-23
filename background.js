/**
 * Background Service Worker (MV3)
 *
 * Generic state machine — platform-agnostic.
 * State lives here, not in popup.
 */

// Static imports — dynamic import() is disallowed in MV3 service workers.
import { registry } from './core/registry.js'
import './platforms/olx.js' // self-registers adapters into the registry
// relying on the import keeps tree-shake from dropping side-effectful registration

// ── State ──────────────────────────────────────────────
const state = {
  status: 'idle',       // idle | scraping | complete | error
  phase: null,
  goal: Infinity,
  minimal: true,
  done: 0,
  total: 0,
  results: null,
  error: null,
  activeTabId: null,
  platform: null,
}

const popupPorts = new Set()

function broadcastUpdate() {
  const snapshot = {
    type: 'update',
    state: {
      ...state,
      // only ship results on complete — keep live updates light
      results: state.status === 'complete' ? state.results : undefined,
    },
  }
  for (const p of popupPorts) {
    try { p.postMessage(snapshot) } catch { popupPorts.delete(p) }
  }
}

function setState(partial) {
  Object.assign(state, partial)
  broadcastUpdate()
}

// ── Port connections (popup ↔ background) ─────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'scraper') return
  popupPorts.add(port)
  port.postMessage({ type: 'update', state: { ...state, results: undefined } })

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'start':
        handleStart(port, msg.options)
        break
      case 'deleteHistory':
        deleteHistoryEntry(msg.id)
        break
      case 'getHistory':
        loadHistory().then(entries => port.postMessage({ type: 'history', entries }))
        break
      case 'getHistoryData':
        loadHistoryData(msg.id).then(entry =>
          port.postMessage({ type: 'historyData', entry }))
        break
    }
  })

  port.onDisconnect.addListener(() => popupPorts.delete(port))
})

// ── Start extraction ──────────────────────────────────
async function handleStart(port, options) {
  const opts = options || {}
  // map popup fields → engine fields
  const engineOpts = {
    limit: opts.goal === undefined || opts.goal === Infinity || Number.isNaN(opts.goal)
      ? Infinity
      : Math.max(1, Math.floor(opts.goal)),
    offset: Math.max(0, Math.floor(opts.offset) || 0),
    batchSize: Math.max(1, Math.floor(opts.batchSize) || 20),
    timeout: Math.min(120000, Math.max(1000, Math.floor(opts.timeout) || 15000)),
    minimal: !!opts.minimal,
    // generous page cap; limit trims the actual count
    pages: 200,
  }
  // store normalized params on state for history + popup, persist last-used
  state.goal = engineOpts.limit
  state.minimal = engineOpts.minimal
  state.options = { goal: opts.goal, offset: opts.offset, batchSize: opts.batchSize, timeout: opts.timeout, minimal: opts.minimal }
  chrome.storage.local.set({
    lastOptions: {
      goal: String(opts.goal ?? ''),
      offset: String(opts.offset ?? 0),
      batchSize: String(opts.batchSize ?? 20),
      timeout: String(opts.timeout ?? 15000),
      minimal: engineOpts.minimal,
    },
  })
  setState({ status: 'scraping', phase: 'collect', error: null, results: null, done: 0, total: 0 })

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs.length) {
    setState({ status: 'error', error: 'Nenhuma aba ativa encontrada.' })
    return
  }
  state.activeTabId = tabs[0].id

  // detect platform from URL
  state.platform = registry.detect(tabs[0].url)?.key ?? null
  setState({ ...state })

  // inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['content.js'],
    })
  } catch {
    setState({ status: 'error', error: 'Não foi possível injetar o script. Navegue para uma página compatível.' })
    return
  }

  // send start message
  try {
    const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'start', options: engineOpts })
    if (!resp?.ok) throw new Error('no response')
  } catch {
    setState({ status: 'error', error: 'Content script não respondeu. Recarregue a página.' })
  }
}

// ── Messages from content script ───────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab) return

  switch (msg.type) {
    case 'collectprogress':
      setState({ phase: 'collect', done: msg.done, total: msg.total })
      break
    case 'progress':
      setState({ phase: 'details', done: msg.done, total: msg.total })
      break
    case 'complete':
      setState({ status: 'complete', phase: null, results: msg.results, done: msg.count, total: msg.count })
      saveHistoryEntry(msg.count, state.goal, msg.results)
      break
    case 'error':
      setState({ status: 'error', error: msg.message })
      break
  }
})

// ── Download handler ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'download' || !sender.tab) return
  const blob = new Blob([JSON.stringify(msg.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  chrome.downloads.download({ url, filename: msg.filename || 'scraper-results.json', saveAs: true })
    .catch(err => {
      if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'error', message: `Falha ao baixar: ${err.message}` })
      URL.revokeObjectURL(url)
    })
})

// ── History ────────────────────────────────────────────
function saveHistoryEntry(count, goal, results) {
  chrome.storage.local.get({ history: [] }, ({ history }) => {
    history.unshift({
      id: Date.now().toString(36),
      platform: state.platform || 'unknown',
      count,
      goal: Number.isFinite(goal) ? goal : '∞',
      timestamp: Date.now(),
      data: results,
    })
    if (history.length > 50) history.length = 50
    chrome.storage.local.set({ history })
  })
}

function deleteHistoryEntry(id) {
  chrome.storage.local.get({ history: [] }, ({ history }) => {
    chrome.storage.local.set({ history: history.filter(e => e.id !== id) })
  })
}

async function loadHistory() {
  const { history } = await chrome.storage.local.get({ history: [] })
  // strip the heavy per-entry data payload — the list view only needs metadata
  // (sending 50 × full result sets through postMessage would stall the popup)
  return history.map(e => ({
    id: e.id,
    platform: e.platform,
    count: e.count,
    goal: e.goal,
    timestamp: e.timestamp,
  }))
}

// Load a single full entry (with its result data) on demand — to re-open,
// download, or copy a past extraction without hauling all 50 over the port.
async function loadHistoryData(id) {
  const { history } = await chrome.storage.local.get({ history: [] })
  return history.find(e => e.id === id) || null
}

// ── Tab close: auto-reset ─────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.activeTabId) {
    setState({ status: 'idle', phase: null, activeTabId: null, platform: null })
  }
})
