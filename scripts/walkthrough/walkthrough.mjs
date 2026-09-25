// End-to-end walkthrough: drives a real Chrome through the SupportNova UI as each role and
// saves a screenshot per step to documentation/walkthrough/images/, plus facts.json.
//
//   node scripts/walkthrough/walkthrough.mjs            (API on :8000, web on :5173)
//   WEB=http://localhost:5173 API=http://localhost:8000 node scripts/walkthrough/walkthrough.mjs
//
// It creates one new complaint with three attachments and takes it from submission to closure.
// No packages needed: Node 22+ (built-in WebSocket) and Google Chrome.

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WEB = process.env.WEB || 'http://localhost:5173'
const API = process.env.API || 'http://localhost:8000'
const OUT = join(ROOT, 'documentation', 'walkthrough', 'images')
const PYTHON = process.env.PYTHON || [join(process.env.LOCALAPPDATA || '', 'Programs/Python/Python312/python.exe'), join(ROOT, '.venv/Scripts/python.exe')].find(existsSync) || 'python'
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(existsSync)
const PORT = 9333
const USERS = {
  customer: ['customer@nimbuscarta.example', 'CustomerPass!23'],
  agent: ['agent@nimbuscarta.example', 'AgentPass!23'],
  reviewer: ['reviewer@nimbuscarta.example', 'ReviewPass!23'],
  manager: ['manager@nimbuscarta.example', 'ManagerPass!23'],
  administrator: ['admin@nimbuscarta.example', 'ChangeMeNow!23'],
}
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// RESUME=5 COMPLAINT_ID=6 continues an interrupted run from section 5 with the same complaint.
const RESUME = Number(process.env.RESUME || 1)
const FACTS_FILE = join(OUT, '..', 'facts.json')
const facts = RESUME > 1 && existsSync(FACTS_FILE) ? JSON.parse(readFileSync(FACTS_FILE, 'utf-8')) : { started_at: new Date().toISOString(), steps: [] }
if (RESUME > 1) { facts.steps = facts.steps.filter((s) => s.section < RESUME); delete facts.error }
let section = 1

// ---------------------------------------------------------------- Chrome DevTools Protocol
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sn-walk-'))}`, '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* not up yet */ }
}
if (!target) throw new Error('Chrome did not start')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let nextId = 0
const pending = new Map()
const listeners = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) { const { resolve: ok, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : ok(msg.result) }
  else if (msg.method) listeners.forEach((l) => l(msg))
})
const send = (method, params = {}) => new Promise((ok, reject) => { const id = ++nextId; pending.set(id, { resolve: ok, reject }); ws.send(JSON.stringify({ id, method, params })) })
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

const HELPERS = `window.__h = window.__h || {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async waitFor(fn, t = 20000) { const s = Date.now(); while (Date.now() - s < t) { try { const v = fn(); if (v) return v } catch {} await new Promise((r) => setTimeout(r, 200)) } throw new Error('Timed out waiting for the page') },
  setVal(el, v) { const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) },
  field(label) { return [...document.querySelectorAll('label')].find((l) => l.firstChild && l.firstChild.textContent.trim() === label)?.querySelector('input, textarea, select') },
  button(text, root = document) { return [...root.querySelectorAll('button')].find((b) => b.textContent.trim().includes(text) && !b.disabled) },
  tab(name) { [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.trim().startsWith(name))?.click() },
  go(path) { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')) },
  top() { document.querySelectorAll('*').forEach((el) => { if (el.scrollTop) el.scrollTop = 0 }); window.scrollTo(0, 0) },
  show(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (el) el.scrollIntoView({ block: 'start' }); return !!el },
  toasts() { return [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.innerText.trim()) },
};`

