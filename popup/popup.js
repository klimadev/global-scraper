// ── State ────────────────────────────────────────────────
const STATE = { IDLE: 'idle', SCRAPING: 'scraping', COMPLETE: 'complete', ERROR: 'error' }
let currentState = STATE.IDLE
let port = null
let lastResults = null

const $ = (id) => document.getElementById(id)
const show = (el) => { if (el) el.hidden = false }
const hide = (el) => { if (el) el.hidden = true }

const app = $('app')
const form = $('scrape-form')
const btnExtract = $('btn-extract')
const formError = $('form-error')

const stateUnsupported = $('state-unsupported')
const unsupportedMsg = $('unsupported-msg')
const stateIdle = $('state-idle')
const stateScraping = $('state-scraping')
const stateComplete = $('state-complete')
const stateError = $('state-error')

const brandChip = $('brand-chip')
const platformIcon = $('platform-icon')
const platformName = $('platform-name')
const platformVersion = $('platform-version')
const progressBar = $('progress-bar')
const progressCount = $('progress-count')
const progressText = $('progress-text')
const resultCount = $('result-count')
const previewBody = $('preview-body')
const errorMessage = $('error-message')
const copyFeedback = $('copy-feedback')

// ── Brand theming ───────────────────────────────────────
// Derive the accent ramp from the detected platform's seed and inject on #app.
function applyBrand(seed) {
  if (!seed) return
  const { l, c, h } = seed
  app.style.setProperty('--brand-h', String(h))
  app.style.setProperty('--brand', `oklch(${l} ${c} ${h})`)
  app.style.setProperty('--brand-strong', `oklch(${Math.max(0.15, l - 0.08)} ${c} ${h})`)
  app.style.setProperty('--brand-press', `oklch(${Math.max(0.12, l - 0.14)} ${Math.max(0, c - 0.01)} ${h})`)
  const softL = Math.min(0.97, l + 0.46)
  app.style.setProperty('--brand-soft', `oklch(${softL} ${Math.max(0.02, c * 0.13)} ${h})`)
  const faintL = Math.min(0.99, l + 0.49)
  app.style.setProperty('--brand-faint', `oklch(${faintL} ${Math.max(0.01, c * 0.07)} ${h})`)
}

// ── Form validation ─────────────────────────────────────
function getOptions() {
  const goal = parseInt($('goal').value) || Infinity
  const offset = parseInt($('offset').value) || 0
  const batchSize = parseInt($('batchSize').value) || 20
  const timeout = parseInt($('timeout').value) || 15000
  const minimal = $('minimal').checked

  if (goal < 1) { showFormError('Objetivo deve ser ≥ 1'); return null }
  if (batchSize < 1) { showFormError('Lote deve ser ≥ 1'); return null }
  if (timeout < 1000) { showFormError('Timeout mínimo é 1000ms'); return null }
  if (timeout > 120000) { showFormError('Timeout máximo é 120000ms'); return null }

  hideFormError()
  return { goal, offset, batchSize, timeout, minimal }
}

function showFormError(msg) { formError.textContent = msg; show(formError) }
function hideFormError() { hide(formError) }

// ── UI state ─────────────────────────────────────────────
function setUIState(s) {
  currentState = s
  ;[stateUnsupported, stateIdle, stateScraping, stateComplete, stateError].forEach(hide)
  switch (s) {
    case STATE.IDLE: show(stateIdle); break
    case STATE.SCRAPING: show(stateScraping); break
    case STATE.COMPLETE: show(stateComplete); break
    case STATE.ERROR: show(stateError); break
  }
  app.dataset.state = s
}

function onProgress(phase, done, total) {
  const finiteTotal = Number.isFinite(total) && total > 0 ? total : null
  const pb = document.getElementById('progress-bar') || progressBar
  if (finiteTotal) {
    const pct = Math.min(100, Math.round((done / finiteTotal) * 100))
    pb.classList.remove('indeterminate')
    pb.style.width = pct + '%'
    progressCount.textContent = `${done} / ${finiteTotal}`
  } else {
    pb.classList.add('indeterminate')
    pb.style.width = ''
    progressCount.textContent = String(done)
  }
  progressText.textContent = phase === 'collect' ? 'Coletando anúncios…' : 'Buscando detalhes…'
}

function onComplete(results) {
  lastResults = results
  const n = results.length
  resultCount.textContent = `${n} resultado${n !== 1 ? 's' : ''}`
  renderPreview(results)
  setUIState(STATE.COMPLETE)
}

function renderPreview(results) {
  previewBody.innerHTML = results.slice(0, 50).map(ad =>
    `<tr><td title="${esc(ad.title || '')}">${esc(ad.title || '-')}</td>` +
    `<td>${esc(ad.price || '-')}</td>` +
    `<td>${esc(ad.location || ad.seller || '-')}</td></tr>`
  ).join('')
}

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

function onError(msg) {
  errorMessage.textContent = msg || 'Erro desconhecido durante extração.'
  setUIState(STATE.ERROR)
}

