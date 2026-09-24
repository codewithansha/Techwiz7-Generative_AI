import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, Bot,
  BrainCircuit, Check, CheckCircle2, ChevronDown, Clock3, Download, FileText,
  Filter, Inbox, LayoutDashboard, LogOut, Menu, MessageSquareText, Plus,
  RefreshCw, Search, Send, Settings2, ShieldAlert, ShieldCheck, Sparkles, Upload,
  UserRoundCheck, Users, X, XCircle,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams,
} from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { api, ApiError } from './api'
import { useAppStore } from './store'
import type { Complaint, ComplaintDraft, ComplaintIntelligence, KnowledgeDocument, Metrics, Role } from './types'

const STATUS_LABEL: Record<string, string> = {
  new: 'New', analyzed: 'Analyzed', assigned: 'Assigned', in_progress: 'In progress',
  awaiting_customer: 'Awaiting customer', escalated: 'Escalated', resolved: 'Resolved',
  closed: 'Closed', reopened: 'Reopened',
}
const COLORS = ['#6558f5', '#9b8cff', '#26b6a0', '#f59f47', '#f15c6d', '#7196f3']

export default function SupportNovaApp() {
  const { authenticated, restore } = useAppStore()
  useEffect(() => { restore() }, [restore])
  return <>
    <Routes>
      <Route path="/login" element={authenticated ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/*" element={authenticated ? <AppShell /> : <Navigate to="/login" replace />} />
    </Routes>
    <Toaster richColors position="top-right" closeButton />
  </>
}

function LoginPage() {
  const login = useAppStore((s) => s.login)
  const loading = useAppStore((s) => s.loading)
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@nimbuscarta.example')
  const [password, setPassword] = useState('ChangeMeNow!23')
  const [showProfiles, setShowProfiles] = useState(false)
  const profiles = [
    ['Administrator', 'admin@nimbuscarta.example', 'ChangeMeNow!23'],
    ['Agent', 'agent@nimbuscarta.example', 'AgentPass!23'],
    ['Reviewer', 'reviewer@nimbuscarta.example', 'ReviewPass!23'],
    ['Manager', 'manager@nimbuscarta.example', 'ManagerPass!23'],
    ['Customer', 'customer@nimbuscarta.example', 'CustomerPass!23'],
  ]
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await login(email, password); toast.success('Welcome back'); navigate('/') }
    catch (error) { toast.error(messageOf(error)) }
  }
  return <main className="auth-page">
    <section className="auth-story">
      <Brand light />
      <div className="story-content">
        <span className="eyebrow">ResponseX intelligence</span>
        <h1>Customer support,<br /><em>validated by design.</em></h1>
        <p>Generative AI drafts every resolution. Independent Python rules verify every decision.</p>
        <div className="pipeline-visual">
          <div><Bot /><span><b>Pipeline 01</b>GenAI intelligence</span></div><ArrowRight />
          <div><ShieldCheck /><span><b>Pipeline 02</b>Ground-truth validation</span></div>
        </div>
      </div>
      <footer><span><i className="live-dot" /> Systems operational</span><span>NimbusCarta · Secure workspace</span></footer>
    </section>
    <section className="auth-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-brand"><Brand /></div>
        <span className="eyebrow purple">Secure workspace</span>
        <h2>Welcome back</h2><p className="muted">Sign in to manage customer intelligence.</p>
        <label>Email address<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
        <button className="button primary full" disabled={loading}>
          {loading ? <><RefreshCw className="spin" /> Signing in…</> : <>Sign in <ArrowRight /></>}
        </button>
        <button type="button" className="demo-toggle" onClick={() => setShowProfiles(!showProfiles)}>Use a demo profile <ChevronDown className={showProfiles ? 'rotate' : ''} /></button>
        {showProfiles && <div className="demo-list">{profiles.map(([name, mail, pass]) =>
          <button type="button" key={name} onClick={() => { setEmail(mail); setPassword(pass); setShowProfiles(false) }}><span>{name}</span><small>{mail}</small></button>)}</div>}
        <p className="security-note"><ShieldCheck /> Encrypted access · Role-based permissions</p>
      </form>
    </section>
  </main>
}

function AppShell() {
  const { user, role, sidebarOpen, setSidebarOpen, logout } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const nav = navigationFor(role)
  const pageName = nav.find((item) => item.to === location.pathname)?.label || 'Workspace'
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <Brand /><button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X /></button>
      <nav><p>Workspace</p>{nav.map(({ to, label, icon: Icon, end }) =>
        <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}><Icon /><span>{label}</span>{label === 'Review queue' && <i>AI</i>}</NavLink>)}</nav>
      <div className="sidebar-bottom">
        <div className="health-chip"><i className="live-dot" /><div><b>All systems normal</b><small>API & validation online</small></div></div>
        <div className="user-menu"><Avatar name={user?.full_name || 'User'} /><div><b>{user?.full_name || 'Loading…'}</b><small>{labelize(role || '')}</small></div><button onClick={() => { logout(); navigate('/login') }}><LogOut /></button></div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-title"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><span>Workspace</span><b>{pageName}</b></div></div>
        <div className="topbar-actions"><div className="search-shell"><Search /><input placeholder="Search complaints…" /></div><button className="icon-button"><Bell /><i /></button><Link className="button primary compact" to="/complaints/new"><Plus /> New complaint</Link></div>
      </header>
      <main className="workspace"><Routes>
        <Route index element={<DashboardPage />} />
        <Route path="complaints" element={<ComplaintsPage />} />
        <Route path="complaints/new" element={<NewComplaintPage />} />
        <Route path="complaints/:id" element={<ComplaintDetailPage />} />
        <Route path="review" element={<ReviewQueuePage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes></main>
    </div>
  </div>
}

function DashboardPage() {
  const { role, user, metrics, complaints, loadComplaints, loadMetrics } = useAppStore()
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([loadComplaints(), role === 'administrator' ? loadMetrics() : Promise.resolve()])
      .catch((e) => toast.error(messageOf(e))).finally(() => setLoading(false))
  }, [loadComplaints, loadMetrics, role])
  const data = metrics || deriveMetrics(complaints)
  const categories = entries(data.categories).slice(0, 6)
  const priorities = entries(data.priorities)
  return <Page>
    <PageHeader eyebrow={`${greeting()}, ${user?.full_name?.split(' ')[0] || 'there'}`} title={role === 'customer' ? 'Your support journey' : 'Intelligence overview'} description={role === 'customer' ? 'Track your complaints and latest resolution updates.' : 'Monitor complaint health, verification, and critical activity.'} action={<Link className="button primary" to="/complaints/new"><Plus /> New complaint</Link>} />
    <div className="metric-grid">
      <Metric label="Total complaints" value={data.total} icon={Inbox} tone="violet" note="+12.4% vs last period" />
      <Metric label="Needs review" value={data.manual_review_cases} icon={UserRoundCheck} tone="orange" note="Human decision" />
      <Metric label="Escalations" value={data.escalations} icon={ShieldAlert} tone="red" note="Active cases" />
      <Metric label="SLA at risk" value={data.sla_risks} icon={Clock3} tone="teal" note="Requires action" />
    </div>
    <div className="dashboard-grid">
      <Panel className="span-2" title="Complaint volume" subtitle="Category distribution" action={<button className="text-button">Last 30 days <ChevronDown /></button>}>
        {categories.length ? <ResponsiveContainer width="100%" height={255}><AreaChart data={categories}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6558f5" stopOpacity={.28} /><stop offset="100%" stopColor="#6558f5" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ebeaf0" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#6558f5" strokeWidth={2.5} fill="url(#fill)" /></AreaChart></ResponsiveContainer> : <EmptyState icon={BarChart3} title="No data yet" description="Analytics populate after complaints are analyzed." />}
      </Panel>
      <Panel title="Priority mix" subtitle="Current workload"><div className="donut-layout"><ResponsiveContainer width={165} height={165}><PieChart><Pie data={priorities} dataKey="value" innerRadius={52} outerRadius={73} paddingAngle={3}>{priorities.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="legend">{priorities.map((item, i) => <span key={item.name}><i style={{ background: COLORS[i] }} />{item.name}<b>{item.value}</b></span>)}</div></div></Panel>
      <Panel className="span-2" title="Recent complaints" subtitle="Latest customer activity" action={<Link className="text-button" to="/complaints">View all <ArrowRight /></Link>}><ComplaintTable rows={complaints.slice(0, 6)} compact loading={loading} /></Panel>
      <Panel title="Validation health" subtitle="GenAI vs Python">
        <div className="verification-score"><div className="score-ring"><span>{Math.max(0, 100 - data.genai_python_mismatches * 6)}<small>%</small></span></div><b>Overall agreement</b><p>{data.genai_python_mismatches} mismatches need attention</p></div>
        <div className="health-list"><span><CheckCircle2 /> Rule engine <b>Operational</b></span><span><CheckCircle2 /> Policy grounding <b>Active</b></span><span><Activity /> Prompt defenses <b>Monitoring</b></span></div>
      </Panel>
    </div>
  </Page>
}

function ComplaintsPage() {
  const { complaints, loadComplaints, loading } = useAppStore()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => { loadComplaints().catch((e) => toast.error(messageOf(e))) }, [loadComplaints])
  const rows = complaints.filter((c) => `${c.complaint_code} ${c.title} ${c.order_reference}`.toLowerCase().includes(query.toLowerCase()) && (!status || c.status === status))
  return <Page>
    <PageHeader eyebrow="Complaint operations" title="All complaints" description="Search, triage, and follow every complaint through resolution." action={<Link className="button primary" to="/complaints/new"><Plus /> New complaint</Link>} />
    <div className="toolbar card"><div className="search-field"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, title, or order…" /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select><button className="button secondary"><Filter /> More filters</button><span className="result-count">{rows.length} results</span></div>
    <div className="card table-card"><ComplaintTable rows={rows} loading={loading} /></div>
  </Page>
}

function NewComplaintPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ComplaintDraft>({ title: '', description: '', product_or_service: '', order_reference: '', previous_complaint_reference: '', customer_type: 'standard', preferred_contact_channel: 'email', requested_resolution: '' })
  const set = (field: keyof ComplaintDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }))
  const submit = async () => {
    setBusy(true)
    try { const result = await api.submitComplaint(draft); toast.success('Complaint submitted'); navigate(`/complaints/${result.complaint.id}`) }
    catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }
  return <Page narrow>
    <PageHeader eyebrow="Create case" title="Submit a complaint" description="Provide enough context for accurate classification and resolution." />
    <div className="stepper">{['Complaint details', 'Context & outcome', 'Review'].map((label, i) => <div key={label} className={step >= i + 1 ? 'active' : ''}><span>{step > i + 1 ? <Check /> : i + 1}</span><b>{label}</b></div>)}</div>
    <div className="form-card card">
      {step === 1 && <FormSection icon={MessageSquareText} title="Tell us what happened" description="Clear, factual details help both intelligence pipelines.">
        <Field label="Complaint title" full><input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Order arrived damaged" /></Field>
        <Field label="Description" full note={`${draft.description.length} characters · minimum 20`}><textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={7} placeholder="Describe the issue, when it happened, and the impact…" /></Field>
        <Field label="Product or service"><input value={draft.product_or_service} onChange={(e) => set('product_or_service', e.target.value)} placeholder="AuraBuds Pro" /></Field>
        <Field label="Order reference" note="Format: NC-000000"><input value={draft.order_reference} onChange={(e) => set('order_reference', e.target.value)} placeholder="NC-100001" /></Field>
      </FormSection>}
      {step === 2 && <FormSection icon={BookOpen} title="Add relevant context" description="This helps detect repeats and choose the right policy.">
        <Field label="Customer type"><select value={draft.customer_type} onChange={(e) => set('customer_type', e.target.value)}><option value="standard">Standard</option><option value="vip">VIP</option><option value="wholesale">Wholesale</option><option value="enterprise">Enterprise</option></select></Field>
        <Field label="Preferred contact"><select value={draft.preferred_contact_channel} onChange={(e) => set('preferred_contact_channel', e.target.value)}><option value="email">Email</option><option value="chat">Chat</option><option value="phone">Phone</option></select></Field>
        <Field label="Previous complaint reference" full><input value={draft.previous_complaint_reference} onChange={(e) => set('previous_complaint_reference', e.target.value)} placeholder="CMP-00000 (optional)" /></Field>
        <Field label="Requested resolution" full><textarea value={draft.requested_resolution} onChange={(e) => set('requested_resolution', e.target.value)} rows={4} placeholder="What would a fair resolution look like?" /></Field>
      </FormSection>}
      {step === 3 && <FormSection icon={CheckCircle2} title="Review before submitting" description="You can edit anything by going back."><div className="review-draft full"><span>Title</span><b>{draft.title}</b><span>Description</span><p>{draft.description}</p><div className="review-pairs"><span>Product<b>{draft.product_or_service || '—'}</b></span><span>Order<b>{draft.order_reference || '—'}</b></span><span>Customer<b>{labelize(draft.customer_type)}</b></span><span>Contact<b>{labelize(draft.preferred_contact_channel)}</b></span></div></div></FormSection>}
      <div className="form-actions"><button className="button ghost" onClick={() => step === 1 ? navigate('/complaints') : setStep(step - 1)}><ArrowLeft /> {step === 1 ? 'Cancel' : 'Back'}</button>{step < 3 ? <button className="button primary" disabled={step === 1 && (draft.title.length < 2 || draft.description.length < 20)} onClick={() => setStep(step + 1)}>Continue <ArrowRight /></button> : <button className="button primary" disabled={busy} onClick={submit}>{busy ? <RefreshCw className="spin" /> : <Send />} Submit complaint</button>}</div>
    </div>
  </Page>
}

function ComplaintDetailPage() {
  const { id } = useParams()
  const role = useAppStore((s) => s.role)
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [tab, setTab] = useState('overview')
  const load = async () => { if (!id) return; setLoading(true); try { setComplaint(await api.complaint(Number(id))) } catch (e) { toast.error(messageOf(e)) } finally { setLoading(false) } }
  useEffect(() => { load() }, [id])
  const analyze = async () => { if (!id) return; setAnalyzing(true); try { await api.analyze(Number(id)); toast.success('Dual-pipeline analysis completed'); await load() } catch (e) { toast.error(messageOf(e)) } finally { setAnalyzing(false) } }
  if (loading) return <Page><Skeleton /></Page>
  if (!complaint) return <Page><EmptyState icon={XCircle} title="Complaint not found" description="This complaint is unavailable." /></Page>
  const py = complaint.python || {}, ai = complaint.genai || {}
  return <Page>
    <div className="detail-heading"><div><Link to="/complaints" className="back-link"><ArrowLeft /> Back to complaints</Link><div className="title-row"><h1>{complaint.title}</h1><StatusBadge status={complaint.status} /></div><p><b>{complaint.complaint_code}</b> · Submitted {date(complaint.created_at)} · {complaint.channel || 'Web'}</p></div>{role !== 'customer' && <button className="button primary" disabled={analyzing} onClick={analyze}>{analyzing ? <RefreshCw className="spin" /> : <Sparkles />} {complaint.python ? 'Re-run analysis' : 'Analyze complaint'}</button>}</div>
    <div className="case-alerts">{complaint.requires_manual_review && <div className="alert warning"><AlertTriangle /><span><b>Manual review required</b>GenAI and Python require a human decision.</span><Link to="/review">Open queue</Link></div>}{py.escalation_required && <div className="alert danger"><ShieldAlert /><span><b>Mandatory escalation</b>{labelize(py.escalation_level || 'Escalation rules matched')}</span></div>}{py.prompt_injection?.detected && <div className="alert purple"><ShieldCheck /><span><b>Prompt injection contained</b>Untrusted instructions were isolated.</span></div>}</div>
    <div className="tabs">{['overview', 'comparison', 'response'].map((value) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{labelize(value)}</button>)}</div>
    {tab === 'overview' && <div className="detail-grid">
      <Panel className="span-2" title="Complaint intelligence" subtitle="Verified classification and routing" action={complaint.verification_score != null ? <Verification score={complaint.verification_score} /> : undefined}>
        {complaint.python ? <div className="intelligence-grid"><Data label="Category" value={py.issue_category} /><Data label="Subcategory" value={py.subcategory} /><Data label="Department" value={py.department} /><Data label="Urgency" value={py.urgency} badge /><Data label="Priority" value={py.priority} badge /><Data label="Sentiment" value={ai.sentiment || 'Not available'} /><Data label="Policy source" value={[py.policy_id, py.policy_section].filter(Boolean).join(' · ') || 'Not matched'} /><Data label="Escalation" value={py.escalation_required ? 'Required' : 'Not required'} /></div> : <AnalysisEmpty onAnalyze={role === 'customer' ? undefined : analyze} />}
      </Panel>
      <Panel title="SLA & follow-up" subtitle="Resolution timing"><div className="timeline-metric"><Clock3 /><span><small>Resolution due</small><b>{complaint.sla_resolution_due ? dateTime(complaint.sla_resolution_due) : 'Pending analysis'}</b></span></div><div className="progress"><i style={{ width: complaint.sla_risk ? '82%' : '34%' }} /></div><p className="muted">{complaint.sla_risk ? 'SLA risk threshold exceeded' : 'Within target window'}</p><div className="timeline-metric"><RefreshCw /><span><small>Follow-up</small><b>{complaint.follow_up_at ? dateTime(complaint.follow_up_at) : 'Not scheduled'}</b></span></div></Panel>
      <Panel className="span-2" title="Customer complaint" subtitle="Original submitted content"><p className="complaint-copy">{complaint.description}</p><div className="metadata-row"><span>Product <b>{complaint.product_or_service || '—'}</b></span><span>Order <b>{complaint.order_reference || '—'}</b></span><span>Customer <b>{labelize(complaint.customer_type)}</b></span></div></Panel>
      <Panel title="Validation controls" subtitle="Python-enforced guidance">{complaint.flags?.length ? <List title="Validation flags" items={complaint.flags.map((f) => String(f.code || 'Validation issue'))} /> : <div className="all-clear"><ShieldCheck /><span><b>No policy violations</b>Python validation passed.</span></div>}</Panel>
    </div>}
    {tab === 'comparison' && <Comparison complaint={complaint} />}
    {tab === 'response' && <div className="response-layout"><Panel className="span-2" title="Customer response draft" subtitle={`Generated by ${complaint.genai_meta?.provider || 'GenAI'} · ${complaint.genai_meta?.prompt_version || 'v1'}`}>{ai.customer_response ? <div className="response-letter">{ai.customer_response}</div> : <AnalysisEmpty />}</Panel><Panel title="Agent guidance" subtitle="Internal only"><List title="Recommended next steps" items={ai.agent_guidance || py.resolution_steps || []} /><div className="policy-source"><BookOpen /><span><small>Grounded source</small><b>{ai.policy_id || py.policy_id || 'No source'}</b><p>Section {ai.policy_section || py.policy_section || '—'}</p></span></div></Panel></div>}
  </Page>
}

function ReviewQueuePage() {
  const [rows, setRows] = useState<Complaint[]>([])
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [comment, setComment] = useState('')
  const load = async () => { try { setRows(await api.manualReview()) } catch (e) { toast.error(messageOf(e)) } }
  useEffect(() => { load() }, [])
  const act = async (action: string) => { if (!selected) return; try { await api.review(selected.id, action, comment); toast.success(`${labelize(action)} recorded`); setSelected(null); setComment(''); await load() } catch (e) { toast.error(messageOf(e)) } }
  return <Page>
    <PageHeader eyebrow="Human oversight" title="Manual review queue" description="Resolve ambiguity while preserving the original AI recommendation." />
    <div className="review-layout">
      <div className="review-list card"><div className="review-list-head"><span>{rows.length} cases pending</span><button onClick={load}><RefreshCw /></button></div>{rows.length ? rows.map((row) => <button key={row.id} className={selected?.id === row.id ? 'selected' : ''} onClick={() => setSelected(row)}><div><b>{row.complaint_code}</b><StatusBadge status={row.status} /></div><strong>{row.title}</strong><p>{row.comparison?.explanation || 'Policy conflict requires review.'}</p><span><Priority value={row.python?.priority} /><small>{date(row.created_at)}</small></span></button>) : <EmptyState icon={ShieldCheck} title="Queue is clear" description="No complaints currently require manual review." />}</div>
      <div className="review-workspace card">{selected ? <><div className="review-case-head"><div><span>{selected.complaint_code}</span><h2>{selected.title}</h2></div><Link to={`/complaints/${selected.id}`} className="text-button">Full case <ArrowRight /></Link></div><div className="split-comparison"><Intelligence title="GenAI recommendation" icon={Bot} data={selected.genai} note={genaiNote(selected)} /><Intelligence title="Python ground truth" icon={ShieldCheck} data={selected.python} verified /></div><Field label="Reviewer note" full><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Document your reasoning for the audit trail…" /></Field><div className="review-actions"><button className="button danger-outline" onClick={() => act('reject')}><XCircle /> Reject</button><button className="button secondary" onClick={() => act('escalate')}><ShieldAlert /> Escalate</button><button className="button primary" onClick={() => act('approve')}><CheckCircle2 /> Approve decision</button></div></> : <EmptyState icon={UserRoundCheck} title="Select a complaint" description="Choose a case to compare AI and Python decisions side by side." />}</div>
    </div>
  </Page>
}

function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [dialog, setDialog] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const role = useAppStore((s) => s.role)
  const [meta, setMeta] = useState({ document_code: '', title: '', version: '1.0', category: 'policy' })
  const load = async () => { try { setDocs(await api.documents()) } catch (e) { toast.error(messageOf(e)) } }
  useEffect(() => { load() }, [])
  const upload = async (e: FormEvent) => { e.preventDefault(); if (!file) return toast.error('Select a document'); const form = new FormData(); form.append('file', file); Object.entries(meta).forEach(([k, v]) => form.append(k, v)); form.append('status', 'active'); setBusy(true); try { const result = await api.uploadDocument(form); toast.success(`${result.document_code} parsed into ${result.chunks} chunks`); setDialog(false); await load() } catch (error) { toast.error(messageOf(error)) } finally { setBusy(false) } }
  return <Page>
    <PageHeader eyebrow="Grounded intelligence" title="Knowledge base" description="Manage approved policies, SOPs, and traceable source chunks." action={role === 'administrator' ? <button className="button primary" onClick={() => setDialog(true)}><Upload /> Upload document</button> : undefined} />
    <div className="kb-stats"><div><FileText /><span><b>{docs.length}</b>Documents</span></div><div><BookOpen /><span><b>{docs.reduce((sum, d) => sum + d.chunk_count, 0)}</b>Traceable chunks</span></div><div><ShieldCheck /><span><b>{docs.filter((d) => d.status === 'active').length}</b>Active policies</span></div></div>
    <div className="toolbar card"><div className="search-field"><Search /><input placeholder="Search knowledge documents…" /></div><select><option>All categories</option><option>Policy</option><option>SOP</option></select><select><option>All versions</option><option>Active</option><option>Previous</option></select></div>
    <div className="document-grid">{docs.map((doc) => <article className="document-card card" key={doc.id}><div className={`doc-icon ${doc.category}`}><FileText /></div><div className="doc-main"><div><span>{doc.document_code}</span><StatusBadge status={doc.status} /></div><h3>{doc.title}</h3><p>{labelize(doc.category)} · Version {doc.version}</p><footer><span><BookOpen /> {doc.chunk_count} chunks</span><span>Effective {doc.effective_date ? date(doc.effective_date) : '—'}</span></footer></div><button><Settings2 /></button></article>)}</div>
    {dialog && <Modal title="Upload knowledge document" close={() => setDialog(false)}><form className="upload-form" onSubmit={upload}><label className={`drop-zone ${file ? 'has-file' : ''}`}><input type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} /><Upload />{file ? <><b>{file.name}</b><span>{Math.round(file.size / 1024)} KB · Ready to parse</span></> : <><b>Drop PDF or DOCX here</b><span>or click to browse · maximum 15 MB</span></>}</label><div className="form-grid"><Field label="Document ID"><input required value={meta.document_code} onChange={(e) => setMeta({ ...meta, document_code: e.target.value })} placeholder="REF-POL-02" /></Field><Field label="Version"><input required value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} /></Field><Field label="Title" full><input required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field><Field label="Category" full><select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}><option value="policy">Policy</option><option value="sop">SOP</option><option value="faq">FAQ</option><option value="sla">SLA</option><option value="routing">Routing</option><option value="escalation">Escalation</option></select></Field></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setDialog(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Upload />} Process document</button></div></form></Modal>}
  </Page>
}

function ReportsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  useEffect(() => { api.analytics().then(setData).catch((e) => toast.error(messageOf(e))) }, [])
  return <Page>
    <PageHeader eyebrow="Operational intelligence" title="Reports & analytics" description="Measure complaint trends, compliance, and department performance." action={<div className="button-group"><button className="button secondary" onClick={() => api.downloadReport('csv')}><Download /> CSV</button><button className="button primary" onClick={() => api.downloadReport('xlsx')}><Download /> Excel report</button></div>} />
    <div className="metric-grid three"><Metric label="Verification rate" value={`${Math.max(0, 100 - (data?.genai_python_mismatches || 0) * 5)}%`} icon={ShieldCheck} tone="violet" note="GenAI / Python agreement" /><Metric label="Repeat complaints" value={data?.repeat_complaints || 0} icon={RefreshCw} tone="orange" note="Unresolved relationships" /><Metric label="SLA compliance" value={`${data?.sla_risks ? Math.max(0, 100 - data.sla_risks * 4) : 100}%`} icon={Clock3} tone="teal" note="Within resolution target" /></div>
    <div className="dashboard-grid"><Panel className="span-2" title="Department workload" subtitle="Complaints routed by Python rules"><ResponsiveContainer width="100%" height={310}><BarChart data={entries(data?.departments || {})} layout="vertical" margin={{ left: 20 }}><CartesianGrid horizontal={false} stroke="#ebeaf0" /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#6558f5" radius={[0, 6, 6, 0]} barSize={18} /></BarChart></ResponsiveContainer></Panel><Panel title="Report library" subtitle="Downloadable evidence"><div className="report-list">{[['Complaint analysis', 'csv'], ['AI / Python comparison', 'xlsx'], ['Escalation summary', 'pdf']].map(([name, format]) => <button key={name} onClick={() => api.downloadReport(format as 'csv' | 'xlsx' | 'pdf')}><div><FileText /><span><b>{name}</b><small>{format.toUpperCase()} export</small></span></div><Download /></button>)}</div></Panel></div>
  </Page>
}

function SettingsPage() {
  return <Page><PageHeader eyebrow="Administration" title="Workspace settings" description="Review pipeline configuration and integration health." /><div className="settings-grid"><Panel title="Pipeline 1 · GenAI" subtitle="Structured complaint writer"><Setting icon={Bot} label="Provider" value="Primary, then Grok, then Cursor" /><Setting icon={FileText} label="Prompt template" value="complaint_intelligence · v1" /><Setting icon={RefreshCw} label="Failure strategy" value="Retry provider, then fallback keys" /></Panel><Panel title="Pipeline 2 · Python" subtitle="Independent ground truth"><Setting icon={ShieldCheck} label="Rule engine" value="Operational" /><Setting icon={Settings2} label="Schema" value="JSON Schema 2020-12" /><Setting icon={BookOpen} label="Precedence" value="Policy → SOP → FAQ" /></Panel><Panel title="Security" subtitle="Access and adversarial controls"><Setting icon={Users} label="Authentication" value="JWT + Argon2" /><Setting icon={ShieldAlert} label="Prompt injection" value="Monitoring" /><Setting icon={Activity} label="Audit trail" value="Append-only" /></Panel></div></Page>
}

function ComplaintTable({ rows, compact, loading }: { rows: Complaint[]; compact?: boolean; loading?: boolean }) {
  if (loading) return <Skeleton />
  if (!rows.length) return <EmptyState icon={Inbox} title="No complaints yet" description="New complaints will appear here." />
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Complaint</th><th>Status</th><th>Category</th><th>Priority</th>{!compact && <th>Validation</th>}<th>Updated</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link to={`/complaints/${row.id}`}><b>{row.complaint_code}</b><span>{row.title}</span></Link></td><td><StatusBadge status={row.status} /></td><td>{row.python?.issue_category || <span className="muted">Unanalyzed</span>}</td><td><Priority value={row.python?.priority} /></td>{!compact && <td>{row.verification_score != null ? <Verification score={row.verification_score} /> : <span className="muted">Pending</span>}</td>}<td className="muted">{date(row.created_at)}</td><td><Link className="row-arrow" to={`/complaints/${row.id}`}><ArrowRight /></Link></td></tr>)}</tbody></table></div>
}

function Comparison({ complaint }: { complaint: Complaint }) {
  const fields = complaint.comparison?.fields || {}
  if (!Object.keys(fields).length) return <div className="card"><EmptyState icon={BrainCircuit} title="No comparison available" description="Run analysis to compare the two pipelines." /></div>
  return <div className="card comparison-card"><div className="comparison-head"><div><Bot />GenAI output</div><span>Field-by-field verification</span><div><ShieldCheck />Python ground truth</div></div>{Object.entries(fields).map(([field, item]) => <div className={`comparison-row ${item.match ? 'match' : 'mismatch'}`} key={field}><span>{text(item.genai)}</span><div><b>{labelize(field)}</b><i>{item.match ? <><Check /> Match</> : <><X /> Mismatch</>}</i></div><span>{text(item.python)}</span></div>)}</div>
}

function Brand({ light }: { light?: boolean }) { return <div className={`brand ${light ? 'brand-light' : ''}`}><div className="brand-mark"><Sparkles /></div><div><span>SupportNova</span><small>ResponseX AI</small></div></div> }
function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) { return <div className={`page ${narrow ? 'narrow' : ''}`}>{children}</div> }
function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <header className="page-header"><div><span className="eyebrow purple">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header> }
function Panel({ title, subtitle, children, action, className = '' }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) { return <section className={`panel card ${className}`}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header><div className="panel-content">{children}</div></section> }
function Metric({ label, value, icon: Icon, tone, note }: { label: string; value: string | number; icon: typeof Inbox; tone: string; note: string }) { return <article className="metric-card card"><div className={`metric-icon ${tone}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article> }
function StatusBadge({ status }: { status: string }) { return <span className={`status-badge ${status}`}>{status === 'active' && <CheckCircle2 />}{STATUS_LABEL[status] || labelize(status)}</span> }
function Priority({ value }: { value?: string }) { return value ? <span className={`priority ${(value || '').toLowerCase()}`}><i />{value}</span> : <span className="muted">—</span> }
function Verification({ score }: { score: number }) { return <span className={`verification ${score >= 80 ? 'good' : score >= 60 ? 'partial' : 'bad'}`}><ShieldCheck /> {Math.round(score)}% verified</span> }
function Data({ label, value, badge }: { label: string; value?: string; badge?: boolean }) { return <div className="data-point"><span>{label}</span><b className={badge ? `value-badge ${(value || '').toLowerCase()}` : ''}>{value || '—'}</b></div> }
function Field({ label, children, full, note }: { label: string; children: ReactNode; full?: boolean; note?: string }) { return <label className={`field ${full ? 'full' : ''}`}>{label}{children}{note && <small>{note}</small>}</label> }
function FormSection({ icon: Icon, title, description, children }: { icon: typeof Inbox; title: string; description: string; children: ReactNode }) { return <section className="form-section"><header><div><Icon /></div><span><h2>{title}</h2><p>{description}</p></span></header><div className="form-grid">{children}</div></section> }
function List({ title, items }: { title: string; items: string[] }) { return <div className="list-block"><h4>{title}</h4>{items.map((item, i) => <p key={i}><CheckCircle2 />{item}</p>)}</div> }
function genaiNote(complaint: Complaint): string | undefined {
  const meta = complaint.genai_meta
  if (!meta) return 'GenAI analysis has not run for this complaint yet. The Python ground truth is authoritative.'
  if (meta.available === false) return `GenAI analysis failed${meta.provider ? ` on ${meta.provider}` : ''}: ${meta.error || 'no structured output was returned'}. The Python ground truth is authoritative.`
  if (meta.stale) return `Showing the last successful ${meta.provider || 'GenAI'} output. The most recent attempt failed${meta.error ? `: ${meta.error}` : ''}.`
  return undefined
}

function Intelligence({ title, icon: Icon, data, verified, note }: { title: string; icon: typeof Bot; data?: ComplaintIntelligence | null; verified?: boolean; note?: string }) {
  const values = data || {}
  const empty = Object.keys(values).length === 0
  const items = [['Category', values.issue_category], ['Subcategory', values.subcategory], ['Department', values.department], ['Urgency', values.urgency], ['Priority', values.priority], ['Escalation', values.escalation_required ? values.escalation_level || 'Required' : 'Not required'], ['Policy', values.policy_id]]
  return <div className={verified ? 'verified-column' : ''}><h3><Icon />{title}{verified && <CheckCircle2 />}</h3>{empty ? <p className="intelligence-empty">{note || 'No output recorded for this complaint.'}</p> : <>{items.map(([k, v]) => <p key={String(k)}><span>{String(k)}</span><b>{text(v)}</b></p>)}{note && <p className="intelligence-note">{note}</p>}</>}</div>
}
function Setting({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) { return <div className="setting-row"><div><Icon /></div><span><b>{label}</b><small>{value}</small></span></div> }
function EmptyState({ icon: Icon, title, description }: { icon: typeof Inbox; title: string; description: string }) { return <div className="empty-state"><div><Icon /></div><h3>{title}</h3><p>{description}</p></div> }
function AnalysisEmpty({ onAnalyze }: { onAnalyze?: () => void }) { return <div className="analysis-empty"><div><BrainCircuit /></div><h3>Analysis is waiting</h3><p>Run both intelligence pipelines to classify, route, and validate this complaint.</p>{onAnalyze && <button className="button primary" onClick={onAnalyze}><Sparkles /> Analyze now</button>}</div> }
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) { return <div className="modal-backdrop" onMouseDown={close}><section className="modal card" onMouseDown={(e) => e.stopPropagation()}><header><h2>{title}</h2><button onClick={close}><X /></button></header>{children}</section></div> }
function Avatar({ name }: { name: string }) { return <div className="avatar">{name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div> }
function Skeleton() { return <div className="skeleton-wrap">{[1, 2, 3, 4].map((i) => <i className="skeleton" key={i} />)}</div> }

function navigationFor(role: Role | null) {
  const nav = [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/complaints', label: role === 'customer' ? 'My complaints' : 'Complaints', icon: Inbox }]
  if (role === 'customer') return nav
  nav.push({ to: '/review', label: 'Review queue', icon: UserRoundCheck } as typeof nav[number], { to: '/knowledge', label: 'Knowledge base', icon: BookOpen } as typeof nav[number])
  if (role === 'manager' || role === 'administrator') nav.push({ to: '/reports', label: 'Reports', icon: BarChart3 } as typeof nav[number])
  if (role === 'administrator') nav.push({ to: '/settings', label: 'Settings', icon: Settings2 } as typeof nav[number])
  return nav
}
function deriveMetrics(rows: Complaint[]): Metrics {
  const count = (fn: (c: Complaint) => string | undefined) => rows.reduce<Record<string, number>>((a, c) => { const k = fn(c) || 'Unanalyzed'; a[k] = (a[k] || 0) + 1; return a }, {})
  return { total: rows.length, statuses: count((c) => c.status), categories: count((c) => c.python?.issue_category), departments: count((c) => c.python?.department), priorities: count((c) => c.python?.priority), sentiments: count((c) => c.genai?.sentiment), escalations: rows.filter((c) => c.status === 'escalated').length, sla_risks: rows.filter((c) => c.sla_risk).length, genai_python_mismatches: rows.filter((c) => c.comparison?.status === 'manual_review').length, manual_review_cases: rows.filter((c) => c.requires_manual_review).length, repeat_complaints: rows.filter((c) => c.is_repeat).length }
}
const entries = (data: Record<string, number>) => Object.entries(data).map(([name, value]) => ({ name: labelize(name), value }))
const labelize = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase())
const date = (value: string) => new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
const dateTime = (value: string) => new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const text = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : value == null || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : String(value)
const greeting = () => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
const messageOf = (error: unknown) => error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong'