async function js(expression) {
  const result = await send('Runtime.evaluate', { expression: `${HELPERS}\n(async () => { const h = window.__h; ${expression} })()`, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function load(url) {
  const loaded = new Promise((r) => { const l = (m) => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r() } }; listeners.push(l) })
  await send('Page.navigate', { url }); await loaded; await sleep(1200)
}
let shotNo = RESUME > 1 ? facts.steps.length : 0
async function shot(slug, title, note = '', extra = {}) {
  await sleep(600)
  // Toasts ("Welcome back", "Status updated") cover the header; the facts are in the page itself.
  await js(`let s = document.getElementById('walk-hide'); if (!s) { s = document.createElement('style'); s.id = 'walk-hide'; s.textContent = '[data-sonner-toaster]{display:none!important}'; document.head.appendChild(s) }`)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const file = `${String(++shotNo).padStart(2, '0')}-${slug}.png`
  writeFileSync(join(OUT, file), Buffer.from(data, 'base64'))
  facts.steps.push({ file, title, note, section, ...extra })
  console.log(`  [${file}] ${title}`)
}
async function login(role) {
  const [email, password] = USERS[role]
  // Sign out whoever was signed in (the app keeps the session in localStorage).
  await load(`${WEB}/login`)
  await js(`localStorage.clear(); sessionStorage.clear();`)
  await load(`${WEB}/login`)
  // Use the real sign-in form.
  await js(`await h.waitFor(() => document.querySelector('input[type=email]'));
    h.setVal(document.querySelector('input[type=email]'), ${JSON.stringify(email)});
    h.setVal(document.querySelector('input[type=password]'), ${JSON.stringify(password)});`)
  return async (slug, title, note) => {
    if (slug) await shot(slug, title, note)
    await js(`h.button('Sign in').click(); await h.waitFor(() => !location.pathname.startsWith('/login'));`)
    await sleep(1500)
  }
}
async function signIn(role, capture) {
  const submit = await login(role)
  await submit(...(capture || []))
}
async function apiCall(role, path, options = {}) {
  const [email, password] = USERS[role]
  const token = (await (await fetch(`${API}/api/v1/auth/login-json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } })
  return res.json()
}
async function setFiles(selector, paths) {
  const { result } = await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` })
  await send('DOM.setFileInputFiles', { objectId: result.objectId, files: paths })
}

// ---------------------------------------------------------------- the flow
try {
  const today = new Date()
  const incident = new Date(today.getTime() - 7 * 864e5).toISOString().slice(0, 10)

  // A fresh customer per run, registered through the public sign-up API, so runs never collide.
  if (RESUME <= 1) {
    const stamp = Date.now().toString(36)
    facts.customer = { email: `demo.customer+${stamp}@example.com`, password: 'DemoCustomer!23', full_name: 'Demo Customer' }
    // A new order number per run, with a matching invoice, photo and delivery note.
    facts.order = `NC-${String(700000 + Math.floor(Math.random() * 299999))}`
    facts.files_dir = join(OUT, '..', 'attachments')
    const made = spawnSync(PYTHON, [join(ROOT, 'scripts/walkthrough/make_attachments.py'), facts.order, facts.files_dir, '9'], { encoding: 'utf-8' })
    if (made.status !== 0) throw new Error(`Could not create the demo attachments: ${made.stderr}`)
    const reg = await fetch(`${API}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(facts.customer) })
    if (!reg.ok) throw new Error(`Could not register the demo customer: ${reg.status} ${await reg.text()}`)
  }
  if (facts.customer) USERS.customer = [facts.customer.email, facts.customer.password]
  let code = facts.complaint?.code
  let complaintId = facts.complaint?.id
  if (RESUME <= 1) {
  section = 1
  console.log('1. Customer files a complaint')
  await signIn('customer', ['login', 'Sign in', 'Every role signs in on the same page; the role decides what they see.'])
  await shot('customer-dashboard', 'Customer dashboard', 'The customer sees only their own complaints, statuses and messages.')

  await js(`h.go('/complaints/new'); await h.waitFor(() => h.field('Complaint title'));
    h.setVal(h.field('Complaint title'), 'Tablet arrived with a cracked screen');
    h.setVal(h.field('Description'), 'My NimbusTab 11 was delivered two days ago with the screen cracked across the middle. The box corner was dented and the courier noted it on the delivery note. The tablet turns on but the touch screen does not respond in the cracked area. I have attached the invoice, a photo and the delivery note.');
    h.setVal(h.field('Product or service'), 'NimbusTab 11');
    h.setVal(h.field('Order reference'), '${facts.order}');`)
  await shot('wizard-step-1', 'Complaint wizard: details', 'Title, description (minimum 20 characters), product and order number. The order number format is checked as you type.')
  await js(`h.button('Continue').click(); await h.waitFor(() => h.field('Requested resolution'));
    h.setVal(h.field('Requested resolution'), 'Please replace the tablet.');
    h.setVal(h.field('When did it happen?'), '${incident}');`)
  await setFiles('input[type=file]', [join(facts.files_dir, `invoice_${facts.order}.pdf`), join(facts.files_dir, 'photo_cracked_screen.jpg'), join(facts.files_dir, 'delivery_note.docx')])
  await shot('wizard-step-2', 'Complaint wizard: context and attachments', 'Requested resolution, incident date and three supporting files: invoice (PDF), photo (JPG) and delivery note (DOCX).')
  await js(`h.button('Continue').click(); await h.waitFor(() => h.button('Submit complaint'));`)
  await shot('wizard-review', 'Complaint wizard: review', 'The customer checks everything, including the 3 attachments, before submitting.')
  code = await js(`h.button('Submit complaint').click(); await h.waitFor(() => /\\/complaints\\/\\d+$/.test(location.pathname)); await h.waitFor(() => document.querySelector('.attachment-chip')); await h.sleep(800); return document.querySelector('.detail-heading b')?.textContent`)
  complaintId = Number((await js(`return location.pathname.split('/').pop()`)))
  facts.complaint = { code, id: complaintId }
  await shot('customer-complaint-submitted', `Submitted: ${code}`, 'Status, department and the latest update are shown in plain language. Attachments are listed under Supporting documents.')
  await js(`h.show('.attachments')`)
  await js(`[...document.querySelectorAll('.attachment-open')].find((b) => b.textContent.includes('photo'))?.click(); await h.waitFor(() => document.querySelector('.attachment-preview img'))`)
  await shot('customer-views-photo', 'Customer opens an attachment', 'Clicking a file opens it in a preview (images and PDFs inline); Download saves it. Only the complaint owner and staff can fetch it.')
  await js(`h.button('Close').click()`)
  await js(`h.button('Ask Nova').click(); await h.waitFor(() => document.querySelector('.assistant-input input'));
    h.setVal(document.querySelector('.assistant-input input'), 'What is the status of ${code}?');
    document.querySelector('.assistant-input button[type=submit], .assistant-input button').click();
    await h.waitFor(() => document.querySelectorAll('.assistant-messages > *').length >= 3, 30000); await h.sleep(800)`)
  await shot('customer-asks-nova', 'Customer asks Nova', 'Nova answers from the customer\'s own complaints and approved policies only.')

  }
  if (RESUME <= 2) {
  section = 2
  console.log('2. Agent analyzes')
  await signIn('agent')
  await shot('agent-dashboard', 'Agent dashboard', 'Unassigned and own cases, SLA risk and escalations at a glance.')
  await js(`h.go('/complaints'); await h.waitFor(() => document.body.innerText.includes('${code}'))`)
  await shot('agent-complaint-list', 'Complaint list with filters', 'Filters run in SQL: category, department, priority, urgency, sentiment, escalation, SLA risk, review, dates.')
  await js(`h.go('/complaints/${complaintId}'); await h.waitFor(() => h.button('Analyze complaint'))`)
  await shot('agent-before-analysis', 'Complaint before analysis', 'The agent sees the untrusted original text, metadata and the attachments.')
  const started = Date.now()
  await js(`h.button('Analyze complaint').click(); await h.waitFor(() => document.querySelector('.intelligence-grid'), 240000); await h.sleep(1000); h.top()`)
  facts.analysis_seconds = Math.round((Date.now() - started) / 1000)
  const detail = await apiCall('agent', `/api/v1/complaints/${complaintId}`)
  facts.analysis = { genai_meta: detail.genai_meta, python: detail.python, genai: detail.genai, flags: detail.flags, review_reasons: detail.checks?.review_reasons, comparison: detail.comparison?.status, score: detail.verification_score, evidence: detail.evidence }
  await shot('analysis-overview', 'Analysis result: both pipelines', `Pipeline 2 (Python rules) is the ground truth; Pipeline 1 (GenAI) drafted in parallel. Took ${facts.analysis_seconds}s.`)
  await js(`h.show(document.querySelector('.condition-list') || document.querySelector('.kv-list'))`)
  await shot('analysis-eligibility', 'Eligibility against policy conditions', 'Replacement window, product condition and previous replacements are checked from facts, including the invoice date.')
  await js(`const p = [...document.querySelectorAll('.panel')].find((x) => x.innerText.startsWith('Attachment evidence')); h.show(p)`)
  await shot('analysis-evidence', 'Attachment evidence', 'Order number, amount and purchase date read from the invoice; the photo counts as photo evidence. All of it fed both pipelines.')
  await js(`const p = [...document.querySelectorAll('.panel')].find((x) => x.innerText.startsWith('Validation controls')); h.show(p)`)
  await shot('analysis-validation', 'Validation controls and policy precedence', 'Every flag Python raised, and which policy governs over FAQs or older versions.')
  await js(`h.top(); h.tab('Comparison'); await h.sleep(600)`)
  await shot('analysis-comparison', 'GenAI vs Python, field by field', 'Mismatches lower the verification score and send the case to manual review.')
  await js(`h.tab('Response'); await h.sleep(600)`)
  await shot('analysis-response', 'Draft reply and guidance', 'GenAI draft reply, clarification questions, and Python\'s mandatory and prohibited actions.')
  await js(`h.tab('Structured JSON'); await h.sleep(600)`)
  await shot('analysis-json', 'Structured JSON', 'The exact schema-validated output of both pipelines, stored with provider, model and prompt version.')

  }
  if (RESUME <= 3) {
  section = 3
  console.log('3. Agent works the case')
  await js(`h.top(); h.tab('Overview'); await h.sleep(300); const b = h.button('Assign to me'); if (b) { b.click(); await h.sleep(1500) }`)
  await js(`h.tab('Conversation'); await h.waitFor(() => document.querySelector('.composer textarea'));
    h.setVal(document.querySelector('.composer textarea'), 'We are very sorry. We will send you a brand new tablet and a PKR 5,000 voucher within 24 hours.');
    h.button('Send reply').click(); await h.waitFor(() => document.querySelector('.composer-flags')); h.show('.composer')`)
  await shot('agent-reply-blocked', 'Unsafe reply blocked', 'The promise guard stops replies that promise a replacement, a voucher or a timeline the policy does not support. Agents cannot override it.')
  await js(`h.setVal(document.querySelector('.composer textarea'), 'Thank you for the invoice, the photo and the delivery note. We are sorry the tablet arrived damaged. Your case is with our Warranty team, who will check the evidence against the replacement policy and update you here.');
    h.button('Send reply').click(); await h.waitFor(() => document.querySelectorAll('.message.to_customer').length >= 1); await h.sleep(800); h.show('.thread')`)
  await shot('agent-reply-sent', 'Policy-safe reply sent', 'The reply passes the guard and reaches the customer. The first-response SLA is recorded.')

  }
  if (RESUME <= 4) {
  section = 4
  console.log('4. Customer replies')
  await signIn('customer')
  await js(`h.go('/complaints/${complaintId}'); await h.waitFor(() => document.querySelector('.composer textarea'));
    h.setVal(document.querySelector('.composer textarea'), 'Thank you. I still have the original box if you need it collected.');
    h.button('Send message').click(); await h.waitFor(() => document.querySelectorAll('.message.from_customer').length >= 1); await h.sleep(800); h.show('.thread')`)
  await shot('customer-conversation', 'Customer sees the reply and answers', 'Messages come from "NimbusCarta Support"; internal notes never show here.')

  }
  section = 5
  console.log('5. Reviewer decides')
  await signIn('reviewer')
  await js(`h.go('/review'); await h.waitFor(() => document.body.innerText.includes('${code}'));
    const row = await h.waitFor(() => [...document.querySelectorAll('.review-list button')].find((b) => b.innerText.includes('${code}')));
    row.click(); await h.waitFor(() => document.querySelector('.review-case-head'))`)
  await shot('review-queue', 'Manual review queue', 'Why the case needs a human, and the GenAI recommendation next to the Python ground truth.')
  const inQueue = await js(`return !!document.querySelector('.review-case-head')`)
  if (inQueue) {
    await js(`h.setVal(document.querySelector('.review-workspace textarea'), 'Photo and delivery note confirm damage on arrival within the replacement window. Approve the Python recommendation.');
      h.button('Approve').click(); await h.sleep(1800)`)
    await shot('review-approved', 'Reviewer approves', 'The decision and the original recommendation are both kept in the audit trail.')
  }

  section = 6
  console.log('6. Agent resolves')
  await signIn('agent')
  await js(`h.go('/complaints/${complaintId}'); await h.waitFor(() => document.querySelector('.action-bar'));
    h.setVal(document.querySelector('.action-bar select'), 'resolved');
    h.setVal(h.field('Update note'), 'A replacement NimbusTab 11 has been approved under RPL-POL-01 after the photo and delivery note were checked. The courier will collect the damaged unit.');
    h.button('Update').click(); await h.sleep(1800); h.top()`)
  await shot('agent-resolves', 'Agent resolves the case', 'The update note becomes the customer\'s latest update, and a resolution-confirmation follow-up is scheduled.')

  section = 7
  console.log('7. Customer confirms and rates')
  await signIn('customer')
  await js(`h.go('/complaints/${complaintId}'); await h.waitFor(() => document.querySelector('.resolution-check'));`)
  await shot('customer-resolution-check', 'Did this resolve your issue?', 'The customer confirms or reopens with a reason.')
  await js(`document.querySelector('.stars button[aria-label="5 stars"]').click(); await h.sleep(300); h.button('Yes, close it').click(); await h.sleep(1800)`)
  await shot('customer-closed', 'Closed with a 5-star rating', 'CSAT is stored and appears on the Reports page.')

  section = 8
  console.log('8. Oversight')
  await signIn('agent')
  await js(`h.go('/complaints/${complaintId}'); await h.waitFor(() => document.querySelector('.tabs')); h.tab('History'); await h.waitFor(() => document.querySelector('.timeline'))`)
  await shot('audit-trail', 'Audit trail', 'Every action, by whom and when, plus GenAI runs with provider, model, prompt version and retries.')
  await signIn('manager')
  await js(`h.go('/reports'); await h.sleep(2500)`)
  await shot('manager-reports', 'Reports and analytics', 'Volume trend, categories, departments, products, sentiment, SLA, CSAT and exports.')
  await js(`h.go('/evaluation'); await h.sleep(2000)`)
  await shot('manager-evaluation', 'Evaluation workbench', 'Upload a hidden complaint pack and score both pipelines against expected labels.')
  await signIn('administrator')
  await js(`h.go('/knowledge'); await h.sleep(2000)`)
  await shot('admin-knowledge-base', 'Knowledge base', 'Versioned policies, SOPs and FAQs, parsed into traceable sections.')
  await js(`h.go('/settings'); await h.sleep(2000)`)
  await shot('admin-settings', 'Settings: pipelines', 'Provider chain (incl. Ollama), prompt version, thresholds, rules, SLA and users, all editable without code.')

  facts.final = await apiCall('agent', `/api/v1/complaints/${complaintId}`)
  facts.history = await apiCall('agent', `/api/v1/complaints/${complaintId}/history`)
  facts.finished_at = new Date().toISOString()
} catch (error) {
  facts.error = String(error?.stack || error)
  console.error('Walkthrough stopped:', error)
  try { await shot('error', 'Where the walkthrough stopped') } catch { /* ignore */ }
} finally {
  writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2))
  ws.close(); chrome.kill()
}
