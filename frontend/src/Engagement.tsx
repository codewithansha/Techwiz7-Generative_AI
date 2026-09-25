/** Conversation thread, notifications, CSAT and the evaluation (hidden pack) workspace. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle, Bell, BookCheck, CheckCircle2, Download, FileSpreadsheet, Lock, MessageSquareText, RefreshCw,
  Send, ShieldAlert, Sparkles, Star, Upload, UserRound,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api, ApiError } from './api'
import type { Complaint, ComplaintMessage, EvaluationResult, EvaluationRunSummary, NotificationItem, Role } from './types'
import { EmptyState, Metric, Page, PageHeader, Panel, Skeleton, date, dateTime, labelize, messageOf } from './ui'

// ---------------------------------------------------------------- notifications

export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ unread: number; items: NotificationItem[] }>({ unread: 0, items: [] })
  const ref = useRef<HTMLDivElement>(null)
  const load = useCallback(() => { api.notifications().then(setData).catch(() => undefined) }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 45000)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && data.unread) { await api.markNotificationsSeen().catch(() => undefined); load() }
  }
  const go = (item: NotificationItem) => {
    setOpen(false)
    navigate(item.complaint_id ? `/complaints/${item.complaint_id}` : item.kind === 'review_queue' ? '/review' : '/')
  }
  return <div className="notify" ref={ref}>
    <button className="icon-button" onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}>
      <Bell />{data.unread > 0 && <span className="notify-count">{data.unread > 9 ? '9+' : data.unread}</span>}
    </button>
    {open && <div className="notify-panel card">
      <header><b>Notifications</b><button className="text-button" onClick={load}><RefreshCw /> Refresh</button></header>
      {data.items.length ? <ul>{data.items.map((item) => <li key={item.id}>
        <button className={item.unread ? 'unread' : ''} onClick={() => go(item)}>
          <span className={`notify-dot ${item.kind}`} />
          <span><b>{item.complaint_code || item.title}</b>{item.text}<small>{item.complaint_code ? item.title : ''}{item.at ? ` · ${dateTime(item.at)}` : ''}</small></span>
        </button>
      </li>)}</ul> : <p className="muted notify-empty">You're all caught up.</p>}
    </div>}
  </div>
}

// ---------------------------------------------------------------- conversation

export function Conversation({ complaint, role, reload, initialDraft }: { complaint: Complaint; role: Role | null; reload: () => Promise<void>; initialDraft?: string }) {
  const customer = role === 'customer'
  const [messages, setMessages] = useState<ComplaintMessage[] | null>(null)
  const [body, setBody] = useState(initialDraft || '')
  const [internal, setInternal] = useState(false)
  const [requestInfo, setRequestInfo] = useState(false)
  const [source, setSource] = useState<'agent' | 'genai_draft'>(initialDraft ? 'genai_draft' : 'agent')
  const [flags, setFlags] = useState<Array<{ code?: string; detail?: string; value?: string }>>([])
  const [busy, setBusy] = useState(false)
  const reviewer = role === 'reviewer' || role === 'manager' || role === 'administrator'
  const load = useCallback(() => { api.messages(complaint.id).then(setMessages).catch((e) => toast.error(messageOf(e))) }, [complaint.id])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (initialDraft) { setBody(initialDraft); setSource('genai_draft') } }, [initialDraft])

  const draft = complaint.genai?.customer_response
  const questions = complaint.genai?.clarification_questions?.length ? complaint.genai.clarification_questions : complaint.python?.clarification_questions || []
  const useDraft = () => { if (draft) { setBody(draft); setSource('genai_draft'); setInternal(false); setFlags([]) } }
  const askForInfo = () => {
    setBody(`Thank you for your message. To help us resolve this, could you please answer the following:\n${questions.map((q) => `• ${q}`).join('\n')}`)
    setRequestInfo(true); setInternal(false); setSource('agent'); setFlags([])
  }

  const send = async (e?: FormEvent, override = false) => {
    e?.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      if (!customer && !internal && !override) {
        const check = await api.checkMessage(complaint.id, body)
        if (check.flags.length) { setFlags(check.flags); setBusy(false); return }
      }
      await api.sendMessage(complaint.id, customer ? { body } : { body, internal, source, override, request_information: requestInfo })
      toast.success(customer ? 'Message sent to support' : internal ? 'Internal note added' : requestInfo ? 'Information requested — status set to awaiting customer' : 'Reply sent to the customer')
      setBody(''); setFlags([]); setRequestInfo(false); setSource('agent')
      load(); await reload()
    } catch (err) { toast.error(messageOf(err)) } finally { setBusy(false) }
  }

  const closed = complaint.status === 'closed'
  return <div className="conversation">
    <div className="thread">
      {messages === null ? <Skeleton /> : messages.length ? messages.map((m) => <article key={m.id} className={`message ${m.direction}`}>
        <header>{m.direction === 'internal' ? <Lock /> : m.direction === 'from_customer' ? <UserRound /> : <MessageSquareText />}<b>{m.author}</b>
          {m.direction === 'internal' && <span className="chip">Internal note</span>}
          {m.source === 'genai_draft' && <span className="chip">GenAI draft, edited &amp; checked</span>}
          {!!m.flags?.length && <span className="chip warn">Sent with override</span>}
          <small>{dateTime(m.created_at)}{!customer && m.direction === 'to_customer' ? (m.read_by_customer ? ' · Read' : ' · Unread') : ''}</small></header>
        <p>{m.body}</p>
      </article>) : <EmptyState icon={MessageSquareText} title="No messages yet" description={customer ? 'Send a message to the support team about this complaint.' : 'Reply to the customer or add an internal note.'} />}
    </div>
    {closed ? <p className="muted conversation-closed">This complaint is closed. {customer ? 'Please submit a new complaint if you need more help.' : ''}</p> : <form className="composer" onSubmit={send}>
      {!customer && <div className="composer-tools">
        <label className="check"><input type="checkbox" checked={internal} onChange={(e) => { setInternal(e.target.checked); setFlags([]) }} /> Internal note</label>
        {draft && <button type="button" className="text-button" onClick={useDraft}><Sparkles /> Use GenAI draft</button>}
        {questions.length > 0 && <button type="button" className="text-button" onClick={askForInfo}><AlertTriangle /> Request missing information</button>}
      </div>}
      <textarea rows={customer ? 3 : 5} value={body} onChange={(e) => { setBody(e.target.value); setFlags([]) }} placeholder={customer ? 'Write a message to the support team…' : internal ? 'Visible to staff only…' : 'Write a reply to the customer…'} maxLength={5000} />
      {!!flags.length && <div className="alert warning composer-flags"><ShieldAlert /><span><b>Validation found problems in this reply</b>{flags.map((f, i) => <span key={i}>• {labelize(f.code || 'issue')}: {f.detail || f.value}</span>)}<em>Edit the reply so it doesn't promise anything the policy doesn't allow.</em></span>
        {reviewer && <button type="button" className="button danger-outline compact" disabled={busy} onClick={() => send(undefined, true)}>Send anyway (audited)</button>}</div>}
      <div className="composer-actions">
        {!customer && !internal && <small className="muted"><BookCheck /> Replies are checked for unsupported promises and invented facts before sending.</small>}
        {requestInfo && !internal && <span className="chip warn">Will set status to “awaiting customer”</span>}
        <button className="button primary" disabled={busy || !body.trim()}>{busy ? <RefreshCw className="spin" /> : <Send />} {customer ? 'Send message' : internal ? 'Add note' : 'Send reply'}</button>
      </div>
    </form>}
  </div>
}

// ---------------------------------------------------------------- CSAT

export function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [hover, setHover] = useState(0)
  return <div className="stars" role={readOnly ? 'img' : 'radiogroup'} aria-label={`${value} of 5 stars`} onMouseLeave={() => setHover(0)}>
    {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" disabled={readOnly} aria-label={`${n} star${n > 1 ? 's' : ''}`}
      className={(hover || value) >= n ? 'on' : ''} onMouseEnter={() => !readOnly && setHover(n)} onClick={() => onChange?.(n)}><Star /></button>)}
  </div>
}

// ---------------------------------------------------------------- evaluation

const FIELDS = ['category', 'subcategory', 'department', 'urgency', 'priority', 'escalation']

export function EvaluationPage() {
  const [runs, setRuns] = useState<EvaluationRunSummary[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [useGenai, setUseGenai] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadRuns = useCallback(() => api.evaluationRuns().then((r) => { setRuns(r); return r }).catch((e) => { toast.error(messageOf(e)); return [] as EvaluationRunSummary[] }), [])
  useEffect(() => { loadRuns().then((r) => { if (r.length) setSelected((s) => s ?? r[0].id) }) }, [loadRuns])
  useEffect(() => {
    if (!selected) return
    let timer: number | undefined
    const poll = () => api.evaluationRun(selected).then((r) => {
      setResult(r)
      if (r.run.status === 'queued' || r.run.status === 'running') timer = window.setTimeout(poll, 1500)
      else loadRuns()
    }).catch((e) => toast.error(messageOf(e)))
    poll()
    return () => window.clearTimeout(timer)
  }, [selected, loadRuns])

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return toast.error('Choose a CSV or JSON file')
    const form = new FormData()
    form.append('file', file); form.append('name', name || file.name); form.append('use_genai', String(useGenai))
    setBusy(true)
    try { const r = await api.importEvaluation(form); toast.success(`Imported ${r.total} complaints — analysis running`); setFile(null); setName(''); await loadRuns(); setSelected(r.id) }
    catch (err) { toast.error(err instanceof ApiError ? err.message : messageOf(err)) } finally { setBusy(false) }
  }
  const running = result && (result.run.status === 'queued' || result.run.status === 'running')
  const pct = result ? Math.round((100 * result.run.processed) / Math.max(1, result.run.total)) : 0
  return <Page>
    <PageHeader eyebrow="Hidden evaluation pack" title="Evaluation & bulk import" description="Import unseen complaints as CSV or JSON, analyze them all through both pipelines, and score the results against expected labels — no code changes." />
    <div className="eval-layout">
      <div className="stack">
        <Panel title="Import a complaint pack" subtitle="CSV or JSON · see hidden_test_ready/README.md">
          <form className="upload-form flush" onSubmit={upload}>
            <label className={`drop-zone ${file ? 'has-file' : ''}`}><input type="file" accept=".csv,.json" onChange={(e) => setFile(e.target.files?.[0] || null)} /><Upload />{file ? <><b>{file.name}</b><span>{Math.max(1, Math.round(file.size / 1024))} KB</span></> : <><b>Choose a CSV or JSON file</b><span>Columns: title, description, product_or_service, order_reference, customer_type, channel, customer_ref, expected_*</span></>}</label>
            <label className="field full">Run name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hidden pack — day 5" /></label>
            <label className="check"><input type="checkbox" checked={useGenai} onChange={(e) => setUseGenai(e.target.checked)} /> Also run GenAI (Pipeline 1) — slower, up to 150 rows</label>
            <button className="button primary full" disabled={busy || !file}>{busy ? <RefreshCw className="spin" /> : <FileSpreadsheet />} Import and analyze</button>
          </form>
        </Panel>
        <Panel title="Runs" subtitle="Most recent first">{runs.length ? <div className="run-list">{runs.map((r) =>
          <button key={r.id} className={selected === r.id ? 'selected' : ''} onClick={() => setSelected(r.id)}>
            <b>{r.name}</b><small>{date(r.created_at)} · {r.total} complaints · {r.use_genai ? 'GenAI + Python' : 'Python only'}</small>
            <span className={`status-badge ${r.status === 'done' ? 'resolved' : r.status === 'failed' ? 'escalated' : 'analyzed'}`}>{labelize(r.status)}</span>
          </button>)}</div> : <p className="muted">No runs yet. Try hidden_test_ready/example_hidden_pack.csv or sample_complaints/nimbuscarta_500.csv.</p>}</Panel>
      </div>
      <div className="stack">
        {!result ? <div className="card"><EmptyState icon={FileSpreadsheet} title="No run selected" description="Import a pack to see accuracy, agreement and every mismatch." /></div> : <>
          <Panel title={result.run.name} subtitle={`${result.run.processed} of ${result.run.total} analyzed${result.import_errors ? ` · ${result.import_errors} rows rejected at intake` : ''}`}
            action={result.run.status === 'done' ? <div className="button-group"><button className="button secondary compact" onClick={() => api.downloadEvaluationReport(result.run.id, 'csv').catch((e) => toast.error(messageOf(e)))}><Download /> CSV</button><button className="button primary compact" onClick={() => api.downloadEvaluationReport(result.run.id, 'xlsx').catch((e) => toast.error(messageOf(e)))}><Download /> Comparison report</button></div> : undefined}>
            {running ? <div className="eval-progress"><div className="progress"><i style={{ width: `${pct}%` }} /></div><p className="muted"><RefreshCw className="spin" /> Analyzing… {pct}%</p></div>
              : result.run.status === 'failed' ? <div className="alert danger"><AlertTriangle /><span><b>Run failed</b>{result.run.error}</span></div>
              : <div className="metric-grid three">
                <Metric label="Category accuracy" value={pctLabel(result.accuracy.python.category)} icon={CheckCircle2} tone="violet" note={`Python vs ${result.labelled.category || 0} labels`} />
                <Metric label="Escalation accuracy" value={pctLabel(result.accuracy.python.escalation)} icon={ShieldAlert} tone="red" note="Mandatory escalation recall & precision" />
                <Metric label="GenAI ↔ Python agreement" value={pctLabel(result.agreement.category)} icon={Sparkles} tone="teal" note={result.genai_rows ? `${result.genai_rows} rows with GenAI output` : 'GenAI not run'} />
              </div>}
          </Panel>
          {!running && result.run.status === 'done' && <>
            <Panel title="Accuracy by field" subtitle="Share of labelled rows where the pipeline matched the expected value">
              <div className="accuracy-table">{FIELDS.map((f) => <div key={f}>
                <span>{labelize(f)}</span>
                <Bar label="Python" value={result.accuracy.python[f]} />
                <Bar label="GenAI" value={result.accuracy.genai[f]} muted />
              </div>)}</div>
            </Panel>
            {Object.keys(result.by_case_type).length > 0 && <Panel title="Python accuracy by case type" subtitle="Traps included: calm-critical, angry-minor, injection, contradictory policy…">
              <div className="case-grid">{Object.entries(result.by_case_type).map(([k, v]) => <div key={k} className={v >= 90 ? 'good' : v >= 70 ? 'ok' : 'bad'}><b>{v}%</b><span>{labelize(k)}</span></div>)}</div>
            </Panel>}
            <Panel title={`Mismatches (${result.mismatches.length})`} subtitle="Where Python disagreed with the expected label">
              {result.mismatches.length ? <div className="table-scroll"><table className="data-table dense"><thead><tr><th>Row</th><th>Complaint</th><th>Case type</th><th>Field</th><th>Expected</th><th>Python</th></tr></thead><tbody>
                {result.mismatches.slice(0, 100).map((m, i) => <tr key={i}><td>{m.row}</td><td>{m.complaint_code ? <Link to={`/complaints/${m.complaint_code.replace('CMP-', '').replace(/^0+/, '')}`}><b>{m.complaint_code}</b></Link> : '—'}</td><td>{labelize(m.case_type || '—')}</td><td>{labelize(m.field)}</td><td>{String(m.expected)}</td><td>{String(m.python ?? '—')}</td></tr>)}
              </tbody></table></div> : <div className="all-clear"><CheckCircle2 /><span><b>No mismatches</b>Every labelled field matched.</span></div>}
            </Panel>
          </>}
        </>}
      </div>
    </div>
  </Page>
}

function Bar({ label, value, muted }: { label: string; value: number | null | undefined; muted?: boolean }) {
  return <div className={`acc-bar ${muted ? 'muted-bar' : ''}`}><small>{label}</small><div><i style={{ width: `${value ?? 0}%` }} /></div><b>{pctLabel(value)}</b></div>
}
const pctLabel = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)
