// ── State ────────────────────────────────────────────────
const STATE = { IDLE: 'idle', SCRAPING: 'scraping', COMPLETE: 'complete', ERROR: 'error' }
let currentState = STATE.IDLE
let port = null
let lastResults = null

const $ = (id) => document.getElementById(id)
const show = (el) => el.classList.remove('hidden')
const hide = (el) => el.classList.add('hidden')

const form = $('scrape-form')
const btnExtract = $('btn-extract')
const formError = $('form-error')

const stateUnsupported = $('state-unsupported')
const unsupportedMsg = $('unsupported-msg')
const stateIdle = $('state-idle')
const stateScraping = $('state-scraping')
const stateComplete = $('state-complete')
const stateError = $('state-error')

const platformIcon = $('platform-icon')
const platformName = $('platform-name')
const progressBar = $('progress-bar')
const progressCount = $('progress-count')
const progressText = $('progress-text')
const resultCount = $('result-count')
const previewBody = $('preview-body')
const errorMessage = $('error-message')
const copyFeedback = $('copy-feedback')

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
}

function onProgress(phase, done, total) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  progressBar.style.width = pct + '%'
  progressCount.textContent = `${done} / ${total}`
  progressText.textContent = phase === 'collect' ? 'Coletando anúncios...' : 'Buscando detalhes...'
}

function onComplete(results) {
  lastResults = results
  resultCount.textContent = `${results.length} resultado${results.length !== 1 ? 's' : ''}`
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
  port = chrome.runtime.connect({ name: 'scraper' })
  port.onMessage.addListener((msg) => {
    if (msg.type === 'history') { renderHistory(msg.entries); return }
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
  try { port.postMessage({ type: 'start', options: opts }) }
  catch { onError('Erro ao conectar com o background.') }
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
  if (btn.dataset.act === 'del' && port) port.postMessage({ type: 'deleteHistory', id: btn.dataset.id })
})

function renderHistory(entries) {
  const list = $('history-list')
  if (!entries.length) { list.innerHTML = '<p class="empty" style="color:#888;font-size:12px">Nenhum resultado anterior.</p>'; return }
  list.innerHTML = entries.map(e =>
    `<div class="history-item">
      <div class="hi-info">
        <span class="hi-count">${e.count} itens</span>
        <span class="hi-goal">${e.platform} • ${new Date(e.timestamp).toLocaleString()}</span>
      </div>
      <div class="hi-actions">
        <button data-act="del" data-id="${e.id}" class="btn-secondary">Excluir</button>
      </div>
    </div>`
  ).join('')
}

// ── Init ─────────────────────────────────────────────────
(async function init() {
  connectPort()

  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
  const url = tab?.url || ''

  const { registry } = await import(chrome.runtime.getURL('core/registry.js'))
  await import(chrome.runtime.getURL('platforms/olx.js'))
  const adapter = registry.detect(url)

  if (adapter) {
    platformIcon.textContent = adapter.icon
    platformName.textContent = adapter.name
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