// ── Port communication ──────────────────────────────────
function connectPort() {
  try {
    port = chrome.runtime.connect({ name: 'scraper' })
  } catch {
    port = null
    return
  }
  port.onMessage.addListener((msg) => {
    if (msg.type === 'history') { renderHistory(msg.entries); return }
    if (msg.type === 'historyData') {
      const e = msg.entry
      if (!e || !e.data) { onError('Histórico não encontrado ou sem dados.') }
      else { onComplete(e.data) }
      return
    }
    if (msg.type !== 'update') return
    const s = msg.state
    switch (s.status) {
      case 'idle': setUIState(STATE.IDLE); break
      case 'scraping': onProgress(s.phase, s.done, s.total); setUIState(STATE.SCRAPING); break
      case 'complete':
        if (s.results) onComplete(s.results); else setUIState(STATE.IDLE)
        break
      case 'error': onError(s.error); break
    }
  })
  port.onDisconnect.addListener(() => { port = null })
}

// ── Form submit ─────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const opts = getOptions()
  if (!opts) return
  btnExtract.disabled = true
  try {
    if (!port) connectPort()
    if (port) port.postMessage({ type: 'start', options: opts })
    else onError('Erro ao conectar com o background.')
  } catch { onError('Erro ao conectar com o background.') }
  btnExtract.disabled = false
})

// ── Actions ──────────────────────────────────────────────
$('btn-download').addEventListener('click', () => {
  if (!lastResults) return
  chrome.runtime.sendMessage({ type: 'download', data: lastResults, filename: `scraper-${Date.now()}.json` })
})

$('btn-copy').addEventListener('click', async () => {
  if (!lastResults) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastResults, null, 2))
    show(copyFeedback)
    setTimeout(() => hide(copyFeedback), 2000)
  } catch { onError('Não foi possível copiar.') }
})

$('btn-new').addEventListener('click', () => { lastResults = null; setUIState(STATE.IDLE) })
$('btn-retry').addEventListener('click', () => { setUIState(STATE.IDLE); form.dispatchEvent(new Event('submit')) })

// ── History click delegation ────────────────────────────
$('history-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  const id = btn.dataset.id
  if (btn.dataset.act === 'del') {
    if (!port) connectPort()
    if (port) {
      port.postMessage({ type: 'deleteHistory', id })
      btn.closest('.history-item')?.remove()
    }
  } else if (btn.dataset.act === 'open') {
    openHistory(id)
  }
})

function renderHistory(entries) {
  const list = $('history-list')
  if (!entries.length) {
    list.innerHTML = '<p class="empty">Nenhum resultado anterior.</p>'
    return
  }
  list.innerHTML = entries.map(e =>
    `<div class="history-item">
      <div class="hi-info">
        <button data-act="open" data-id="${esc(e.id || '')}" class="hi-open">
          <span class="hi-count">${e.count} itens</span>
          <span class="hi-goal">${esc(e.platform || '')} ${e.goal !== undefined ? `· meta ${e.goal}` : ''} • ${new Date(e.timestamp).toLocaleString('pt-BR')}</span>
        </button>
      </div>
      <div class="hi-actions">
        <button data-act="del" data-id="${esc(e.id || '')}" class="btn btn--secondary" title="Excluir">⨯</button>
      </div>
    </div>`
  ).join('')
}

// Re-open a past extraction: pull its full data and render in complete state.
function openHistory(id) {
  if (!port) connectPort()
  if (!port) { onError('Background não respondeu.'); return }
  port.postMessage({ type: 'getHistoryData', id })
  progressText.textContent = 'Carregando histórico…'
  setUIState(STATE.SCRAPING)
}

// ── Persist + restore last-used parameters ───────────────
const FIELDS = ['goal', 'offset', 'batchSize', 'timeout']
function loadOptions() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ lastOptions: {} }, ({ lastOptions }) => {
      for (const id of FIELDS) {
        const el = $(id)
        if (el && lastOptions[id] !== undefined) el.value = lastOptions[id]
      }
      if (lastOptions.minimal === false) $('minimal').checked = false
      resolve()
    })
  })
}

// ── Init ─────────────────────────────────────────────────
(async function init() {
  connectPort()
  loadOptions()

  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
  const url = tab?.url || ''

  let adapter = null
  try {
    const { registry } = await import(chrome.runtime.getURL('core/registry.js'))
    await import(chrome.runtime.getURL('platforms/olx.js'))
    adapter = registry.detect(url)
  } catch { /* registry unavailable */ }

  if (adapter) {
    platformIcon.textContent = adapter.icon
    platformName.textContent = adapter.name
    applyBrand(adapter.brandColor)
    setUIState(STATE.IDLE)
  } else {
    platformName.textContent = 'Global Scraper'
    unsupportedMsg.textContent = url
      ? 'Navegue para uma página de busca compatível (ex: OLX).'
      : 'Abra uma página de busca para começar.'
    show(stateUnsupported)
  }

  if (port) port.postMessage({ type: 'getHistory' })
})()
