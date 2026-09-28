import { Fragment, useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Scale, PencilLine, Image as ImageIcon,
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookOpen, Bot,
  BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileText,
  FlaskConical, Filter, History, Inbox, LayoutDashboard, LogOut, Menu, MessageSquareText, Plus,
  RefreshCw, Search, Send, Settings2, ShieldAlert, ShieldCheck, Sparkles, TrendingUp, Upload,
  UserRoundCheck, Users, X, XCircle, Moon, Sun, Package, Copy, Printer, Compass, Globe, Star,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import {
  Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams,
} from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { api, ApiError, queryString, UNAUTHORIZED_EVENT } from './api'
import type { ReportKey } from './api'
import { useAppStore } from './store'
import Assistant from './Assistant'
import SupportNovaLoginHero from './SupportNovaLoginHero'
import SystemTourModal from './SystemTourModal'
import TeamPage from './TeamPage'
import './team-members.css'
import CategoryOverviewStats from './CategoryOverviewStats'
import { Conversation, EvaluationPage, NotificationBell, StarRating } from './Engagement'
import { STATUS_LABEL, Page, PageHeader, Panel, Metric, StatusBadge, Priority, Field, EmptyState, Skeleton, labelize, date, dateTime, messageOf, entries } from './ui'
import type {
  BriefComplaint, Category, Complaint, ComplaintDraft, ComplaintHistory, ComplaintIntelligence, Department,
  DocumentChunk, EscalationRule, GenAIConfig, KnowledgeDocument, Metrics, PriorityRule, Role, Rule, SlaPolicy,
  Attachment, PolicyImpact, Trends, User,
  Product, Order,
} from './types'

const COLORS = ['#6558f5', '#9b8cff', '#26b6a0', '#f59f47', '#f15c6d', '#7196f3', '#b28be8', '#4fb3d9']
const TONES = ['professional', 'empathetic', 'concise', 'formal']
const DOC_CATEGORIES = ['policy', 'sop', 'faq', 'sla', 'routing', 'escalation', 'compliance', 'guideline', 'template']
const DOC_STATUSES = ['active', 'draft', 'previous', 'superseded']
const ESCALATION_LEVELS = ['no_escalation', 'supervisor_review', 'department_manager', 'specialist_team', 'compliance_review', 'critical_management']
const URGENCIES = ['low', 'medium', 'high', 'critical']
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const REVIEWER_ROLES: Role[] = ['reviewer', 'manager', 'administrator']
const REPORTS: Array<[ReportKey, string]> = [
  ['complaints', 'Complaint analysis'], ['comparison', 'GenAI / Python comparison'], ['escalations', 'Escalations'],
  ['sla', 'SLA status'], ['manual_review', 'Manual reviews'], ['departments', 'Department performance'],
  ['policy_usage', 'Policy usage'], ['resolution_compliance', 'Resolution compliance'],
]

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ur_roman: 'Roman Urdu',
  ur: 'Urdu',
  hi: 'Hindi',
  ms: 'Malay',
  auto: 'Auto Detect',
}

const CSAT_LABELS: Record<number, string> = {
  1: '1 — Very dissatisfied',
  2: '2 — Dissatisfied',
  3: '3 — Neutral',
  4: '4 — Satisfied',
  5: '5 — Very satisfied',
}

function LanguagePreferenceSelector() {
  const role = useAppStore((s) => s.role)
  const [pref, setPref] = useState('auto')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (role === 'customer') {
      api.customerLanguagePreference()
        .then((res) => { if (res.preferred_language) setPref(res.preferred_language) })
        .catch(() => undefined)
    }
  }, [role])

  const changeLanguage = async (next: string) => {
    setPref(next)
    if (role === 'customer') {
      setSaving(true)
      try {
        await api.updateCustomerLanguagePreference(next)
        toast.success(`Language preference set to ${LANGUAGE_NAMES[next] || next}`)
      } catch (err) {
        toast.error(messageOf(err))
      } finally {
        setSaving(false)
      }
    }
  }

  if (role !== 'customer') return null

  return (
    <div className="topbar-language-select">
      <Globe className="topbar-globe-icon" />
      <select
        value={pref}
        disabled={saving}
        onChange={(e) => changeLanguage(e.target.value)}
        title="Preferred language for customer updates"
      >
        <option value="auto">Auto Detect</option>
        <option value="en">English</option>
        <option value="ur_roman">Roman Urdu</option>
        <option value="ur">Urdu (اردو)</option>
        <option value="hi">Hindi (हिन्दी)</option>
        <option value="ms">Malay (Bahasa Melayu)</option>
      </select>
    </div>
  )
}

function TranslatedTextToggle({
  originalText,
  translatedText,
  sourceLanguage,
  confidence,
  compact = false,
}: {
  originalText: string
  translatedText?: string | null
  sourceLanguage?: string | null
  confidence?: number | null
  compact?: boolean
}) {
  const [showOriginal, setShowOriginal] = useState(false)
  const hasTranslation = !!translatedText && translatedText.trim() !== '' && translatedText.trim() !== originalText.trim()
  const langName = (sourceLanguage && LANGUAGE_NAMES[sourceLanguage]) || sourceLanguage || 'Detected language'
  const confidencePct = confidence ? Math.round(confidence * 100) : 95

  if (!hasTranslation || sourceLanguage === 'en') {
    return <p className={`complaint-copy ${compact ? 'compact' : ''}`}>{originalText}</p>
  }

  return (
    <div className="translated-text-wrapper" style={{ margin: compact ? '4px 0' : '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
        <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem' }}>
          <Globe style={{ width: 12, height: 12 }} />
          {langName} · {confidencePct}%
        </span>
        <button
          type="button"
          className="text-button"
          style={{ fontSize: '0.76rem', textDecoration: 'underline' }}
          onClick={() => setShowOriginal(!showOriginal)}
        >
          {showOriginal ? 'View English Translation' : 'View Original'}
        </button>
      </div>
      <p className={`complaint-copy ${compact ? 'compact' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
        {showOriginal ? originalText : translatedText}
      </p>
      <small className="muted" style={{ fontSize: '0.72rem', display: 'block', marginTop: '2px' }}>
        {showOriginal ? `(Original customer submission in ${langName})` : '(English Translation)'}
      </small>
    </div>
  )
}

export default function SupportNovaApp() {
  const { authenticated, user, restore, logout } = useAppStore()
  useEffect(() => { restore() }, [restore])
  useEffect(() => {
    const onUnauthorized = () => { logout(); toast.error('Your session expired. Please sign in again.') }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [logout])
  return <>
    <Routes>
      <Route path="/login" element={authenticated ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/*" element={!authenticated ? <Navigate to="/login" replace /> : user ? <AppShell /> : <SessionCheck />} />
    </Routes>
    <Toaster richColors position="top-right" closeButton />
  </>
}

// Nothing role-specific renders until the server has confirmed who the user is.
function SessionCheck() {
  return <main className="session-check"><Brand /><p><RefreshCw className="spin" /> Verifying your session…</p></main>
}

/* ── Team Page Nav Button ──────────────────────────────────────────────── */
function TeamNavBtn() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="login-team-btn"
      onClick={() => navigate('/team')}
      title="Meet the Team — SupportNova Project Credits"
      aria-label="Open Team Page"
    >
      <div className="team-btn-icon-bubble"><Users size={16} /></div>
      <div className="team-btn-label-group">
        <span className="team-btn-label-title">Our Team</span>
        <span className="team-btn-label-sub">3 Mentors · 4 Members</span>
      </div>
    </button>
  )
}

function LoginPage() {
  const login = useAppStore((s) => s.login)
  const loading = useAppStore((s) => s.loading)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@supportnova.example')
  const [password, setPassword] = useState('ChangeMeNow!23')
  const [showProfiles, setShowProfiles] = useState(false)
  const [showGlobalTour, setShowGlobalTour] = useState(false)
  const profiles = [
    ['Administrator', 'admin@supportnova.example', 'ChangeMeNow!23'],
    ['Agent', 'agent@supportnova.example', 'AgentPass!23'],
    ['Reviewer', 'reviewer@supportnova.example', 'ReviewPass!23'],
    ['Manager', 'manager@supportnova.example', 'ManagerPass!23'],
    ['Customer', 'customer@supportnova.example', 'CustomerPass!23'],
  ]
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await login(email, password); toast.success('Welcome back'); navigate('/') }
    catch (error) { toast.error(messageOf(error)) }
  }
  return <main className="auth-page">
    <button type="button" className="auth-theme-toggle icon-button" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} aria-label="Toggle theme">
      {theme === 'light' ? <Moon /> : <Sun />}
    </button>
    <section className="auth-story auth-story-hero">
      <SupportNovaLoginHero />
    </section>
    <section className="auth-panel">
      <div className="login-card-container">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-brand"><Brand light={false} /></div>
          <div className="login-card-header">
            <span className="login-eyebrow">SECURE WORKSPACE</span>
            <h2>Welcome back</h2>
            <p className="login-subtitle">Sign in to manage customer intelligence.</p>
          </div>
          
          <div className="login-fields-group">
            <label className="login-input-label">
              <span>Email address</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="name@supportnova.example"
                autoComplete="email"
                required
              />
            </label>

            <label className="login-input-label">
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
              />
            </label>
          </div>

          <button className="button primary full login-submit-btn" disabled={loading} type="submit">
            {loading ? <><RefreshCw className="spin" /> Signing in…</> : <><span>Sign in</span> <ArrowRight /></>}
          </button>

          <div className="demo-profiles-section">
            <button
              type="button"
              className="demo-toggle"
              onClick={() => setShowProfiles(!showProfiles)}
              aria-expanded={showProfiles}
            >
              <span>Use a demo profile</span>
              <ChevronDown className={showProfiles ? 'rotate' : ''} />
            </button>

            {showProfiles && (
              <div className="demo-list">
                {profiles.map(([name, mail, pass]) => (
                  <button
                    type="button"
                    key={name}
                    className={`demo-profile-item ${email === mail ? 'active' : ''}`}
                    onClick={() => { setEmail(mail); setPassword(pass); setShowProfiles(false) }}
                  >
                    <div className="demo-profile-row">
                      <span className="demo-profile-role">{name}</span>
                      <small className="demo-profile-email">{mail}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="security-note">
            <ShieldCheck />
            <span>Role-based permissions · JWT sessions</span>
          </div>
        </form>
      </div>
    </section>

    {/* Access Point 1: Bottom-Left Project Tour / System Guide button */}
    <button
      type="button"
      className="login-project-tour-btn"
      onClick={() => setShowGlobalTour(true)}
      title="Explore Complete Role-Based Project Tour & System Architecture"
      aria-label="Open System Tour"
    >
      <div className="tour-btn-icon-bubble">?</div>
      <div className="tour-btn-label-group">
        <span className="tour-btn-label-title">Project Tour</span>
        <span className="tour-btn-label-sub">5 Roles · System Guide</span>
      </div>
    </button>

    <SystemTourModal
      isOpen={showGlobalTour}
      onClose={() => setShowGlobalTour(false)}
    />

    {/* Access Point 2: Bottom-Right Team Page navigation button */}
    <TeamNavBtn />
  </main>
}

function AppShell() {
  const { user, role, sidebarOpen, setSidebarOpen, logout, theme, toggleTheme } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const nav = navigationFor(role)
  const pageName = nav.find((item) => item.to === location.pathname)?.label
    || (location.pathname === '/complaints/new' ? 'New complaint' : location.pathname.startsWith('/complaints/') ? 'Complaint details' : 'Workspace')
  const [search, setSearch] = useState('')
  const [health, setHealth] = useState<{ ok: boolean; text: string }>({ ok: true, text: 'Checking…' })
  const [showRoleGuide, setShowRoleGuide] = useState(false)
  useEffect(() => {
    const check = () => api.health()
      .then((h) => setHealth({ ok: h.database === 'ok', text: h.database !== 'ok' ? 'Database unavailable' : h.genai_configured ? 'API, DB & GenAI keys configured' : 'API & DB online · no GenAI key' }))
      .catch(() => setHealth({ ok: false, text: 'API unreachable' }))
    check()
    const timer = window.setInterval(check, 60000)
    return () => window.clearInterval(timer)
  }, [])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('supportnova_sidebar_collapsed') === 'true') || false)
  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') localStorage.setItem('supportnova_sidebar_collapsed', String(next))
      return next
    })
  }
  const runSearch = (e: FormEvent) => { e.preventDefault(); navigate(`/complaints${queryString({ q: search.trim() })}`) }
  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Brand collapsed={sidebarCollapsed} />
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={toggleSidebarCollapse}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X /></button>
      </div>
      <nav>
        <p>Workspace</p>
        {nav.map(({ to, label, icon: Icon, end }) =>
          <NavLink
            key={to}
            to={to}
            end={end}
            title={sidebarCollapsed ? label : undefined}
            onClick={() => setSidebarOpen(false)}
          >
            <Icon />
            <span>{label}</span>
            {label === 'Review queue' && <i>AI</i>}
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="health-chip" title={health.text}>
          <i className={health.ok ? 'live-dot' : 'live-dot down'} />
          <div>
            <b>{health.ok ? 'Systems online' : 'Attention needed'}</b>
            <small>{health.text}</small>
          </div>
        </div>
        <div className="user-menu" title={`${user?.full_name || 'User'} (${labelize(role || '')})`}>
          <Avatar name={user?.full_name || 'User'} />
          <div>
            <b>{user?.full_name || 'Loading…'}</b>
            <small>{labelize(role || '')}</small>
          </div>
          <button title="Sign out" onClick={() => { logout(); navigate('/login') }}><LogOut /></button>
        </div>
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-title"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><span>Workspace</span><b>{pageName}</b></div></div>
        <div className="topbar-actions"><form className="search-shell" onSubmit={runSearch}><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={role === 'customer' ? 'Search my complaints…' : 'Search ID, title, order or customer…'} /></form><LanguagePreferenceSelector /><NotificationBell /><button type="button" className="topbar-role-guide-btn" onClick={() => setShowRoleGuide(true)} title={`Open ${labelize(role || '')} Role Guide`} aria-label="Role Guide"><Compass /><span>Role Guide</span></button><button type="button" className="icon-button theme-toggle-button" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>{theme === 'light' ? <Moon /> : <Sun />}</button><Link className="button primary compact" to="/complaints/new"><Plus /> New complaint</Link></div>
      </header>
      <main className="workspace"><Routes>
        <Route index element={role === 'customer' ? <CustomerDashboard /> : <DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="orders" element={<OrderHistoryPage />} />
        <Route path="complaints" element={<ComplaintsPage />} />
        <Route path="complaints/new" element={<NewComplaintPage />} />
        <Route path="complaints/:id" element={<ComplaintDetailPage />} />
        {role && REVIEWER_ROLES.includes(role) && <Route path="review" element={<ReviewQueuePage />} />}
        {role !== 'customer' && <Route path="knowledge" element={<KnowledgePage />} />}
        {(role === 'manager' || role === 'administrator') && <Route path="reports" element={<ReportsPage />} />}
        {(role === 'manager' || role === 'administrator') && <Route path="evaluation" element={<EvaluationPage />} />}
        {role === 'administrator' && <Route path="settings" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes></main>
    </div>
    <Assistant />
    <SystemTourModal
      isOpen={showRoleGuide}
      specificRole={role}
      onClose={() => setShowRoleGuide(false)}
    />
  </div>
}

function CustomerDashboard() {
  const { user } = useAppStore()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.customerDashboard>>>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.customerDashboard().then(setRows).catch((e) => toast.error(messageOf(e))).finally(() => setLoading(false)) }, [])
  const open = rows.filter((r) => r.resolution_status === 'open')
  return <Page>
    <PageHeader eyebrow={`${greeting()}, ${user?.full_name?.split(' ')[0] || 'there'}`} title="Your support journey" description="Track your complaints and the latest update on each one." action={<Link className="button primary" to="/complaints/new"><Plus /> New complaint</Link>} />
    <div className="metric-grid three">
      <Metric label="Total complaints" value={rows.length} icon={Inbox} tone="violet" note="Submitted by you" />
      <Metric label="Open" value={open.length} icon={Clock3} tone="orange" note="Being worked on" />
      <Metric label="Resolved" value={rows.length - open.length} icon={CheckCircle2} tone="teal" note="Resolved or closed" />
    </div>
    <Panel title="My complaints" subtitle="Status, department and latest update">
      {loading ? <Skeleton /> : rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Complaint</th><th>Status</th><th>Department</th><th>Latest update</th><th>Submitted</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link to={`/complaints/${row.id}`}><b>{row.complaint_code}</b><span>{row.title}</span></Link></td><td><StatusBadge status={row.status} /></td><td>{row.department || <span className="muted">Pending</span>}</td><td className="muted">{row.latest_update}</td><td className="muted">{date(row.submitted_date)}</td><td><Link className="row-arrow" to={`/complaints/${row.id}`}><ArrowRight /></Link></td></tr>)}</tbody></table></div> : <EmptyState icon={Inbox} title="No complaints yet" description="Submit a complaint and track it here." />}
    </Panel>
  </Page>
}

function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  useEffect(() => {
    setLoading(true)
    api.products()
      .then((data) => {
        setProducts(data)
        setError(null)
      })
      .catch((e) => {
        setError(messageOf(e))
        toast.error(`Failed to load products: ${messageOf(e)}`)
      })
      .finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))]

  const filtered = products.filter((p) => {
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory
    const q = search.toLowerCase().trim()
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.productNumber.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
    return matchesCat && matchesSearch
  })

  const handleProductSelect = (product: Product) => {
    navigate(`/complaints/new?orderReference=${encodeURIComponent(product.productNumber)}&product=${encodeURIComponent(product.name)}`, {
      state: {
        prefill: {
          order_reference: product.productNumber,
          product_or_service: product.name,
        },
      },
    })
    toast.info(`Prefilled Order Reference with ${product.productNumber}`)
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Certified Hardware & Peripherals"
        title="Products"
        description="Browse certified SupportNova electronics. Click any product's action arrow to initiate an instant verified support case."
        action={
          <div className="product-header-badge">
            <span>{products.length} Products in Catalog</span>
          </div>
        }
      />

      <div className="catalog-toolbar">
        <div className="catalog-search-wrap">
          <Search className="catalog-search-icon" />
          <input
            type="text"
            className="catalog-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by title, reference (e.g. NC-000001), or specs…"
          />
          {search && (
            <button type="button" className="catalog-search-clear" onClick={() => setSearch('')}>
              <X />
            </button>
          )}
        </div>

        <div className="category-chips tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="products-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card product-card product-card-skeleton" style={{ minHeight: '380px', padding: '16px' }}>
              <Skeleton />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load products"
          description={error}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products available"
          description={search ? 'No products matched your search filters. Try clearing your search term.' : 'No certified products are currently available in the database.'}
        />
      ) : (
        <div className="products-grid">
          {filtered.map((product) => (
            <article key={product.productNumber} className="card product-card">
              <div className="product-card-visual" onClick={() => handleProductSelect(product)}>
                <img
                  src={product.image}
                  alt={product.name}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = '/logo.png'
                  }}
                />
                <span className="product-category-tag">{product.category}</span>
              </div>

              <div className="product-card-body">
                <div className="product-ref-row">
                  <span className="product-ref-label">Reference</span>
                  <code className="product-ref-code">{product.productNumber}</code>
                </div>

                <h3 className="product-card-title" title={product.name}>
                  {product.name}
                </h3>

                <p className="product-card-desc">
                  {product.description}
                </p>

                {product.specs && Object.keys(product.specs).length > 0 && (
                  <div className="product-specs-chips">
                    {Object.entries(product.specs).slice(0, 2).map(([key, val]) => (
                      <span key={key} className="spec-chip" title={`${key}: ${val}`}>
                        <b>{key}:</b> {String(val)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="product-card-footer">
                <div className="product-price-box">
                  <small>Price</small>
                  <strong>${product.price.toFixed(2)}</strong>
                </div>

                <button
                  type="button"
                  className="product-arrow-action-btn"
                  onClick={() => handleProductSelect(product)}
                  title={`Select ${product.name} (${product.productNumber}) to submit a complaint`}
                  aria-label={`Open complaint for ${product.name}`}
                >
                  <span>File complaint</span>
                  <div className="arrow-circle">
                    <ArrowRight />
                  </div>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Page>
  )
}

function OrderHistoryPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedOrder, setCopiedOrder] = useState<string | null>(null)
  const [activeInvoice, setActiveInvoice] = useState<Order | null>(null)
  const [downloadingFormat, setDownloadingFormat] = useState<{ id: string; format: 'pdf' | 'image' } | null>(null)

  useEffect(() => {
    setLoading(true)
    api.orders()
      .then((data) => {
        setOrders(data)
        setError(null)
      })
      .catch((e) => {
        setError(messageOf(e))
        toast.error(`Failed to load order history: ${messageOf(e)}`)
      })
      .finally(() => setLoading(false))
  }, [])

  const copyOrderNumber = async (orderNumber: string) => {
    try {
      await navigator.clipboard.writeText(orderNumber)
      setCopiedOrder(orderNumber)
      toast.success(`Order number ${orderNumber} copied to clipboard`)
      setTimeout(() => setCopiedOrder((cur) => cur === orderNumber ? null : cur), 2500)
    } catch {
      toast.error(`Could not copy ${orderNumber}`)
    }
  }

  const handleOrderComplaint = (order: Order) => {
    const primaryItem = order.items?.[0]
    navigate(`/complaints/new?orderReference=${encodeURIComponent(order.orderNumber)}&product=${encodeURIComponent(primaryItem?.productName || '')}`, {
      state: {
        prefill: {
          order_reference: order.orderNumber,
          product_or_service: primaryItem?.productName || '',
        },
      },
    })
    toast.info(`Prefilled Order Reference with ${order.orderNumber}`)
  }

  const handleDownloadInvoice = async (order: Order, format: 'pdf' | 'image') => {
    setDownloadingFormat({ id: order.orderNumber, format })
    try {
      if (format === 'image') {
        await api.downloadInvoiceImage(order.orderNumber)
        toast.success(`Image invoice downloaded for ${order.orderNumber}`)
      } else {
        await api.downloadInvoicePdf(order.orderNumber)
        toast.success(`PDF invoice downloaded for ${order.orderNumber}`)
      }
    } catch (e) {
      toast.error(`Failed to download ${format.toUpperCase()} invoice: ${messageOf(e)}`)
    } finally {
      setDownloadingFormat(null)
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Purchases & Official Receipts"
        title="Order History"
        description="Review previous orders retrieved from your account. Copy verified order references, download purchase slips, or file support cases."
        action={
          <Link className="button secondary compact" to="/products">
            <Package />
            <span>Browse Products</span>
          </Link>
        }
      />

      {loading ? (
        <div className="orders-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card order-card order-card-skeleton" style={{ minHeight: '180px', padding: '16px' }}>
              <Skeleton />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load orders"
          description={error}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={History}
          title="No orders yet"
          description="You haven't placed any orders with this customer account yet. Browse our hardware catalog to get started."
        />
      ) : (
        <div className="orders-list">
          {orders.map((order) => {
            const primaryItem = order.items?.[0]
            const isCopied = copiedOrder === order.orderNumber
            const isDownloadingPdf = downloadingFormat?.id === order.orderNumber && downloadingFormat?.format === 'pdf'
            const isDownloadingImage = downloadingFormat?.id === order.orderNumber && downloadingFormat?.format === 'image'

            return (
              <article key={order.orderNumber} className="card order-card">
                <header className="order-card-header">
                  <div className="order-header-left">
                    <span className="status-badge resolved">
                      <CheckCircle2 /> {order.paymentStatus || 'PAID'}
                    </span>
                    <span className="order-date-label">
                      {date(order.createdAt)}
                    </span>
                  </div>
                  <div className="order-header-right">
                    <span className="order-payment-method-chip">
                      {order.paymentMethod || 'SupportNovaPay'}
                    </span>
                  </div>
                </header>

                <div className="order-card-grid">
                  <div className="order-product-visual" onClick={() => handleOrderComplaint(order)}>
                    <img
                      src={primaryItem?.image || '/products/prod_1.jpg'}
                      alt={primaryItem?.productName || 'Ordered Item'}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = '/products/prod_1.jpg' }}
                    />
                    {order.items?.length > 1 && (
                      <span className="order-multi-pill">+{order.items.length - 1} more</span>
                    )}
                  </div>

                  <div className="order-card-details">
                    <div className="order-title-row">
                      <h3 className="order-product-name">
                        {primaryItem?.productName || 'Order Items'}
                      </h3>
                    </div>

                    <div className="order-number-block">
                      <span className="order-number-title">Order Number</span>
                      <div className="order-number-badge">
                        <code className="order-number-value">{order.orderNumber}</code>
                        <button
                          type="button"
                          className={`order-copy-btn ${isCopied ? 'copied' : ''}`}
                          onClick={(e) => { e.stopPropagation(); copyOrderNumber(order.orderNumber) }}
                          title="Copy order number to clipboard"
                        >
                          {isCopied ? <Check /> : <Copy />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="order-stats-grid">
                      <div className="order-stat-box">
                        <span className="stat-label">Quantity</span>
                        <strong className="stat-value">{order.quantity} item{order.quantity !== 1 ? 's' : ''}</strong>
                      </div>
                      <div className="order-stat-box">
                        <span className="stat-label">Total Amount</span>
                        <strong className="stat-value price">${order.totalAmount.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div className="order-summary-container">
                      <span className="stat-label">Order Summary</span>
                      <p className="order-summary-text">{order.orderSummary}</p>
                    </div>
                  </div>
                </div>

                <footer className="order-card-footer">
                  <div className="order-footer-left">
                    <button
                      type="button"
                      className="button secondary compact invoice-btn"
                      disabled={isDownloadingPdf}
                      onClick={() => handleDownloadInvoice(order, 'pdf')}
                      title={`Download official PDF invoice for ${order.orderNumber}`}
                    >
                      {isDownloadingPdf ? <RefreshCw className="spin" /> : <Download />}
                      <span>PDF Invoice</span>
                    </button>
                    <button
                      type="button"
                      className="button secondary compact invoice-btn"
                      disabled={isDownloadingImage}
                      onClick={() => handleDownloadInvoice(order, 'image')}
                      title={`Download official PNG image invoice for ${order.orderNumber}`}
                    >
                      {isDownloadingImage ? <RefreshCw className="spin" /> : <ImageIcon />}
                      <span>Image Invoice</span>
                    </button>
                    <button
                      type="button"
                      className="button ghost compact preview-invoice-btn"
                      onClick={() => setActiveInvoice(order)}
                      title="Inspect purchase receipt"
                    >
                      <FileText />
                      <span>View Receipt</span>
                    </button>
                  </div>

                  <div className="order-footer-right">
                    <button
                      type="button"
                      className="button primary compact order-complaint-btn"
                      onClick={() => handleOrderComplaint(order)}
                      title={`Open complaint form for order ${order.orderNumber}`}
                    >
                      <span>Get help with this order</span>
                      <ArrowRight />
                    </button>
                  </div>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {activeInvoice && (
        <InvoiceModal order={activeInvoice} close={() => setActiveInvoice(null)} />
      )}
    </Page>
  )
}

function InvoiceModal({ order, close }: { order: Order; close: () => void }) {
  const [downloading, setDownloading] = useState<'pdf' | 'image' | null>(null)
  const handlePrint = () => {
    window.print()
  }
  const handleDownload = async (format: 'pdf' | 'image') => {
    setDownloading(format)
    try {
      if (format === 'image') {
        await api.downloadInvoiceImage(order.orderNumber)
        toast.success(`Image Invoice ${order.orderNumber} downloaded`)
      } else {
        await api.downloadInvoicePdf(order.orderNumber)
        toast.success(`PDF Invoice ${order.orderNumber} downloaded`)
      }
    } catch (e) {
      toast.error(`Download failed: ${messageOf(e)}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="invoice-modal-overlay" onMouseDown={close}>
      <div className="invoice-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="invoice-modal-toolbar">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="button primary compact" onClick={() => handleDownload('pdf')} disabled={downloading !== null}>
              {downloading === 'pdf' ? <RefreshCw className="spin" /> : <Download />}
              <span>Download PDF</span>
            </button>
            <button type="button" className="button secondary compact" onClick={() => handleDownload('image')} disabled={downloading !== null}>
              {downloading === 'image' ? <RefreshCw className="spin" /> : <ImageIcon />}
              <span>Download Image</span>
            </button>
            <button type="button" className="button ghost compact" onClick={handlePrint}>
              <Printer />
              <span>Print</span>
            </button>
          </div>
          <button type="button" className="icon-button compact" onClick={close} title="Close invoice">
            <X />
          </button>
        </div>

        <div className="invoice-modal-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>SupportNova</h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>SupportNova Intelligent Commerce</p>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', textAlign: 'right' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>Official Proof</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Purchase Receipt</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '22px', border: '1px solid #edf2f7' }}>
            <div>
              <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Order Number</span>
              <code style={{ fontSize: '15px', fontWeight: 800, color: '#4f46e5', fontFamily: 'monospace' }}>{order.orderNumber}</code>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Purchase Date</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{date(order.createdAt)}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Payment Status</span>
              <span style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>{order.paymentStatus || 'PAID'}</span>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b', marginBottom: '2px' }}>Payment Method</span>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>{order.paymentMethod || 'SupportNovaPay'}</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Item Description</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <strong>{item.productName}</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748b', fontFamily: 'monospace' }}>{item.productNumber}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>${item.unitPrice.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>${item.totalPrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '20px 0' }}>
            <div style={{ width: '220px', borderTop: '2px solid #0f172a', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13.5px' }}>
                <span>Subtotal</span>
                <span>${order.totalAmount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13.5px' }}>
                <span>Tax & Shipping</span>
                <span>$0.00</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#0f172a', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                <span>Total Amount</span>
                <span>${order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '18px', fontSize: '12.5px', color: '#64748b' }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#1e293b' }}>Thank you for your purchase!</p>
            <p style={{ margin: 0 }}>Reference Order Number <strong>{order.orderNumber}</strong> in the SupportNova customer portal if you need any assistance.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardPage() {
  const { role, user, metrics, complaints, loadComplaints, loadMetrics } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState<Awaited<ReturnType<typeof api.agentDashboard>> | null>(null)
  const managerView = role === 'administrator' || role === 'manager'
  useEffect(() => {
    Promise.all([
      loadComplaints(),
      managerView ? loadMetrics() : Promise.resolve(),
      api.agentDashboard().then(setAgent),
    ]).catch((e) => toast.error(messageOf(e))).finally(() => setLoading(false))
  }, [loadComplaints, loadMetrics, managerView])
  const data = (managerView && metrics) || deriveMetrics(complaints)
  const categories = entries(data.categories).slice(0, 8)
  const priorities = entries(data.priorities)
  const agreement = data.agreement_rate
  return <Page>
    <PageHeader eyebrow={`${greeting()}, ${user?.full_name?.split(' ')[0] || 'there'}`} title="Intelligence overview" description="Complaint health, verification and critical activity." action={<Link className="button primary" to="/complaints/new"><Plus /> New complaint</Link>} />
    <div className="metric-grid">
      <Metric label="Total complaints" value={data.total} icon={Inbox} tone="violet" note={`${data.analyzed ?? 0} analyzed`} />
      <Metric label="Awaiting review" value={data.pending_reviews ?? data.manual_review_cases} icon={UserRoundCheck} tone="orange" note="Human decision pending" />
      <Metric label="Escalations" value={data.escalations} icon={ShieldAlert} tone="red" note="Mandatory or reviewer" />
      <Metric label="SLA at risk" value={data.sla_risks} icon={Clock3} tone="teal" note="≥75% of window used" />
    </div>
    <div className="dashboard-grid">
      <Panel className="span-2" title="Complaint volume" subtitle="By Python-validated category">
        {categories.length ? <ResponsiveContainer width="100%" height={255}><AreaChart data={categories}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6558f5" stopOpacity={.28} /><stop offset="100%" stopColor="#6558f5" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ebeaf0" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#6558f5" strokeWidth={2.5} fill="url(#fill)" /></AreaChart></ResponsiveContainer> : <EmptyState icon={BarChart3} title="No data yet" description="Analytics populate after complaints are analyzed." />}
      </Panel>
      <Panel title="Priority mix" subtitle="Current workload"><Donut data={priorities} /></Panel>
      {agent && role === 'agent' && <Panel className="span-2" title="Assigned to me" subtitle="Category, priority, sentiment and validation status"><BriefTable rows={agent.assigned.slice(0, 8)} empty="Nothing is assigned to you yet. Pick a case from the unassigned queue below." /></Panel>}
      {agent && <Panel className="span-2" title="Unassigned queue" subtitle="New and analyzed complaints nobody owns yet"><BriefTable rows={agent.queue.slice(0, 8)} empty="The queue is empty." /></Panel>}
      {agent && <Panel title="Escalation warnings" subtitle="Must not be left un-escalated">{agent.escalation_warnings.length ? <div className="brief-list">{agent.escalation_warnings.slice(0, 6).map((row) => <Link key={row.id} to={`/complaints/${row.id}`}><b>{row.complaint_code}</b><span>{row.translated_title || row.title}</span><small>{labelize(row.escalation_level || 'escalated')}</small></Link>)}</div> : <div className="all-clear"><ShieldCheck /><span><b>No open escalations</b>Nothing needs escalation right now.</span></div>}</Panel>}
      <Panel className="span-2" title="Recent complaints" subtitle="Latest customer activity" action={<Link className="text-button" to="/complaints">View all <ArrowRight /></Link>}><ComplaintTable rows={complaints.slice(0, 6)} compact loading={loading} /></Panel>
      <Panel title="Validation health" subtitle="GenAI vs Python">
        <div className="verification-score"><div className="score-ring"><span>{agreement == null ? '—' : Math.round(agreement)}{agreement != null && <small>%</small>}</span></div><b>Full agreement</b><p>{data.genai_compared ? `${data.verified_matches ?? 0} of ${data.genai_compared} GenAI analyses matched Python on every field` : 'No GenAI analyses to compare yet'}</p></div>
        <div className="health-list"><span><CheckCircle2 /> Avg verification <b>{data.average_verification_score == null ? '—' : `${data.average_verification_score}%`}</b></span><span><Activity /> Mismatched analyses <b>{data.genai_python_mismatches}</b></span><span><RefreshCw /> Repeat complaints <b>{data.repeat_complaints}</b></span></div>
      </Panel>
    </div>
  </Page>
}

function ComplaintsPage() {
  const role = useAppStore((s) => s.role)
  const staff = role !== 'customer'
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Complaint[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [showMore, setShowMore] = useState(() => ['category', 'department', 'priority', 'sentiment', 'escalated', 'sla_risk', 'review', 'date_from', 'date_to'].some((k) => params.get(k)))
  const [q, setQ] = useState(params.get('q') || '')
  const filters = Object.fromEntries(params.entries())
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }) }
  useEffect(() => { setQ(params.get('q') || '') }, [params])
  useEffect(() => { if (staff) { api.categories().then(setCategories).catch(() => undefined); api.departments().then(setDepartments).catch(() => undefined) } }, [staff])
  const query = params.toString()
  const pageQuery = (offset: number) => `?${query ? `${query}&` : ''}limit=50&offset=${offset}`
  useEffect(() => {
    let active = true
    setLoading(true)
    api.complaintsPage(pageQuery(0)).then((page) => { if (active) { setRows(page.rows); setTotal(page.total) } }).catch((e) => toast.error(messageOf(e))).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // pageQuery only depends on query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])
  const loadMore = async () => {
    setLoadingMore(true)
    try { const page = await api.complaintsPage(pageQuery(rows.length)); setRows((r) => [...r, ...page.rows]); setTotal(page.total) }
    catch (e) { toast.error(messageOf(e)) } finally { setLoadingMore(false) }
  }
  const activeCount = ['category', 'department', 'priority', 'sentiment', 'escalated', 'sla_risk', 'review', 'date_from', 'date_to'].filter((k) => params.get(k)).length
  return <Page>
    <PageHeader eyebrow="Complaint operations" title={staff ? 'All complaints' : 'My complaints'} description="Search, filter and follow every complaint through resolution." action={<Link className="button primary" to="/complaints/new"><Plus /> New complaint</Link>} />
    <div className="toolbar card">
      <form className="search-field" onSubmit={(e) => { e.preventDefault(); setFilter('q', q.trim()) }}><Search /><input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (params.get('q') || '') && setFilter('q', q.trim())} placeholder={staff ? 'ID, title, order, product or customer…' : 'ID, title or order…'} /></form>
      <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select>
      {staff && <button className="button secondary" onClick={() => setShowMore(!showMore)}><Filter /> Filters{activeCount ? ` (${activeCount})` : ''}</button>}
      {query && <button className="text-button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear</button>}
      <span className="result-count">{total} {total === 1 ? 'result' : 'results'}</span>
    </div>
    {staff && showMore && <div className="filter-panel card">
      <label>Category<select value={filters.category || ''} onChange={(e) => setFilter('category', e.target.value)}><option value="">Any</option>{categories.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}<option value="Unclassified">Unclassified</option></select></label>
      <label>Department<select value={filters.department || ''} onChange={(e) => setFilter('department', e.target.value)}><option value="">Any</option>{departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
      <label>Priority<select value={filters.priority || ''} onChange={(e) => setFilter('priority', e.target.value)}><option value="">Any</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
      <label>Sentiment<select value={filters.sentiment || ''} onChange={(e) => setFilter('sentiment', e.target.value)}><option value="">Any</option>{['positive', 'neutral', 'negative', 'strongly_negative'].map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</select></label>
      <label>Escalation<select value={filters.escalated || ''} onChange={(e) => setFilter('escalated', e.target.value)}><option value="">Any</option><option value="true">Escalated</option><option value="false">Not escalated</option></select></label>
      <label>From<input type="date" value={filters.date_from || ''} onChange={(e) => setFilter('date_from', e.target.value)} /></label>
      <label>To<input type="date" value={filters.date_to || ''} onChange={(e) => setFilter('date_to', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={filters.sla_risk === 'true'} onChange={(e) => setFilter('sla_risk', e.target.checked ? 'true' : '')} /> SLA at risk</label>
      <label className="check"><input type="checkbox" checked={filters.review === 'true'} onChange={(e) => setFilter('review', e.target.checked ? 'true' : '')} /> Awaiting review</label>
    </div>}
    <div className="card table-card"><ComplaintTable rows={rows} loading={loading} customer={!staff} />{!loading && rows.length < total && <div className="load-more"><span className="muted">Showing {rows.length} of {total}</span><button className="button secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <RefreshCw className="spin" /> : <ChevronDown />} Load more</button></div>}</div>
  </Page>
}

function NewComplaintPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const prefill = (location.state as { prefill?: Partial<ComplaintDraft> } | null)?.prefill
  const role = useAppStore((s) => s.role)
  const staff = role !== 'customer'
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const queryOrderRef = searchParams.get('orderReference') || searchParams.get('order_reference') || searchParams.get('order') || ''
  const queryProduct = searchParams.get('product') || searchParams.get('product_or_service') || ''

  const [draft, setDraft] = useState<ComplaintDraft>({
    title: '',
    description: '',
    product_or_service: queryProduct || prefill?.product_or_service || '',
    order_reference: queryOrderRef || prefill?.order_reference || '',
    previous_complaint_reference: '',
    customer_type: 'standard',
    customer_code: '',
    preferred_contact_channel: 'email',
    requested_resolution: '',
    channel: 'web',
    incident_date: '',
    preferred_language: 'auto',
    ...(prefill || {}),
  })

  useEffect(() => {
    if (queryOrderRef && !draft.order_reference) {
      setDraft((d) => ({
        ...d,
        order_reference: queryOrderRef,
        product_or_service: queryProduct || d.product_or_service,
      }))
    }
  }, [queryOrderRef, queryProduct])
  const set = (field: keyof ComplaintDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }))
  const orderValid = !draft.order_reference || /^NC-\d{6,}$/i.test(draft.order_reference.trim())
  const previousValid = !draft.previous_complaint_reference || /^CMP-\d{5,}$/i.test(draft.previous_complaint_reference.trim())
  const submit = async () => {
    setBusy(true)
    try {
      const payload = { ...draft, customer_code: staff ? draft.customer_code?.trim() || undefined : undefined, incident_date: draft.incident_date || undefined, channel: staff ? draft.channel : 'web' }
      const result = await api.submitComplaint(payload)
      const failed: string[] = []
      for (const file of files) { try { await api.uploadAttachment(result.complaint.id, file) } catch (e) { failed.push(`${file.name}: ${messageOf(e)}`) } }
      toast.success(`Complaint ${result.complaint.complaint_code} submitted`)
      if (result.near_duplicate) toast.warning(`This looks very similar to ${result.near_duplicate_of}. It has been linked for review.`)
      failed.forEach((f) => toast.error(`Attachment not saved — ${f}`))
      navigate(`/complaints/${result.complaint.id}`)
    } catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }
  return <Page narrow>
    <PageHeader eyebrow="Create case" title="Submit a complaint" description="Provide enough context for accurate classification and resolution." />
    <div className="stepper">{['Complaint details', 'Context & outcome', 'Review'].map((label, i) => <div key={label} className={step >= i + 1 ? 'active' : ''}><span>{step > i + 1 ? <Check /> : i + 1}</span><b>{label}</b></div>)}</div>
    <div className="form-card card">
      {step === 1 && <FormSection icon={MessageSquareText} title="Tell us what happened" description="Clear, factual details help both intelligence pipelines.">
        <Field label="Complaint title" full><input value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Order arrived damaged" /></Field>
        <Field label="Description" full note={`${draft.description.trim().length} characters · minimum 20`}><textarea value={draft.description} onChange={(e) => set('description', e.target.value)} rows={7} placeholder="Describe the issue, when it happened, and the impact…" /></Field>
        <Field label="Product or service"><input value={draft.product_or_service} onChange={(e) => set('product_or_service', e.target.value)} placeholder="AuraBuds Pro" /></Field>
        <Field label="Order reference" note={orderValid ? 'Format: NC-000000' : 'Use the format NC-000000'}><input className={orderValid ? '' : 'invalid'} value={draft.order_reference} onChange={(e) => set('order_reference', e.target.value)} placeholder="NC-100001" /></Field>
      </FormSection>}
      {step === 2 && <FormSection icon={BookOpen} title="Add relevant context" description="This helps detect repeats and choose the right policy.">
        {staff && <Field label="Customer reference" note="Optional · e.g. CUST-10001"><input value={draft.customer_code} onChange={(e) => set('customer_code', e.target.value)} placeholder="CUST-10001" /></Field>}
        {staff && <Field label="Customer type" note="Ignored when a customer reference is given"><select value={draft.customer_type} onChange={(e) => set('customer_type', e.target.value)}><option value="standard">Standard</option><option value="vip">VIP</option><option value="wholesale">Wholesale</option><option value="enterprise">Enterprise</option></select></Field>}
        {staff && <Field label="Received via" note="Channel the complaint arrived on"><select value={draft.channel} onChange={(e) => set('channel', e.target.value)}>{['web', 'email', 'chat', 'portal', 'messaging'].map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</select></Field>}
        <Field label="When did it happen?" note="Optional · purchase or incident date"><input type="date" max={new Date().toISOString().slice(0, 10)} value={draft.incident_date} onChange={(e) => set('incident_date', e.target.value)} /></Field>
        <Field label="Communication language" note="Language for support updates"><select value={draft.preferred_language || 'auto'} onChange={(e) => set('preferred_language', e.target.value)}><option value="auto">Auto Detect</option><option value="en">English</option><option value="ur_roman">Roman Urdu</option><option value="ur">Urdu (اردو)</option><option value="hi">Hindi (हिन्दी)</option><option value="ms">Malay (Bahasa Melayu)</option></select></Field>
        <Field label="Preferred contact"><select value={draft.preferred_contact_channel} onChange={(e) => set('preferred_contact_channel', e.target.value)}><option value="email">Email</option><option value="chat">Chat</option><option value="phone">Phone</option></select></Field>
        <Field label="Previous complaint reference" note={previousValid ? 'Optional · links a repeat complaint' : 'Use the format CMP-00000'}><input className={previousValid ? '' : 'invalid'} value={draft.previous_complaint_reference} onChange={(e) => set('previous_complaint_reference', e.target.value)} placeholder="CMP-00000" /></Field>
        <Field label="Requested resolution" full><textarea value={draft.requested_resolution} onChange={(e) => set('requested_resolution', e.target.value)} rows={3} placeholder="What would a fair resolution look like?" /></Field>
        <Field label="Supporting documents" full note="PDF, DOCX, PNG, JPG or TXT · up to 15 MB each"><input type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => setFiles(Array.from(e.target.files || []))} /></Field>
      </FormSection>}
      {step === 3 && <FormSection icon={CheckCircle2} title="Review before submitting" description="You can edit anything by going back."><div className="review-draft full"><span>Title</span><b>{draft.title}</b><span>Description</span><p>{draft.description}</p><div className="review-pairs"><span>Product<b>{draft.product_or_service || '—'}</b></span><span>Order<b>{draft.order_reference || '—'}</b></span><span>Previous<b>{draft.previous_complaint_reference || '—'}</b></span><span>Contact<b>{labelize(draft.preferred_contact_channel)}</b></span><span>Attachments<b>{files.length || '—'}</b></span>{staff && <span>Customer<b>{draft.customer_code || labelize(draft.customer_type)}</b></span>}</div></div></FormSection>}
      <div className="form-actions"><button className="button ghost" onClick={() => step === 1 ? navigate('/complaints') : setStep(step - 1)}><ArrowLeft /> {step === 1 ? 'Cancel' : 'Back'}</button>{step < 3 ? <button className="button primary" disabled={(step === 1 && (draft.title.trim().length < 2 || draft.description.trim().length < 20 || !orderValid)) || (step === 2 && !previousValid)} onClick={() => setStep(step + 1)}>Continue <ArrowRight /></button> : <button className="button primary" disabled={busy} onClick={submit}>{busy ? <RefreshCw className="spin" /> : <Send />} Submit complaint</button>}</div>
    </div>
  </Page>
}

function ComplaintDetailPage() {
  const { id } = useParams()
  const role = useAppStore((s) => s.role)
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const load = useCallback(async () => {
    if (!id) return
    try { setComplaint(await api.complaint(Number(id))); setError(null) } catch (e) { setError(e instanceof ApiError ? e : null); setComplaint(null) } finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])
  if (loading) return <Page><Skeleton /></Page>
  if (!complaint) return <Page><EmptyState icon={error?.status === 403 ? ShieldAlert : XCircle} title={error?.status === 403 ? 'Access restricted' : 'Complaint not found'} description={error?.status === 403 ? error.message : 'This complaint does not exist or was removed.'} /><div className="center-action"><Link className="button secondary" to="/complaints"><ArrowLeft /> Back to complaints</Link></div></Page>
  return role === 'customer' ? <CustomerComplaintView complaint={complaint} reload={load} /> : <StaffComplaintView complaint={complaint} reload={load} role={role} />
}

function CustomerComplaintView({ complaint, reload }: { complaint: Complaint; reload: () => Promise<void> }) {
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)
  const [csatRating, setCsatRating] = useState(0)
  const [csatComment, setCsatComment] = useState('')
  const [csatSubmitting, setCsatSubmitting] = useState(false)

  const decide = async (action: 'confirm' | 'reopen') => {
    setBusy(true)
    try { await api.customerDecision(complaint.id, action, reason, action === 'confirm' && rating ? rating : undefined); toast.success(action === 'confirm' ? 'Thanks — your complaint is closed.' : 'Your complaint has been reopened.'); setReopening(false); setReason(''); await reload() }
    catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }

  const submitCsat = async () => {
    if (csatRating < 1 || csatRating > 5) {
      toast.error('Please select a rating between 1 and 5 stars.')
      return
    }
    setCsatSubmitting(true)
    try {
      await api.submitFeedback(complaint.id, csatRating, csatComment.trim())
      toast.success('Thank you for your feedback!')
      setCsatRating(0)
      setCsatComment('')
      await reload()
    } catch (e) {
      toast.error(messageOf(e))
    } finally {
      setCsatSubmitting(false)
    }
  }

  const isResolvedOrClosed = ['resolved', 'closed'].includes(complaint.status)

  return <Page>
    <div className="detail-heading"><div><Link to="/complaints" className="back-link"><ArrowLeft /> Back to my complaints</Link><div className="title-row"><h1>{complaint.title}</h1><StatusBadge status={complaint.status} /></div><p><b>{complaint.complaint_code}</b> · Submitted {date(complaint.created_at)}</p></div></div>
    {complaint.status === 'resolved' && <div className="resolution-check card">
      <div><CheckCircle2 /><span><b>Did this resolve your issue?</b>Confirm to close the complaint, or reopen it if the problem is not fixed.</span></div>
      {reopening ? <div className="reopen-form"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is still wrong?" /><div><button className="button ghost" onClick={() => setReopening(false)}>Cancel</button><button className="button danger-outline" disabled={busy || reason.trim().length < 10} onClick={() => decide('reopen')}><RefreshCw /> Reopen complaint</button></div></div>
        : <div className="resolution-actions"><div className="csat"><small>How satisfied are you?</small><StarRating value={rating} onChange={setRating} /></div><button className="button secondary" onClick={() => setReopening(true)}>Not resolved — reopen</button><button className="button primary" disabled={busy} onClick={() => decide('confirm')}><Check /> Yes, close it</button></div>}
    </div>}
    <div className="detail-grid">
      <Panel className="span-2" title="Latest update" subtitle="What is happening with your complaint"><div className="intelligence-grid"><Data label="Status" value={STATUS_LABEL[complaint.status] || complaint.status} /><Data label="Department" value={complaint.department || 'Being assigned'} /><Data label="Resolution" value={['resolved', 'closed'].includes(complaint.status) ? 'Resolved' : 'Open'} /><Data label="Last change" value={complaint.updated_at ? dateTime(complaint.updated_at) : '—'} /></div><p className="complaint-copy update-copy">{complaint.latest_update}</p></Panel>
      <Panel title="Timing" subtitle="Service targets"><div className="timeline-metric"><Clock3 /><span><small>Target resolution</small><b>{complaint.sla_resolution_due ? dateTime(complaint.sla_resolution_due) : 'Set after triage'}</b></span></div><div className="timeline-metric"><RefreshCw /><span><small>Next follow-up</small><b>{complaint.follow_up_at ? dateTime(complaint.follow_up_at) : 'Not scheduled'}</b></span></div></Panel>
      <Panel className="span-2" title="Your complaint" subtitle="As submitted"><p className="complaint-copy">{complaint.description}</p><div className="metadata-row"><span>Product <b>{complaint.product_or_service || '—'}</b></span><span>Order <b>{complaint.order_reference || '—'}</b></span><span>Requested <b>{complaint.requested_resolution || '—'}</b></span></div></Panel>
      <Panel title="Supporting documents" subtitle="Evidence you have shared"><Attachments complaint={complaint} reload={reload} /></Panel>

      {/* CSAT / Feedback Card */}
      {isResolvedOrClosed && (
        complaint.feedback ? (
          <Panel className="span-3" title="Thank you for your feedback!" subtitle="Your feedback helps SupportNova improve customer service.">
            <div className="csat-submitted-card" style={{ display: 'grid', gap: '0.6rem' }}>
              <div>
                <small className="muted" style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Your Rating</small>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <StarRating value={complaint.feedback.rating} readOnly />
                  <b style={{ fontSize: '1.05rem' }}>{complaint.feedback.rating} / 5</b>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>({CSAT_LABELS[complaint.feedback.rating] || ''})</span>
                </div>
              </div>
              {complaint.feedback.comment && (
                <div style={{ padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid var(--accent-primary, #0D7A75)' }}>
                  <small className="muted" style={{ display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>Your Comment:</small>
                  <p style={{ margin: 0, fontStyle: 'italic', color: '#334155' }}>&ldquo;{complaint.feedback.comment}&rdquo;</p>
                </div>
              )}
              {complaint.feedback.created_at && (
                <small className="muted">Submitted {dateTime(complaint.feedback.created_at)}</small>
              )}
            </div>
          </Panel>
        ) : (
          <Panel className="span-3" title="How did we do?" subtitle="How satisfied are you with the resolution of your complaint?">
            <div className="csat-entry-form" style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <StarRating value={csatRating} onChange={setCsatRating} />
                  {csatRating > 0 && (
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0D7A75' }}>
                      {CSAT_LABELS[csatRating]}
                    </span>
                  )}
                </div>
                {!csatRating && <small className="muted" style={{ display: 'block', marginTop: '0.35rem' }}>Click a star to rate from 1 (Very dissatisfied) to 5 (Very satisfied)</small>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Tell us more <span className="muted" style={{ fontWeight: 400 }}>(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={csatComment}
                  onChange={(e) => setCsatComment(e.target.value)}
                  placeholder="What could we have done better?"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="button primary"
                  disabled={csatSubmitting || csatRating < 1 || csatRating > 5}
                  onClick={submitCsat}
                >
                  {csatSubmitting ? <RefreshCw className="spin" /> : <Star />} Submit Feedback
                </button>
              </div>
            </div>
          </Panel>
        )
      )}

      <Panel className="span-3" title="Messages" subtitle={complaint.unread_messages ? `${complaint.unread_messages} new message(s) from support` : 'Your conversation with the support team'}><Conversation complaint={complaint} role="customer" reload={reload} /></Panel>
    </div>
  </Page>
}

function StaffComplaintView({ complaint, reload, role }: { complaint: Complaint; reload: () => Promise<void>; role: Role | null }) {
  const user = useAppStore((s) => s.user)
  const handoff = useLocation().state as { draft?: string; tab?: string } | null
  const [tab, setTab] = useState(handoff?.tab || 'overview')
  const [analyzing, setAnalyzing] = useState(false)
  const [tone, setTone] = useState('professional')
  const [pythonOnly, setPythonOnly] = useState(false)
  const [status, setStatus] = useState(complaint.status)
  const [note, setNote] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [showOriginalTitle, setShowOriginalTitle] = useState(false)
  useEffect(() => { setStatus(complaint.status) }, [complaint.status])
  useEffect(() => { api.departments().then(setDepartments).catch(() => undefined) }, [])
  const py = complaint.python || {}, ai = complaint.genai || {}
  const reasons = complaint.checks?.review_reasons || []
  const hasTranslatedTitle = Boolean(
    complaint.translated_title &&
    complaint.translated_title.trim() !== '' &&
    complaint.translated_title.trim().toLowerCase() !== complaint.title.trim().toLowerCase()
  )
  const displayTitle = (hasTranslatedTitle && !showOriginalTitle) ? complaint.translated_title! : complaint.title
  const langName = (complaint.source_language && LANGUAGE_NAMES[complaint.source_language]) || complaint.source_language || 'Detected language'
  const analyze = async () => {
    setAnalyzing(true)
    try {
      const result = await api.analyze(complaint.id, tone, pythonOnly)
      if (result.genai_error) toast.warning('GenAI failed — Python validation ran and the case was routed to manual review.')
      else if (result.genai_skipped_reason) toast.info(result.genai_skipped_reason)
      else toast.success('Dual-pipeline analysis completed')
      await reload()
    } catch (e) { toast.error(messageOf(e)) } finally { setAnalyzing(false) }
  }
  const act = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); toast.success(done); setNote(''); await reload() } catch (e) { toast.error(messageOf(e)) } }
  return <Page>
    <div className="detail-heading"><div><Link to="/complaints" className="back-link"><ArrowLeft /> Back to complaints</Link>
      <div className="title-row">
        <h1>{displayTitle}</h1>
        <StatusBadge status={complaint.status} />
        {hasTranslatedTitle && (
          <button
            type="button"
            className="text-button"
            style={{ fontSize: '0.78rem', textDecoration: 'underline', marginLeft: '6px' }}
            onClick={() => setShowOriginalTitle((v) => !v)}
          >
            {showOriginalTitle ? 'View English Title' : 'View Original Title'}
          </button>
        )}
      </div>
      {hasTranslatedTitle && !showOriginalTitle && (
        <small className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '-4px', marginBottom: '8px' }}>
          Original customer title: &ldquo;{complaint.title}&rdquo; · <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', fontSize: '0.72rem' }}><Globe style={{ width: 11, height: 11 }} />{langName}</span>
        </small>
      )}
      {hasTranslatedTitle && showOriginalTitle && (
        <small className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: '-4px', marginBottom: '8px' }}>
          (Showing original customer title in {langName})
        </small>
      )}
      <p><b>{complaint.complaint_code}</b> · Submitted {date(complaint.created_at)} · {labelize(complaint.channel || 'web')}{complaint.customer_code ? ` · ${complaint.customer_code}` : ''}{complaint.assigned_to ? ` · Owner: ${complaint.assigned_to}` : ''}</p>
    </div>
      <div className="analyze-controls"><select value={tone} onChange={(e) => setTone(e.target.value)} title="Response tone">{TONES.map((t) => <option key={t} value={t}>{labelize(t)} tone</option>)}</select><label className="check"><input type="checkbox" checked={pythonOnly} onChange={(e) => setPythonOnly(e.target.checked)} /> Python only</label><button className="button primary" disabled={analyzing} onClick={analyze}>{analyzing ? <RefreshCw className="spin" /> : <Sparkles />} {complaint.python ? 'Re-run analysis' : 'Analyze complaint'}</button></div>
    </div>
    <div className="case-alerts">
      {complaint.needs_reanalysis && <div className="alert info"><RefreshCw /><span><b>A policy this case relies on changed</b>Re-run the analysis so the recommendation and reply use the current version.</span><button className="button secondary compact" disabled={analyzing} onClick={analyze}>Re-analyze</button></div>}
      {complaint.classification?.overridden && <div className="alert purple"><UserRoundCheck /><span><b>Reclassified by a reviewer</b>Now {complaint.classification.category}{complaint.classification.subcategory ? ` / ${complaint.classification.subcategory}` : ''}{complaint.classification.priority ? ` · ${complaint.classification.priority}` : ''}; the original Python result is kept on the Structured JSON and History tabs.</span></div>}
      {(complaint.open_followups || []).filter((f) => f.type === 'customer_reopened').slice(-1).map((f) => <div key={f.scheduled_at} className="alert danger"><RefreshCw /><span><b>Reopened by the customer · {dateTime(f.scheduled_at)}</b>“{f.message}”</span></div>)}
      {complaint.pending_review && <div className="alert warning"><AlertTriangle /><span><b>Manual review required</b>{reasons.join(' · ') || 'GenAI and Python require a human decision.'}</span>{role && REVIEWER_ROLES.includes(role) && <Link to="/review">Open queue</Link>}</div>}
      {py.escalation_required && <div className="alert danger"><ShieldAlert /><span><b>Mandatory escalation · {labelize(py.escalation_level || 'required')}</b>{(py.escalation_reasons || []).join(' ') || 'Escalation rules matched.'}</span></div>}
      {py.prompt_injection?.detected && <div className="alert purple"><ShieldCheck /><span><b>Prompt injection contained</b>Instructions inside the complaint were treated as data, not commands.</span></div>}
      {(py.related_complaints?.length || complaint.duplicate_of) ? <div className="alert info"><History /><span><b>Related complaints</b>{[complaint.duplicate_of && `Near-duplicate of ${complaint.duplicate_of}`, py.related_complaints?.length && `Repeat of unresolved ${py.related_complaints.join(', ')}`].filter(Boolean).join(' · ')}</span></div> : null}
      {complaint.genai_meta && complaint.genai_meta.available === false && <div className="alert warning"><Bot /><span><b>GenAI output unavailable</b>{shorten(complaint.genai_meta.error) || 'No structured output returned.'} The Python ground truth is authoritative.</span></div>}
      {complaint.checks?.genai_skipped_reason && !complaint.genai_meta && <div className="alert info"><Bot /><span><b>Python-only analysis</b>{complaint.checks.genai_skipped_reason}</span></div>}
    </div>
    <div className="action-bar card">
      <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="grow">Update note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the customer as the latest update" /></label>
      <button className="button secondary" disabled={status === complaint.status && !note} onClick={() => act(() => api.updateStatus(complaint.id, status, note), 'Status updated')}><Check /> Update</button>
      {user && complaint.assigned_to_id !== user.id && <button className="button secondary" onClick={() => act(() => api.assign(complaint.id, { agent_id: user.id }), 'Assigned to you')}><UserRoundCheck /> Assign to me</button>}
      <label>Department<select value={complaint.assigned_department_id || ''} onChange={(e) => e.target.value && act(() => api.assign(complaint.id, { department_id: Number(e.target.value) }), 'Department updated')}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    </div>
    <div className="tabs">{['overview', 'conversation', 'comparison', 'response', 'json', 'history'].map((value) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{value === 'json' ? 'Structured JSON' : labelize(value)}{value === 'conversation' && (complaint.open_followups || []).some((f) => f.type === 'customer_reopened') ? ' •' : ''}</button>)}</div>
    {tab === 'overview' && <div className="detail-grid">
      <Panel className="span-2" title="Complaint intelligence" subtitle="Python-verified classification and routing" action={complaint.verification_score != null ? <Verification score={complaint.verification_score} /> : undefined}>
        {complaint.python ? <>
          <div className="intelligence-grid"><Data label="Category" value={py.issue_category} /><Data label="Subcategory" value={py.subcategory} /><Data label="Department" value={py.department} /><Data label="Supporting" value={(py.supporting_departments || []).join(', ') || 'None'} /><Data label="Urgency" value={py.urgency} badge /><Data label="Priority" value={py.priority} badge /><Data label="Sentiment" value={ai.sentiment ? labelize(ai.sentiment) : complaint.classification?.sentiment ? `${labelize(complaint.classification.sentiment)} (Python estimate)` : '—'} /><Data label="Escalation" value={py.escalation_required ? labelize(py.escalation_level || 'required') : 'Not required'} /><Data label="Policy source" value={[py.policy_id, py.policy_section && `§${py.policy_section}`, py.policy_version && `v${py.policy_version}`].filter(Boolean).join(' · ') || 'Not matched'} /><Data label="Policy status" value={py.policy_applicability ? labelize(py.policy_applicability) : 'Not recorded'} /><Data label="Rule" value={py.rule_code || 'No rule matched'} /></div>
          <div className="kv-list"><span>Primary issue</span><b>{ai.primary_issue || py.issue_category}</b><span>Secondary issues</span><b>{secondaryText(py.secondary_issues) || secondaryText(ai.secondary_issues) || 'None'}</b><span>Eligibility</span><div className="chip-row">{eligibility(py).map(([label, state]) => <span key={label} className={`chip ${state}`}>{label}: {state === 'yes' ? 'eligible' : state === 'no' ? 'not eligible' : 'needs check'}</span>)}</div>{py.eligibility?.checks?.length ? <><span>Policy conditions</span><ul className="condition-list">{py.eligibility.checks.map((c) => <li key={c.check} className={c.passed === true ? 'pass' : c.passed === false ? 'fail' : 'unknown'}>{c.passed === true ? <Check /> : c.passed === false ? <XCircle /> : <AlertTriangle />}<span><b>{labelize(c.check)}</b> {c.detail} <small>{c.policy}</small></span></li>)}</ul></> : null}{ai.emotion_indicators?.length ? <><span>Emotion indicators</span><b>{ai.emotion_indicators.join(', ')} <small className="muted">(do not affect urgency)</small></b></> : null}</div>
        </> : <AnalysisEmpty onAnalyze={analyze} />}
      </Panel>
      <Panel title="SLA & follow-up" subtitle="Resolution timing"><div className="timeline-metric"><Clock3 /><span><small>Resolution due</small><b>{complaint.sla_resolution_due ? dateTime(complaint.sla_resolution_due) : 'Pending analysis'}</b></span></div><div className="progress"><i style={{ width: `${slaProgress(complaint)}%` }} /></div><p className="muted">{complaint.sla_risk ? 'SLA risk: over the risk threshold of the window' : complaint.sla_resolution_due ? 'Within target window' : 'No SLA until analyzed'}</p><div className="timeline-metric"><Send /><span><small>First response</small><b>{complaint.first_responded_at ? `${dateTime(complaint.first_responded_at)} · ${complaint.first_response === 'met' ? 'on time' : 'late'}` : complaint.sla_first_response_due ? `Due ${dateTime(complaint.sla_first_response_due)}${complaint.first_response === 'overdue' ? ' · overdue' : ''}` : '—'}</b></span></div><div className="timeline-metric"><RefreshCw /><span><small>Follow-up</small><b>{complaint.follow_up_at ? dateTime(complaint.follow_up_at) : 'Not scheduled'}</b></span></div></Panel>
      <Panel className="span-2" title="Customer complaint" subtitle="Original submitted content (untrusted input)"><TranslatedTextToggle originalText={complaint.description} translatedText={complaint.translated_description} sourceLanguage={complaint.source_language} confidence={complaint.translation_confidence} /><div className="metadata-row"><span>Product <b>{complaint.product_or_service || '—'}</b></span><span>Order <b>{complaint.order_reference || '—'}</b></span><span>Customer <b>{labelize(complaint.customer_type)}</b></span><span>Previous <b>{complaint.previous_complaint_reference || '—'}</b></span><span>Contact <b>{labelize(complaint.preferred_contact_channel || '—')}</b></span></div>{complaint.requested_resolution && <p className="muted requested">Requested resolution: {complaint.requested_resolution}</p>}{py.missing_information?.length ? <p className="missing-info"><AlertTriangle /> Missing: {py.missing_information.map(labelize).join(', ')}</p> : null}<Attachments complaint={complaint} reload={reload} /></Panel>
      <Panel title="Validation controls" subtitle="Python-enforced checks">{complaint.flags?.length ? <div className="flag-list">{complaint.flags.map((f, i) => <p key={i}><XCircle /><span><b>{labelize(String(f.code || 'issue'))}</b>{f.detail || f.action || f.value || (f.patterns ? `${f.patterns.length} pattern(s)` : '')}</span></p>)}</div> : complaint.python ? <div className="all-clear"><ShieldCheck /><span><b>No validation flags</b>Python validation raised no issues.</span></div> : <p className="muted">Run analysis to validate.</p>}{complaint.checks?.policy?.precedence?.governing && <p className="precedence-note"><Scale /><span><b>Policy precedence</b>{complaint.checks.policy.precedence.governing.document_code} governs{complaint.checks.policy.precedence.overridden?.length ? ` over ${complaint.checks.policy.precedence.overridden.map((o) => `${o.document_code} (${o.category})`).join(', ')}` : ''}.{complaint.checks.policy.precedence.conflicts?.length ? ` ${complaint.checks.policy.precedence.conflicts.length} lower-precedence statement(s) differ and are ignored.` : ''}</span></p>}</Panel>
      <EvidencePanel complaint={complaint} />
      {Boolean(complaint.feedback || ['resolved', 'closed'].includes(complaint.status)) && (
        <Panel
          className="span-2"
          title="Customer satisfaction"
          subtitle={complaint.feedback ? "Customer CSAT rating & feedback" : "Post-resolution CSAT"}
        >
          {complaint.feedback ? (
            <div className="csat-staff-card" style={{ display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <StarRating value={complaint.feedback.rating} readOnly />
                <b style={{ fontSize: '1.1rem' }}>{complaint.feedback.rating} / 5</b>
                <span className="muted" style={{ fontSize: '0.85rem' }}>({CSAT_LABELS[complaint.feedback.rating] || ''})</span>
                {complaint.feedback.rating <= 2 && (
                  <span className="chip warn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                    <AlertTriangle style={{ width: 14, height: 14 }} /> ⚠ Low Customer Satisfaction · Follow-up recommended
                  </span>
                )}
                {complaint.feedback.rating === 5 && (
                  <span className="chip pass" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#e6f8f3', color: '#0d9488', fontWeight: 600 }}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} /> ✓ Customer satisfied
                  </span>
                )}
              </div>
              {complaint.feedback.comment ? (
                <div style={{ padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', borderLeft: '3px solid var(--accent-primary, #0D7A75)' }}>
                  <small className="muted" style={{ display: 'block', marginBottom: '0.2rem', fontWeight: 600 }}>Customer feedback:</small>
                  <p style={{ margin: 0, fontStyle: 'italic', color: '#334155' }}>&ldquo;{complaint.feedback.comment}&rdquo;</p>
                </div>
              ) : (
                <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>Customer submitted rating without written feedback.</p>
              )}
              {complaint.feedback.created_at && (
                <small className="muted">Submitted {dateTime(complaint.feedback.created_at)}</small>
              )}
            </div>
          ) : (
            <div className="all-clear" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
              <Clock3 />
              <span>
                <b>Customer rating</b>
                Awaiting customer feedback.
              </span>
            </div>
          )}
        </Panel>
      )}
    </div>}
    {tab === 'comparison' && <Comparison complaint={complaint} />}
    {tab === 'response' && <div className="response-layout">
      <Panel className="span-2" title="Customer response draft" subtitle={complaint.genai_meta?.available ? `Generated by ${complaint.genai_meta.provider} · ${complaint.genai_meta.model} · prompt ${complaint.genai_meta.prompt_version}` : 'GenAI draft'}>
        {typeof complaint.latest_review?.final_decision?.customer_response === 'string' && <><h4 className="section-title">Reviewer-approved response <small className="muted">({labelize(complaint.latest_review.action)} · {dateTime(complaint.latest_review.created_at)})</small></h4><div className="response-letter approved">{complaint.latest_review.final_decision.customer_response}</div><h4 className="section-title">Original GenAI draft</h4></>}
        {ai.customer_response ? <div className="response-letter">{ai.customer_response}</div> : <AnalysisEmpty />}
        {ai.follow_up_communication && <><h4 className="section-title">Follow-up communication</h4><div className="response-letter small">{ai.follow_up_communication}</div></>}
        {(ai.clarification_questions?.length ? ai.clarification_questions : py.clarification_questions || []).length ? <List title="Clarification questions" items={ai.clarification_questions?.length ? ai.clarification_questions : py.clarification_questions || []} /> : null}
      </Panel>
      <Panel title="Agent guidance" subtitle="Internal only">
        <List title="GenAI recommended steps" items={ai.resolution_steps || []} />
        <List title="Agent guidance" items={ai.agent_guidance || []} />
        <List title="Mandatory actions (rule matrix)" items={(py.required_actions || []).map((a) => py.evidence?.satisfies?.includes(a) ? `${a} (already provided: see attachments)` : a)} />
        <List title="Prohibited actions (rule matrix)" items={py.prohibited_actions || []} icon={XCircle} />
        {ai.escalation_notes && <><h4 className="section-title">Escalation notes</h4><p className="note-copy">{ai.escalation_notes}</p></>}
        <div className="policy-source"><BookOpen /><span><small>Grounded source</small><b>{py.policy_id || ai.policy_id || 'No source'}</b><p>Section {py.policy_section || ai.policy_section || '—'}{ai.policy_id && ai.policy_id !== py.policy_id ? ` · GenAI cited ${ai.policy_id}` : ''}</p></span></div>
      </Panel>
    </div>}
    {tab === 'json' && <div className="json-grid">
      <Panel title="Pipeline 1 · GenAI structured output" subtitle={complaint.genai_meta ? `${complaint.genai_meta.provider} · ${complaint.genai_meta.model || '—'} · prompt ${complaint.genai_meta.prompt_version} · attempt ${complaint.genai_meta.attempt}${complaint.genai_meta.analyzed_at ? ` · ${dateTime(complaint.genai_meta.analyzed_at)}` : ''}` : 'Not run'}><pre className="json-view">{complaint.genai ? JSON.stringify(complaint.genai, null, 2) : 'No GenAI output recorded.'}</pre>{complaint.genai_meta?.policy_versions?.length ? <p className="muted small-print">Policy versions sent: {complaint.genai_meta.policy_versions.map((p) => `${p.document_code} v${p.version}${p.status && p.status !== 'active' ? ` (${p.status})` : ''}`).join(', ')}</p> : null}</Panel>
      <Panel title="Pipeline 2 · Python ground truth" subtitle={complaint.analyzed_at ? `Validated ${dateTime(complaint.analyzed_at)}` : 'Not run'}><pre className="json-view">{complaint.python ? JSON.stringify(complaint.python, null, 2) : 'No validation recorded.'}</pre></Panel>
    </div>}
    {tab === 'history' && <HistoryPanel id={complaint.id} />}
    {tab === 'conversation' && <div className="card conversation-card"><Conversation complaint={complaint} role={role} reload={reload} initialDraft={handoff?.draft} /></div>}
  </Page>
}

function Attachments({ complaint, reload }: { complaint: Complaint; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ attachment: Attachment; url: string; type: string; text?: string } | null>(null)
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try { await api.uploadAttachment(complaint.id, file); toast.success(`${file.name} attached`); await reload() } catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }
  const open = async (a: Attachment) => {
    try {
      const blob = await api.attachmentBlob(complaint.id, a.id)
      const text = blob.type.startsWith('text/') ? await blob.text() : undefined
      setPreview({ attachment: a, url: URL.createObjectURL(blob), type: blob.type, text })
    } catch (e) { toast.error(messageOf(e)) }
  }
  const save = async (a: Attachment) => {
    try {
      const url = URL.createObjectURL(await api.attachmentBlob(complaint.id, a.id))
      const link = document.createElement('a'); link.href = url; link.download = a.filename; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { toast.error(messageOf(e)) }
  }
  const close = () => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null) }
  const docx = preview?.attachment.filename.toLowerCase().endsWith('.docx')
  return <div className="attachments">
    {(complaint.attachments || []).map((a) => <div className="attachment-chip" key={a.id}>
      <button className="attachment-open" onClick={() => open(a)} title="View">{a.kind === 'image' ? <ImageIcon /> : <FileText />}<span><b>{a.filename}</b><small>{Math.max(1, Math.round(a.size_bytes / 1024))} KB{a.kind === 'image' ? ' · photo' : ''}</small></span></button>
      <button className="icon-button small" onClick={() => save(a)} title="Download"><Download /></button>
    </div>)}
    {!complaint.attachments?.length && <p className="muted">No files attached yet.</p>}
    {!['resolved', 'closed'].includes(complaint.status) && <label className="text-button">{busy ? <RefreshCw className="spin" /> : <Plus />} Add file<input hidden type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = '' }} /></label>}
    {preview && <Modal title={preview.attachment.filename} close={close}><div className="attachment-preview">
      {preview.type.startsWith('image/') && <img src={preview.url} alt={preview.attachment.filename} />}
      {preview.type === 'application/pdf' && <iframe src={preview.url} title={preview.attachment.filename} />}
      {preview.text !== undefined && <pre>{preview.text}</pre>}
      {docx && <p className="muted">Word documents can't be previewed in the browser. Download the file to open it{complaint.evidence ? '; the text Nova read from it is shown under Evidence.' : '.'}</p>}
      <div className="modal-actions"><button className="button ghost" onClick={close}>Close</button><button className="button primary" onClick={() => save(preview.attachment)}><Download /> Download</button></div>
    </div></Modal>}
  </div>
}

function EvidencePanel({ complaint }: { complaint: Complaint }) {
  const ev = complaint.evidence
  if (!ev?.count) return <Panel title="Attachment evidence" subtitle="What the customer's files show"><p className="muted">No attachments. Ask the customer for a photo, invoice or statement if the claim needs proof.</p></Panel>
  const order = complaint.order_reference
  const orderMatch = order && ev.order_ids.length ? ev.order_ids.includes(order.toUpperCase()) : null
  return <Panel title="Attachment evidence" subtitle={`${ev.documents} document(s), ${ev.photos} photo(s) · used by both pipelines`}>
    <div className="evidence-facts">
      <div><small>Order on file</small><b className={orderMatch === false ? 'bad' : ''}>{ev.order_ids.join(', ') || '—'}{orderMatch === true ? ' ✓ matches' : orderMatch === false ? ` ≠ ${order}` : ''}</b></div>
      <div><small>Amounts</small><b>{[...new Set(ev.amounts)].join(', ') || '—'}</b></div>
      <div><small>Purchase date</small><b>{ev.purchase_date ? date(ev.purchase_date) : '—'}{ev.purchase_date && !complaint.incident_date ? ' (from invoice)' : ''}</b></div>
    </div>
    {ev.injection_in.length > 0 && <p className="missing-info"><AlertTriangle /> Instruction-like text found in {ev.injection_in.join(', ')}. It is treated as data only.</p>}
    <ul className="evidence-list">{ev.items.map((item) => <li key={item.id}>{item.kind === 'image' ? <ImageIcon /> : <FileText />}<span><b>{item.filename}</b><small>{item.kind === 'image' ? `Photo ${item.width}×${item.height}${item.taken_at ? ` · taken ${dateTime(item.taken_at)}` : ''}` : `${item.pages ? `${item.pages} page(s) · ` : ''}${item.characters || 0} characters read`}{item.note ? ` · ${item.note}` : ''}</small></span></li>)}</ul>
  </Panel>
}

function HistoryPanel({ id }: { id: number }) {
  const [history, setHistory] = useState<ComplaintHistory | null>(null)
  useEffect(() => { api.history(id).then(setHistory).catch((e) => toast.error(messageOf(e))) }, [id])
  if (!history) return <div className="card"><Skeleton /></div>
  return <div className="detail-grid">
    <Panel className="span-2" title="Audit trail" subtitle="Append-only log of every action"><div className="timeline">{history.audit.map((a, i) => <div key={i}><i /><span><b>{labelize(a.action)}</b> by {a.actor}<small>{dateTime(a.at)}</small>{summarizeDetails(a.details)}</span></div>)}</div></Panel>
    <Panel title="GenAI runs" subtitle="Provider, prompt version and retries">{history.genai_runs.length ? <div className="timeline">{history.genai_runs.map((r, i) => <div key={i}><i className={r.valid ? '' : 'bad'} /><span><b>{r.provider}</b> {r.model} · prompt {r.prompt_version}<small>{dateTime(r.at)} · attempt {r.attempt}{r.latency_ms ? ` · ${(r.latency_ms / 1000).toFixed(1)}s` : ''}</small>{r.error && <em>{r.error.slice(0, 200)}</em>}</span></div>)}</div> : <p className="muted">No GenAI runs.</p>}</Panel>
    <Panel className="span-2" title="Reviewer decisions" subtitle="Original recommendation kept next to the final decision">{history.reviews.length ? history.reviews.map((r, i) => <div className="review-record" key={i}><header><b>{labelize(r.action)}</b> by {r.reviewer}<small>{dateTime(r.at)}</small></header>{r.comments && <p>{r.comments}</p>}<div className="split-json"><pre className="json-view">{JSON.stringify(r.original_recommendation, null, 2)}</pre><pre className="json-view">{JSON.stringify(r.final_decision, null, 2)}</pre></div></div>) : <p className="muted">No reviewer decisions yet.</p>}</Panel>
    <Panel title="Follow-ups" subtitle="Scheduled communication">{history.followups.length ? <div className="timeline">{history.followups.map((f, i) => <div key={i}><i /><span><b>{labelize(f.type)}</b><small>{dateTime(f.scheduled_at)}</small>{f.message}</span></div>)}</div> : <p className="muted">None scheduled.</p>}</Panel>
  </div>
}

function ReviewQueuePage() {
  const [rows, setRows] = useState<Complaint[]>([])
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [comment, setComment] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [departmentId, setDepartmentId] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [modifying, setModifying] = useState(false)
  const load = useCallback(async () => { try { setRows(await api.manualReview()) } catch (e) { toast.error(messageOf(e)) } }, [])
  useEffect(() => { load(); api.departments().then(setDepartments).catch(() => undefined); api.categories().then(setCategories).catch(() => undefined) }, [load])
  const act = async (action: string, decision: Record<string, unknown> = {}) => {
    if (!selected) return
    setBusy(true)
    try { await api.review(selected.id, action, comment, decision); toast.success(`${labelize(action)} recorded`); setSelected(null); setComment(''); setDepartmentId(''); setCategory(''); setModifying(false); await load() } catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }
  return <Page>
    <PageHeader eyebrow="Human oversight" title="Manual review queue" description="Resolve ambiguity while preserving the original AI recommendation in the audit trail." />
    <div className="review-layout">
      <div className="review-list card"><div className="review-list-head"><span>{rows.length} cases pending</span><button onClick={load} title="Refresh"><RefreshCw /></button></div>{rows.length ? rows.map((row) => <button key={row.id} className={selected?.id === row.id ? 'selected' : ''} onClick={() => { setSelected(row); setModifying(false) }}><div><b>{row.complaint_code}</b><StatusBadge status={row.status} /></div><strong>{row.translated_title || row.title}</strong><p>{(row.checks?.review_reasons || []).join(' · ') || row.comparison?.explanation || 'Requires a human decision.'}</p><span><Priority value={row.python?.priority} /><small>{date(row.created_at)}</small></span></button>) : <EmptyState icon={ShieldCheck} title="Queue is clear" description="No complaints currently require manual review." />}</div>
      <div className="review-workspace card">{selected ? <>
        <div className="review-case-head">
          <div>
            <span>{selected.complaint_code}</span>
            <h2>{selected.translated_title || selected.title}</h2>
            {selected.translated_title && selected.translated_title.trim().toLowerCase() !== selected.title.trim().toLowerCase() && (
              <small className="muted" style={{ display: 'block', fontSize: '0.78rem', marginTop: '-2px' }}>
                Original: &ldquo;{selected.title}&rdquo;
              </small>
            )}
          </div>
          <Link to={`/complaints/${selected.id}`} className="text-button">Full case <ArrowRight /></Link>
        </div>
        {selected.feedback && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.65rem', borderRadius: '6px', background: selected.feedback.rating <= 2 ? '#fef2f2' : selected.feedback.rating === 5 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${selected.feedback.rating <= 2 ? '#fca5a5' : selected.feedback.rating === 5 ? '#86efac' : '#cbd5e1'}`, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <StarRating value={selected.feedback.rating} readOnly />
            <b style={{ fontSize: '0.9rem' }}>{selected.feedback.rating} / 5</b>
            {selected.feedback.rating <= 2 && <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.8rem' }}>⚠ Low Customer Satisfaction</span>}
            {selected.feedback.rating === 5 && <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.8rem' }}>✓ Satisfied</span>}
            {selected.feedback.comment && <span className="muted" style={{ fontStyle: 'italic', fontSize: '0.8rem' }}>&ldquo;{selected.feedback.comment}&rdquo;</span>}
          </div>
        )}
        <TranslatedTextToggle originalText={selected.description} translatedText={selected.translated_description} sourceLanguage={selected.source_language} confidence={selected.translation_confidence} compact />
        {(selected.checks?.review_reasons?.length || selected.flags?.length) ? <div className="reason-chips">{(selected.checks?.review_reasons || []).map((r) => <span key={r} className="chip warn">{r}</span>)}{(selected.flags || []).map((f, i) => <span key={i} className="chip">{labelize(String(f.code || 'flag'))}</span>)}</div> : null}
        <div className="split-comparison"><Intelligence title="GenAI recommendation" icon={Bot} data={selected.genai} note={genaiNote(selected)} /><Intelligence title="Python ground truth" icon={ShieldCheck} data={selected.python} verified /></div>
        <Field label="Reviewer note" full><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Document your reasoning for the audit trail…" /></Field>
        <div className="review-extra"><label>Reassign department<select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><button className="button secondary" disabled={busy || !departmentId} onClick={() => act('reassign', { department_id: Number(departmentId) })}>Reassign</button><label>Reclassify as<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}</select></label><button className="button secondary" disabled={busy || !category} onClick={() => act('reclassify', { issue_category: category, ...(departmentId ? { department_id: Number(departmentId) } : {}) })}>Reclassify</button></div>
        <div className="review-actions"><button className="button ghost" disabled={busy || !comment.trim()} onClick={() => act('comment')}><MessageSquareText /> Comment</button><button className="button ghost" disabled={busy} onClick={() => act('regenerate')}><RefreshCw /> Regenerate</button><button className={`button ghost${modifying ? ' active' : ''}`} disabled={busy} onClick={() => setModifying((v) => !v)}><PencilLine /> Modify</button><button className="button danger-outline" disabled={busy} onClick={() => act('reject')}><XCircle /> Reject</button><button className="button secondary" disabled={busy} onClick={() => act('escalate')}><ShieldAlert /> Escalate</button><button className="button primary" disabled={busy} onClick={() => act('approve')}><CheckCircle2 /> Approve</button></div>
        {modifying && <ModifyDecision key={selected.id} complaint={selected} departments={departments} categories={categories} busy={busy} onSubmit={(decision) => act('modify', decision)} onCancel={() => setModifying(false)} />}
      </> : <EmptyState icon={UserRoundCheck} title="Select a complaint" description="Choose a case to compare AI and Python decisions side by side." />}</div>
    </div>
  </Page>
}


function ModifyDecision({ complaint, departments, categories, busy, onSubmit, onCancel }: { complaint: Complaint; departments: Department[]; categories: Category[]; busy: boolean; onSubmit: (decision: Record<string, unknown>) => void; onCancel: () => void }) {
  const py = complaint.python || {}
  const [form, setForm] = useState({
    issue_category: String(py.issue_category || ''),
    subcategory: String(py.subcategory || ''),
    urgency: String(py.urgency || ''),
    priority: String(py.priority || ''),
    department_id: String(complaint.assigned_department_id || ''),
    escalation_required: Boolean(py.escalation_required),
    customer_response: String(complaint.genai?.customer_response || ''),
  })
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }))
  const subcategories = categories.find((c) => c.name === form.issue_category)?.subcategories || []
  const submit = () => {
    const decision: Record<string, unknown> = {}
    ;(['issue_category', 'subcategory', 'urgency', 'priority'] as const).forEach((key) => { if (form[key] && form[key] !== String(py[key] || '')) decision[key] = form[key] })
    if (form.department_id && Number(form.department_id) !== complaint.assigned_department_id) decision.department_id = Number(form.department_id)
    if (form.escalation_required !== Boolean(py.escalation_required)) decision.escalation_required = form.escalation_required
    if (form.customer_response.trim() && form.customer_response.trim() !== String(complaint.genai?.customer_response || '').trim()) decision.customer_response = form.customer_response.trim()
    if (!Object.keys(decision).length) { toast.error('Change at least one field to record a modification.'); return }
    onSubmit(decision)
  }
  return <div className="modify-panel">
    <header><b>Modify the decision</b><small>Only changed fields are stored; the original recommendation stays in the audit trail.</small></header>
    <div className="modify-grid">
      <label>Category<select value={form.issue_category} onChange={(e) => { set('issue_category', e.target.value); set('subcategory', '') }}><option value="">—</option>{categories.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}</select></label>
      <label>Subcategory<select value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}><option value="">—</option>{subcategories.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}{form.subcategory && !subcategories.some((s) => s.name === form.subcategory) && <option value={form.subcategory}>{form.subcategory}</option>}</select></label>
      <label>Urgency<select value={form.urgency} onChange={(e) => set('urgency', e.target.value)}>{URGENCIES.map((u) => <option key={u} value={u}>{labelize(u)}</option>)}</select></label>
      <label>Priority<select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      <label>Department<select value={form.department_id} onChange={(e) => set('department_id', e.target.value)}><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label className="check-row"><input type="checkbox" checked={form.escalation_required} onChange={(e) => set('escalation_required', e.target.checked)} /> Escalation required</label>
    </div>
    <label className="modify-response">Approved customer response<textarea rows={5} value={form.customer_response} onChange={(e) => set('customer_response', e.target.value)} placeholder="Edit the draft the agent will send. Leave blank to keep the generated draft." /></label>
    <div className="review-actions"><button className="button ghost" onClick={onCancel} disabled={busy}>Cancel</button><button className="button primary" onClick={submit} disabled={busy}><PencilLine /> Save modification</button></div>
  </div>
}

function PolicyImpactPanel({ impact, busy, onReanalyze, onClose }: { impact: { code: string; version: string; affected: string[]; report: PolicyImpact }; busy: boolean; onReanalyze: () => void; onClose: () => void }) {
  const r = impact.report
  const rows: Array<[string, ReactNode]> = [
    ['Previous version', r.previous_versions.length ? `v${r.previous_versions.join(', v')} is now obsolete (kept for audit)` : 'First version of this document'],
    ['Sections changed', r.sections_changed.length ? r.sections_changed.map((s) => `§${s}`).join(', ') : r.previous_versions.length ? 'None' : '—'],
    ['Sections added / removed', `${r.sections_added.map((s) => `+§${s}`).join(', ') || 'none added'} · ${r.sections_removed.map((s) => `−§${s}`).join(', ') || 'none removed'}`],
    ['Timelines & rates', r.timeline_changes.length ? r.timeline_changes.map((c) => `${c.unit}: ${c.before.join('/') || '—'} → ${c.after.join('/') || '—'}`).join(' · ') : 'No change detected'],
    ['Resolution rules citing it', r.resolution_rules.length ? <span className="chip-row">{r.resolution_rules.map((x) => <span key={x.rule_code} className={`chip ${!x.section_exists ? 'no' : x.section_changed ? 'warn' : ''}`}>{x.rule_code}{x.section ? ` §${x.section}` : ''}{!x.section_exists ? ' · section missing' : x.section_changed ? ' · changed' : ''}</span>)}</span> : 'None'],
    ['Escalation rules', r.escalation_rules.length ? r.escalation_rules.map((x) => x.rule_code).join(', ') : 'No escalation rule names this document'],
    ['Open complaints affected', impact.affected.length ? impact.affected.slice(0, 12).join(', ') + (impact.affected.length > 12 ? ` +${impact.affected.length - 12} more` : '') : 'None'],
  ]
  return <Panel className="impact-panel" title={`Policy change impact · ${impact.code} v${impact.version}`} subtitle={r.responses_need_revision ? 'Generated responses that relied on the old text need revision' : 'No wording change affects existing responses'} action={<button className="icon-button" onClick={onClose} title="Dismiss"><XCircle /></button>}>
    <div className="kv-list">{rows.map(([label, value]) => <Fragment key={label}><span>{label}</span><b>{value}</b></Fragment>)}</div>
    {r.rules_citing_missing_sections.length ? <p className="missing-info"><AlertTriangle /> {r.rules_citing_missing_sections.length} rule(s) cite a section that no longer exists. Update them in Settings → Rules.</p> : null}
    {impact.affected.length ? <div className="review-actions"><button className="button primary" disabled={busy} onClick={onReanalyze}>{busy ? <RefreshCw className="spin" /> : <RefreshCw />} Re-analyze affected complaints</button></div> : null}
  </Panel>
}

function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [dialog, setDialog] = useState(false)
  const [chunks, setChunks] = useState<{ doc: KnowledgeDocument; rows: DocumentChunk[] } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [impact, setImpact] = useState<{ code: string; version: string; affected: string[]; report: PolicyImpact } | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const role = useAppStore((s) => s.role)
  const admin = role === 'administrator'
  const [meta, setMeta] = useState({ document_code: '', title: '', version: '1.0', category: 'policy', status: 'active', effective_date: '', expiry_date: '' })
  const load = useCallback(async () => { try { setDocs(await api.documents()) } catch (e) { toast.error(messageOf(e)) } }, [])
  useEffect(() => { load() }, [load])
  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return toast.error('Select a document')
    const form = new FormData()
    form.append('file', file)
    Object.entries(meta).forEach(([k, v]) => { if (v) form.append(k, v) })
    setBusy(true)
    try {
      const result = await api.uploadDocument(form)
      toast.success(`${result.document_code} parsed into ${result.chunks} chunks`)
      if (result.superseded_versions.length) toast.info(`Previous version ${result.superseded_versions.join(', ')} is now marked previous.`)
      if (result.affected_complaint_codes.length) toast.warning(`${result.affected_complaint_codes.length} open complaint(s) cite this policy and should be re-analyzed: ${result.affected_complaint_codes.slice(0, 5).join(', ')}`)
      result.warnings.forEach((w) => toast.warning(w))
      if (result.impact) setImpact({ code: result.document_code, version: result.version, affected: result.affected_complaint_codes, report: result.impact })
      setDialog(false); setFile(null); await load()
    } catch (error) { toast.error(messageOf(error)) } finally { setBusy(false) }
  }
  const changeStatus = async (doc: KnowledgeDocument, status: string) => {
    try {
      const result = await api.setDocumentStatus(doc.id, status)
      toast.success(`${doc.document_code} v${doc.version} is now ${status}`)
      if (result.affected_complaint_codes.length) toast.warning(`Re-analysis recommended for ${result.affected_complaint_codes.join(', ')}`)
      await load()
    } catch (e) { toast.error(messageOf(e)) }
  }
  const reanalyze = async () => {
    setReanalyzing(true)
    try {
      const result = await api.reanalyzeFlagged()
      toast.success(`Re-analyzed ${result.reanalyzed.length} complaint(s)${result.remaining ? `, ${result.remaining} still flagged` : ''}`)
      result.failed.forEach((f) => toast.error(`${f.complaint_code}: ${f.error}`))
      setImpact((current) => current && { ...current, affected: result.remaining ? current.affected : [] })
    } catch (e) { toast.error(messageOf(e)) } finally { setReanalyzing(false) }
  }
  const openChunks = async (doc: KnowledgeDocument) => { try { setChunks({ doc, rows: await api.documentChunks(doc.id) }) } catch (e) { toast.error(messageOf(e)) } }
  const visible = docs.filter((d) => (!categoryFilter || d.category === categoryFilter) && (!statusFilter || d.status === statusFilter) && `${d.document_code} ${d.title}`.toLowerCase().includes(search.toLowerCase()))
  return <Page>
    <PageHeader eyebrow="Grounded intelligence" title="Knowledge base" description="Approved policies, SOPs and FAQs with traceable, versioned chunks." action={admin ? <button className="button primary" onClick={() => setDialog(true)}><Upload /> Upload document</button> : undefined} />
    {impact && <PolicyImpactPanel impact={impact} busy={reanalyzing} onReanalyze={reanalyze} onClose={() => setImpact(null)} />}
    <div className="kb-stats">
      <div><div className="kb-stat-icon versions"><FileText /></div><span><b>{docs.length}</b>Document versions</span></div>
      <div><div className="kb-stat-icon chunks"><BookOpen /></div><span><b>{docs.reduce((sum, d) => sum + d.chunk_count, 0)}</b>Traceable chunks</span></div>
      <div><div className="kb-stat-icon active"><ShieldCheck /></div><span><b>{docs.filter((d) => d.status === 'active' && d.usable !== false).length}</b>Active & usable</span></div>
    </div>
    <div className="toolbar card"><div className="search-field"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search document ID or title…" /></div><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All versions</option>{DOC_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</select><span className="result-count">{visible.length} shown</span></div>
    <div className="document-grid">{visible.map((doc) => <article className="document-card card" key={doc.id}><div className={`doc-icon ${doc.category}`}><FileText /></div><div className="doc-main"><div><span>{doc.document_code}</span><StatusBadge status={doc.status} /></div><h3>{doc.title}</h3><p>{labelize(doc.category)} · Version {doc.version}{doc.status === 'active' && doc.usable === false ? ' · outside effective window' : ''}</p><footer><button className="text-button" onClick={() => openChunks(doc)}><BookOpen /> {doc.chunk_count} chunks</button><span>Effective {doc.effective_date ? date(doc.effective_date) : '—'}{doc.expiry_date ? ` → ${date(doc.expiry_date)}` : ''}</span></footer></div>{admin && <select className="doc-status" value={doc.status} title="Change version status" onChange={(e) => changeStatus(doc, e.target.value)}>{DOC_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</select>}</article>)}</div>
    {!visible.length && <EmptyState icon={FileText} title="No documents match" description="Adjust the filters or upload a document." />}
    {dialog && <Modal title="Upload knowledge document" close={() => setDialog(false)}><form className="upload-form" onSubmit={upload}><label className={`drop-zone ${file ? 'has-file' : ''}`}><input type="file" accept=".pdf,.docx,.txt,.md,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} /><Upload />{file ? <><b>{file.name}</b><span>{Math.max(1, Math.round(file.size / 1024))} KB · Ready to parse</span></> : <><b>Drop PDF or DOCX here</b><span>TXT, MD and CSV also accepted · maximum 15 MB</span></>}</label><div className="form-grid"><Field label="Document ID" note="e.g. REF-POL-02"><input required value={meta.document_code} onChange={(e) => setMeta({ ...meta, document_code: e.target.value.toUpperCase() })} placeholder="REF-POL-02" /></Field><Field label="Version"><input required value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} /></Field><Field label="Title" full><input required value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field><Field label="Category"><select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>{DOC_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</select></Field><Field label="Status" note="Active supersedes the current version"><select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>{DOC_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}</select></Field><Field label="Effective date" note="Defaults to today"><input type="date" value={meta.effective_date} onChange={(e) => setMeta({ ...meta, effective_date: e.target.value })} /></Field><Field label="Expiry date" note="Optional"><input type="date" value={meta.expiry_date} onChange={(e) => setMeta({ ...meta, expiry_date: e.target.value })} /></Field></div><div className="modal-actions"><button type="button" className="button ghost" onClick={() => setDialog(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <RefreshCw className="spin" /> : <Upload />} Process document</button></div></form></Modal>}
    {chunks && <Modal title={`${chunks.doc.document_code} v${chunks.doc.version} · chunks`} close={() => setChunks(null)}><div className="chunk-list">{chunks.rows.map((c) => <article key={c.chunk_code}><header><b>{c.chunk_code}</b><small>Section {c.section || '—'} · {c.heading || 'No heading'}{c.page_number ? ` · page ${c.page_number}` : ''}</small></header><p>{c.content}</p></article>)}</div></Modal>}
  </Page>
}

function ReportsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  const [trends, setTrends] = useState<Trends | null>(null)
  useEffect(() => {
    api.analytics().then(setData).catch((e) => toast.error(messageOf(e)))
    api.trends(7).then(setTrends).catch((e) => toast.error(messageOf(e)))
  }, [])
  const download = (format: 'csv' | 'xlsx' | 'pdf', report: ReportKey) => api.downloadReport(format, report).catch((e) => toast.error(messageOf(e)))
  const trendItems = [...(trends?.rising_categories || []).map((t) => `${t.note}: ${t.current} this week vs ${t.previous} before`), ...(trends?.recurring_product_issues || []).map((t) => `${t.product}: ${t.count} ${t.category.toLowerCase()} complaints`), ...(trends?.escalation_spikes || []).map((t) => `${t.escalations} escalations on ${t.date}`)]
  return <Page>
    <PageHeader eyebrow="Operational intelligence" title="Reports & analytics" description="Complaint trends, compliance, department performance and pipeline agreement." action={<div className="button-group"><button className="button secondary" onClick={() => download('csv', 'complaints')}><Download /> CSV</button><button className="button primary" onClick={() => download('xlsx', 'comparison')}><Download /> Comparison (Excel)</button></div>} />
    <div className="metric-grid"><Metric label="Full agreement" value={data?.agreement_rate == null ? '—' : `${data.agreement_rate}%`} icon={ShieldCheck} tone="violet" note={data?.genai_compared ? `${data.verified_matches} of ${data.genai_compared} GenAI analyses` : 'No GenAI comparisons yet'} /><Metric label="Avg verification" value={data?.average_verification_score == null ? '—' : `${data.average_verification_score}%`} icon={CheckCircle2} tone="teal" note="Field agreement minus flags" /><Metric label="SLA compliance" value={data?.sla_compliance == null ? '—' : `${data.sla_compliance}%`} icon={Clock3} tone="orange" note="Open complaints not at risk" /><Metric label="Avg resolution" value={data?.average_resolution_hours == null ? '—' : `${data.average_resolution_hours} h`} icon={Activity} tone="red" note={`${data?.repeat_complaints ?? 0} repeat complaints`} /></div>
    <div className="dashboard-grid">
      <Panel className="span-2" title="Department workload" subtitle="Complaints routed by Python rules"><ResponsiveContainer width="100%" height={310}><BarChart data={entries(data?.departments || {})} layout="vertical" margin={{ left: 20 }}><CartesianGrid horizontal={false} stroke="#ebeaf0" /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="#6558f5" radius={[0, 6, 6, 0]} barSize={18} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Trends" subtitle={`Last ${trends?.window_days ?? 7} days vs the week before`}>{trendItems.length ? <List title="Detected patterns" items={trendItems} icon={TrendingUp} /> : <div className="all-clear"><TrendingUp /><span><b>No emerging trends</b>No category rising, recurring product issue or escalation spike.</span></div>}</Panel>
      <Panel className="span-2" title="Complaint volume & escalations" subtitle="Last 14 days"><ResponsiveContainer width="100%" height={260}><AreaChart data={(data?.daily_volume || []).map((d) => ({ ...d, day: d.date.slice(5) }))}><defs><linearGradient id="vol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6558f5" stopOpacity={.28} /><stop offset="100%" stopColor="#6558f5" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ebeaf0" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="complaints" name="Complaints" stroke="#6558f5" strokeWidth={2.5} fill="url(#vol)" /><Area type="monotone" dataKey="escalations" name="Escalations" stroke="#f15c6d" strokeWidth={2} fill="none" /></AreaChart></ResponsiveContainer></Panel>
      <Panel title="Customer satisfaction" subtitle="CSAT from closed complaints">{data?.csat?.responses ? <div className="csat-summary"><strong>{data.csat.average}<small>/5</small></strong><StarRating value={Math.round(data.csat.average || 0)} readOnly /><p className="muted">{data.csat.responses} rating(s)</p><div className="csat-bars">{[5, 4, 3, 2, 1].map((n) => { const count = data.csat?.distribution[String(n)] || 0; return <div key={n}><span>{n}★</span><div><i style={{ width: `${(100 * count) / Math.max(1, data.csat?.responses || 1)}%` }} /></div><b>{count}</b></div> })}</div></div> : <p className="muted">No ratings yet. Customers rate when they confirm a resolution.</p>}</Panel>
      <Panel title="Sentiment" subtitle="Tone only — never used for urgency"><SentimentDotPlot data={entries(data?.sentiments || {})} /></Panel>
      <Panel title="Urgency" subtitle="From Python rules"><UrgencyScatterPlot data={entries(data?.urgencies || {})} /></Panel>
      <Panel title="Status" subtitle="Complaint lifecycle"><Donut data={entries(data?.statuses || {})} /></Panel>
      <Panel className="span-2" title="Top products" subtitle="Complaints by product or service"><ResponsiveContainer width="100%" height={260}><BarChart data={entries(data?.products || {})} margin={{ left: 0 }}><CartesianGrid vertical={false} stroke="#ebeaf0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} height={50} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#26b6a0" radius={[6, 6, 0, 0]} barSize={26} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="First response SLA" subtitle="First customer-visible reply"><div className="fr-summary"><strong>{data?.first_response?.compliance == null ? '—' : `${data.first_response.compliance}%`}</strong><p className="muted">on time</p><div className="health-list"><span><CheckCircle2 /> Met <b>{data?.first_response?.met ?? 0}</b></span><span><AlertTriangle /> Late <b>{data?.first_response?.breached ?? 0}</b></span><span><Clock3 /> Waiting <b>{data?.first_response?.pending ?? 0}</b></span><span><ShieldAlert /> Overdue, no reply <b>{data?.first_response?.overdue ?? 0}</b></span></div></div></Panel>
      <Panel className="span-3" title="Report library" subtitle="Export any report as CSV, Excel or PDF"><div className="report-table">{REPORTS.map(([key, name]) => <div key={key}><span><FileText /><b>{name}</b></span><div>{(['csv', 'xlsx', 'pdf'] as const).map((f) => <button key={f} className="button ghost compact" onClick={() => download(f, key)}><Download /> {f.toUpperCase()}</button>)}</div></div>)}</div></Panel>
    </div>
  </Page>
}

function SettingsPage() {
  const [tab, setTab] = useState('pipeline')
  const tabs: Array<[string, string]> = [['pipeline', 'Pipelines'], ['rules', 'Resolution rules'], ['escalation', 'Escalation rules'], ['taxonomy', 'Categories & departments'], ['sla', 'SLA & priority'], ['users', 'Users']]
  return <Page>
    <PageHeader eyebrow="Administration" title="Workspace settings" description="Change rules, thresholds and access without touching code. Every change is written to the audit log." />
    <div className="tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'pipeline' && <PipelineSettings />}
    {tab === 'rules' && <RulesSettings />}
    {tab === 'escalation' && <EscalationSettings />}
    {tab === 'taxonomy' && <TaxonomySettings />}
    {tab === 'sla' && <SlaSettings />}
    {tab === 'users' && <UserSettings />}
  </Page>
}

function PipelineSettings() {
  const [config, setConfig] = useState<GenAIConfig | null>(null)
  const load = useCallback(() => { api.genaiConfig().then(setConfig).catch((e) => toast.error(messageOf(e))) }, [])
  useEffect(() => { load() }, [load])
  const resume = async () => { try { const r = await api.resetGenai(); toast.success(r.reset.length ? `Retrying ${r.reset.join(', ')} on the next analysis` : 'No providers were paused'); load() } catch (e) { toast.error(messageOf(e)) } }
  if (!config) return <div className="card"><Skeleton /></div>
  const paused = Object.entries(config.paused || {})
  return <div className="settings-grid">
    <Panel title="Pipeline 1 · GenAI" subtitle="Structured complaint writer"><Setting icon={Bot} label="Provider chain" value={config.chain.length ? config.chain.map((c) => `${c.provider} (${c.model})`).join(' → ') : 'No provider key configured — Python-only mode'} /><Setting icon={FileText} label="Prompt template" value={`${config.prompt.name} · active ${config.prompt.active_version} · versions ${config.prompt.versions.join(', ')}`} /><Setting icon={RefreshCw} label="Failure strategy" value={`${config.max_retries} tries per provider, ${config.timeout_seconds}s timeout, ${config.total_budget_seconds}s total, then manual review`} />{paused.length > 0 && <div className="alert warning paused-alert"><AlertTriangle /><span><b>Paused after permanent errors</b>{paused.map(([p, s]) => `${p} (${Math.ceil(s / 60)} min left)`).join(', ')}. Top up credits or fix the key, then resume.</span><button className="button secondary compact" onClick={resume}>Resume</button></div>}</Panel>
    <Panel title="Pipeline 2 · Python" subtitle="Independent ground truth"><ThresholdEditor onSaved={load} /><Setting icon={History} label="Repeat rule" value={`${config.thresholds.repeat_similarity_threshold}% wording similarity or same order reference`} /><Setting icon={BookOpen} label="Unmatched complaints" value={`Routed to ${config.thresholds.default_department_code} and manual review`} /></Panel>
    <Panel title="Security" subtitle="Access and adversarial controls"><Setting icon={Users} label="Authentication" value="JWT + Argon2, role-based access" /><Setting icon={ShieldAlert} label="Prompt injection" value="Complaints and documents wrapped as untrusted data; patterns flagged" /><Setting icon={Activity} label="Privacy" value="Emails, phones and card numbers masked before GenAI" /></Panel>
  </div>
}

function ThresholdEditor({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = useState<Array<{ key: string; value: number; min: number; max: number; description: string }>>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const admin = useAppStore((s) => s.role) === 'administrator'
  const load = useCallback(() => { api.thresholds().then((r) => { setRows(r); setDraft(Object.fromEntries(r.map((x) => [x.key, String(x.value)]))) }).catch(() => undefined) }, [])
  useEffect(() => { load() }, [load])
  const save = async (key: string) => {
    const value = Number(draft[key])
    try { await api.updateThreshold(key, value); toast.success(`${labelize(key)} set to ${value.toLocaleString()} — applies to the next analysis`); load(); onSaved() } catch (e) { toast.error(messageOf(e)) }
  }
  return <div className="threshold-list">{rows.map((row) => {
    const changed = draft[row.key] !== String(row.value)
    return <div className="threshold-row" key={row.key}><span><b>{labelize(row.key)}</b><small>{row.description}</small></span>{admin ? <div className="threshold-input"><input type="number" min={row.min} max={row.max} value={draft[row.key] ?? ''} onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && changed && save(row.key)} /><button className="button secondary compact" disabled={!changed} onClick={() => save(row.key)}>Save</button></div> : <b>{row.value.toLocaleString()}</b>}</div>
  })}</div>
}

function RulesSettings() {
  const [rules, setRules] = useState<Rule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filter, setFilter] = useState('')
  const blank = { rule_code: '', category_code: '', subcategory_code: '', keywords: '', department_code: '', supporting: '', urgency: 'medium', priority: 'P2', policy_code: '', policy_section: '', escalation_required: false, escalation_level: 'no_escalation', required_actions: '', prohibited_actions: '', refund_eligible: '', replacement_eligible: '', compensation_permitted: false }
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const load = useCallback(() => { api.rules().then(setRules).catch((e) => toast.error(messageOf(e))) }, [])
  useEffect(() => { load(); api.categories().then(setCategories).catch(() => undefined); api.departments().then(setDepartments).catch(() => undefined) }, [load])
  const subcats = categories.find((c) => c.code === form.category_code)?.subcategories || []
  const tri = (value: string) => value === '' ? null : value === 'yes'
  const create = async (e: FormEvent) => {
    e.preventDefault()
    const { supporting, ...rest } = form
    const body = { ...rest, keywords: splitList(form.keywords), supporting_department_codes: splitList(supporting), required_actions: splitLines(form.required_actions), prohibited_actions: splitLines(form.prohibited_actions), refund_eligible: tri(form.refund_eligible), replacement_eligible: tri(form.replacement_eligible), escalation_required: form.escalation_level !== 'no_escalation' }
    try {
      if (editing) {
        const { rule_code: _code, category_code: _cat, subcategory_code: _sub, ...changes } = body
        const result = await api.updateRule(editing, changes)
        toast.success(`Rule ${result.rule_code} updated — applies to the next analysis`); result.warnings.forEach((w) => toast.warning(w))
        setEditing(null); setForm(blank)
      } else {
        const result = await api.createRule(body)
        toast.success(`Rule ${result.rule_code} created`); result.warnings.forEach((w) => toast.warning(w))
      }
      load()
    } catch (err) { toast.error(messageOf(err)) }
  }
  const edit = (r: Rule) => {
    const triText = (v: boolean | null | undefined) => v == null ? '' : v ? 'yes' : 'no'
    setEditing(r.rule_code)
    setForm({ rule_code: r.rule_code, category_code: r.category_code, subcategory_code: r.subcategory_code, keywords: (r.conditions.keywords || []).join(', '), department_code: r.department_code, supporting: (r.supporting_department_codes || []).join(', '), urgency: r.urgency, priority: r.priority, policy_code: r.policy_code || '', policy_section: r.policy_section || '', escalation_required: r.escalation_required, escalation_level: r.escalation_level, required_actions: (r.required_actions || []).join('\n'), prohibited_actions: (r.prohibited_actions || []).join('\n'), refund_eligible: triText(r.refund_eligible), replacement_eligible: triText(r.replacement_eligible), compensation_permitted: Boolean(r.compensation_permitted) })
    document.querySelector('.rule-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const toggle = async (rule: Rule) => { try { await api.toggleRule(rule.rule_code, !rule.is_active); load() } catch (e) { toast.error(messageOf(e)) } }
  const visible = rules.filter((r) => `${r.rule_code} ${r.category_code} ${r.subcategory_code} ${(r.conditions.keywords || []).join(' ')}`.toLowerCase().includes(filter.toLowerCase()))
  return <div className="config-layout">
    <Panel title={`Rule matrix (${rules.length})`} subtitle="Complaint Resolution Rule Matrix" action={<div className="search-field compact"><Search /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter rules…" /></div>}>
      <div className="table-scroll"><table className="data-table dense"><thead><tr><th>Rule</th><th>Category / sub</th><th>Keywords</th><th>Dept</th><th>Urg / pri</th><th>Policy</th><th>Escalation</th><th>Active</th><th></th></tr></thead><tbody>{visible.map((r) => <tr key={r.id} className={`${r.is_active ? '' : 'inactive'}${editing === r.rule_code ? ' editing' : ''}`}><td><b>{r.rule_code}</b></td><td>{r.category_code} / {r.subcategory_code}</td><td className="muted">{(r.conditions.keywords || []).join(', ')}</td><td>{r.department_code}</td><td>{r.urgency} · {r.priority}</td><td>{r.policy_code} {r.policy_section && `§${r.policy_section}`}</td><td>{r.escalation_required ? labelize(r.escalation_level) : '—'}</td><td><input type="checkbox" checked={r.is_active} onChange={() => toggle(r)} /></td><td><button className="text-button" onClick={() => edit(r)}><PencilLine /> Edit</button></td></tr>)}</tbody></table></div>
    </Panel>
    <Panel className="rule-form" title={editing ? `Edit ${editing}` : 'Add a rule'} subtitle="Takes effect on the next analysis" action={editing ? <button className="button ghost compact" onClick={() => { setEditing(null); setForm(blank) }}>Cancel edit</button> : undefined}><form className="inline-form" onSubmit={create}>
      <Field label="Rule code"><input required disabled={!!editing} value={form.rule_code} onChange={(e) => setForm({ ...form, rule_code: e.target.value.toUpperCase() })} placeholder="RR-200" /></Field>
      <Field label="Category"><select required disabled={!!editing} value={form.category_code} onChange={(e) => setForm({ ...form, category_code: e.target.value, subcategory_code: '' })}><option value="">Select…</option>{categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
      <Field label="Subcategory"><select required disabled={!!editing} value={form.subcategory_code} onChange={(e) => setForm({ ...form, subcategory_code: e.target.value })}><option value="">Select…</option>{subcats.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
      <Field label="Department"><select required value={form.department_code} onChange={(e) => setForm({ ...form, department_code: e.target.value })}><option value="">Select…</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></Field>
      <Field label="Keywords" full note="Comma separated, matched as whole words"><input required value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="battery swelling, bulging battery" /></Field>
      <Field label="Supporting departments" full note="Codes, comma separated"><input value={form.supporting} onChange={(e) => setForm({ ...form, supporting: e.target.value.toUpperCase() })} placeholder="SAF, REL" /></Field>
      <Field label="Urgency"><select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>{URGENCIES.map((u) => <option key={u}>{u}</option>)}</select></Field>
      <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Policy ID"><input value={form.policy_code} onChange={(e) => setForm({ ...form, policy_code: e.target.value.toUpperCase() })} placeholder="SAF-POL-01" /></Field>
      <Field label="Section"><input value={form.policy_section} onChange={(e) => setForm({ ...form, policy_section: e.target.value })} placeholder="1.4" /></Field>
      <Field label="Escalation level" full><select value={form.escalation_level} onChange={(e) => setForm({ ...form, escalation_level: e.target.value, escalation_required: e.target.value !== 'no_escalation' })}>{ESCALATION_LEVELS.map((l) => <option key={l} value={l}>{labelize(l)}</option>)}</select></Field>
      <Field label="Mandatory actions" full note="One per line"><textarea rows={2} value={form.required_actions} onChange={(e) => setForm({ ...form, required_actions: e.target.value })} /></Field>
      <Field label="Prohibited actions" full note="One per line"><textarea rows={2} value={form.prohibited_actions} onChange={(e) => setForm({ ...form, prohibited_actions: e.target.value })} /></Field>
      <Field label="Refund eligible"><select value={form.refund_eligible} onChange={(e) => setForm({ ...form, refund_eligible: e.target.value })}><option value="">Needs check</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
      <Field label="Replacement eligible"><select value={form.replacement_eligible} onChange={(e) => setForm({ ...form, replacement_eligible: e.target.value })}><option value="">Needs check</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
      <label className="check full"><input type="checkbox" checked={form.compensation_permitted} onChange={(e) => setForm({ ...form, compensation_permitted: e.target.checked })} /> Compensation permitted under policy</label>
      <button className="button primary full">{editing ? <><Check /> Save changes</> : <><Plus /> Add rule</>}</button>
    </form></Panel>
  </div>
}

function EscalationSettings() {
  const [rules, setRules] = useState<EscalationRule[]>([])
  const [form, setForm] = useState({ rule_code: '', name: '', keywords: '', categories: '', min_repeat_count: '0', escalation_level: 'supervisor_review', force_urgency: '', reason: '' })
  const load = useCallback(() => { api.escalationRules().then(setRules).catch((e) => toast.error(messageOf(e))) }, [])
  useEffect(() => { load() }, [load])
  const update = async (rule: EscalationRule, body: Record<string, unknown>) => { try { await api.updateEscalationRule(rule.rule_code, body); toast.success(`${rule.rule_code} updated`); load() } catch (e) { toast.error(messageOf(e)) } }
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.createEscalationRule({ ...form, keywords: splitList(form.keywords), categories: splitList(form.categories), min_repeat_count: Number(form.min_repeat_count) || 0, force_urgency: form.force_urgency || null }); toast.success('Escalation rule created'); load() } catch (err) { toast.error(messageOf(err)) }
  }
  return <div className="config-layout">
    <Panel title={`Mandatory escalation rules (${rules.length})`} subtitle="Enforced by Python even if GenAI misses them"><div className="table-scroll"><table className="data-table dense"><thead><tr><th>Rule</th><th>Keywords / categories</th><th>Repeat ≥</th><th>Level</th><th>Force urgency</th><th>Active</th></tr></thead><tbody>{rules.map((r) => <tr key={r.rule_code} className={r.is_active ? '' : 'inactive'}><td><b>{r.rule_code}</b><span className="muted block">{r.name}</span></td><td className="muted">{[...r.keywords, ...r.categories.map((c) => `[${c}]`)].join(', ')}</td><td><input className="tiny" type="number" min={0} defaultValue={r.min_repeat_count} onBlur={(e) => Number(e.target.value) !== r.min_repeat_count && update(r, { min_repeat_count: Number(e.target.value) })} /></td><td><select value={r.escalation_level} onChange={(e) => update(r, { escalation_level: e.target.value })}>{ESCALATION_LEVELS.filter((l) => l !== 'no_escalation').map((l) => <option key={l} value={l}>{labelize(l)}</option>)}</select></td><td><select value={r.force_urgency || ''} onChange={(e) => update(r, { force_urgency: e.target.value || null })}><option value="">—</option>{URGENCIES.map((u) => <option key={u}>{u}</option>)}</select></td><td><input type="checkbox" checked={r.is_active} onChange={() => update(r, { is_active: !r.is_active })} /></td></tr>)}</tbody></table></div></Panel>
    <Panel title="Add an escalation condition" subtitle="Keywords, categories or repeat history"><form className="inline-form" onSubmit={create}>
      <Field label="Rule code"><input required value={form.rule_code} onChange={(e) => setForm({ ...form, rule_code: e.target.value.toUpperCase() })} placeholder="ESC-NEW-01" /></Field>
      <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Keywords" full note="Comma separated"><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="class action, regulator" /></Field>
      <Field label="Categories" full note="Category names, comma separated (optional)"><input value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="Privacy" /></Field>
      <Field label="Min. repeat count"><input type="number" min={0} value={form.min_repeat_count} onChange={(e) => setForm({ ...form, min_repeat_count: e.target.value })} /></Field>
      <Field label="Level"><select value={form.escalation_level} onChange={(e) => setForm({ ...form, escalation_level: e.target.value })}>{ESCALATION_LEVELS.filter((l) => l !== 'no_escalation').map((l) => <option key={l} value={l}>{labelize(l)}</option>)}</select></Field>
      <Field label="Force urgency"><select value={form.force_urgency} onChange={(e) => setForm({ ...form, force_urgency: e.target.value })}><option value="">—</option>{URGENCIES.map((u) => <option key={u}>{u}</option>)}</select></Field>
      <Field label="Reason" full><input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why this must escalate" /></Field>
      <button className="button primary full"><Plus /> Add escalation rule</button>
    </form></Panel>
  </div>
}

function TaxonomySettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState({ code: '', name: '' })
  const [cat, setCat] = useState({ code: '', name: '', default_department_code: '', sub_code: '', sub_name: '', keywords: '' })
  const [sub, setSub] = useState({ category: '', code: '', name: '', keywords: '' })
  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.categories().then(setCategories).catch((e) => toast.error(messageOf(e))),
      api.departments().then(setDepartments).catch(() => undefined),
    ]).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  const addDept = async (e: FormEvent) => { e.preventDefault(); try { await api.createDepartment(dept); toast.success(`${dept.name} added`); setDept({ code: '', name: '' }); load() } catch (err) { toast.error(messageOf(err)) } }
  const addCat = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.createCategory({ code: cat.code, name: cat.name, default_department_code: cat.default_department_code, subcategories: cat.sub_code ? [{ code: cat.sub_code, name: cat.sub_name || cat.sub_code, keywords: splitList(cat.keywords) }] : [] }); toast.success(`${cat.name} added. Complaints matching its keywords will route to it.`); load() } catch (err) { toast.error(messageOf(err)) }
  }
  const addSub = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.addSubcategory(sub.category, { code: sub.code, name: sub.name, keywords: splitList(sub.keywords) }); toast.success(`${sub.name} added. Add a resolution rule for it so it gets a policy and SLA.`); setSub({ category: sub.category, code: '', name: '', keywords: '' }); load() } catch (err) { toast.error(messageOf(err)) }
  }
  return (
    <>
      <CategoryOverviewStats
        categories={categories}
        departments={departments}
        loading={loading}
      />
      <div className="config-layout">
        <Panel title={`Categories (${categories.length})`} subtitle="Subcategories and their keywords"><div className="table-scroll"><table className="data-table dense"><thead><tr><th>Category</th><th>Default department</th><th>Subcategories</th></tr></thead><tbody>{categories.map((c) => <tr key={c.code}><td><b>{c.name}</b><span className="muted block">{c.code}</span></td><td>{c.default_department || '—'}</td><td className="muted">{c.subcategories.map((s) => s.name).join(', ')}</td></tr>)}</tbody></table></div></Panel>
        <div className="stack">
          <Panel title="Add a department" subtitle={`${departments.length} departments`}><form className="inline-form" onSubmit={addDept}><Field label="Code"><input required value={dept.code} onChange={(e) => setDept({ ...dept, code: e.target.value.toUpperCase() })} placeholder="ECO" /></Field><Field label="Name"><input required value={dept.name} onChange={(e) => setDept({ ...dept, name: e.target.value })} placeholder="Sustainability" /></Field><button className="button primary full"><Plus /> Add department</button></form></Panel>
          <Panel title="Add a category" subtitle="Works immediately via subcategory keywords"><form className="inline-form" onSubmit={addCat}><Field label="Code"><input required value={cat.code} onChange={(e) => setCat({ ...cat, code: e.target.value.toUpperCase() })} placeholder="ECO" /></Field><Field label="Name"><input required value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="Eco Packaging" /></Field><Field label="Default department" full><select required value={cat.default_department_code} onChange={(e) => setCat({ ...cat, default_department_code: e.target.value })}><option value="">Select…</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></Field><Field label="Subcategory code"><input value={cat.sub_code} onChange={(e) => setCat({ ...cat, sub_code: e.target.value.toUpperCase() })} placeholder="PLASTIC" /></Field><Field label="Subcategory name"><input value={cat.sub_name} onChange={(e) => setCat({ ...cat, sub_name: e.target.value })} placeholder="Excess Plastic" /></Field><Field label="Keywords" full note="Comma separated"><input value={cat.keywords} onChange={(e) => setCat({ ...cat, keywords: e.target.value })} placeholder="plastic wrap, styrofoam" /></Field><button className="button primary full"><Plus /> Add category</button></form></Panel>
          <Panel title="Add a subcategory" subtitle="Extend an existing category"><form className="inline-form" onSubmit={addSub}><Field label="Category" full><select required value={sub.category} onChange={(e) => setSub({ ...sub, category: e.target.value })}><option value="">Select…</option>{categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field><Field label="Code"><input required value={sub.code} onChange={(e) => setSub({ ...sub, code: e.target.value.toUpperCase() })} placeholder="ECO-BOX" /></Field><Field label="Name"><input required value={sub.name} onChange={(e) => setSub({ ...sub, name: e.target.value })} placeholder="Oversized Box" /></Field><Field label="Keywords" full note="Comma separated"><input value={sub.keywords} onChange={(e) => setSub({ ...sub, keywords: e.target.value })} placeholder="huge box, too much packaging" /></Field><button className="button primary full"><Plus /> Add subcategory</button></form></Panel>
        </div>
      </div>
    </>
  )
}

function SlaSettings() {
  const [sla, setSla] = useState<SlaPolicy[]>([])
  const [priority, setPriority] = useState<PriorityRule[]>([])
  const load = useCallback(() => { api.slaPolicies().then(setSla).catch((e) => toast.error(messageOf(e))); api.priorityRules().then(setPriority).catch(() => undefined) }, [])
  useEffect(() => { load() }, [load])
  const saveSla = async (row: SlaPolicy, field: 'first_response_minutes' | 'resolution_hours', value: number) => {
    if (!value || value === row[field]) return
    try { await api.updateSla(row.code, { first_response_minutes: row.first_response_minutes, resolution_hours: row.resolution_hours, [field]: value }); toast.success(`${row.code} updated`); load() } catch (e) { toast.error(messageOf(e)) }
  }
  const savePriority = async (urgency: string, value: string) => { try { await api.updatePriorityRule(urgency, value); toast.success(`${labelize(urgency)} urgency now maps to ${value}`); load() } catch (e) { toast.error(messageOf(e)) } }
  return <div className="config-layout">
    <Panel title="SLA policies" subtitle="Applied when a complaint is analyzed"><div className="table-scroll"><table className="data-table dense"><thead><tr><th>Policy</th><th>Customer</th><th>Priority</th><th>First response (min)</th><th>Resolution (h)</th></tr></thead><tbody>{sla.map((s) => <tr key={s.code}><td><b>{s.code}</b></td><td>{s.customer_type ? labelize(s.customer_type) : 'All'}</td><td>{s.priority}</td><td><input className="tiny" type="number" min={1} defaultValue={s.first_response_minutes} onBlur={(e) => saveSla(s, 'first_response_minutes', Number(e.target.value))} /></td><td><input className="tiny" type="number" min={1} defaultValue={s.resolution_hours} onBlur={(e) => saveSla(s, 'resolution_hours', Number(e.target.value))} /></td></tr>)}</tbody></table></div></Panel>
    <Panel title="Priority logic" subtitle="Urgency → priority (a matched rule can only raise it)"><div className="table-scroll"><table className="data-table dense"><thead><tr><th>Urgency</th><th>Priority</th></tr></thead><tbody>{priority.map((p) => <tr key={p.urgency}><td>{labelize(p.urgency)}</td><td><select value={p.priority} onChange={(e) => savePriority(p.urgency, e.target.value)}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select></td></tr>)}</tbody></table></div></Panel>
  </div>
}

function UserSettings() {
  const me = useAppStore((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ email: '', full_name: '', password: '', role: 'agent', customer_type: 'standard' })
  const load = useCallback(() => { api.users().then(setUsers).catch((e) => toast.error(messageOf(e))) }, [])
  useEffect(() => { load() }, [load])
  const create = async (e: FormEvent) => { e.preventDefault(); try { await api.createUser(form); toast.success(`${form.full_name} added`); setForm({ ...form, email: '', full_name: '', password: '' }); load() } catch (err) { toast.error(messageOf(err)) } }
  const toggle = async (user: User) => { try { await api.setUserActive(user.id, !user.is_active); load() } catch (e) { toast.error(messageOf(e)) } }
  return <div className="config-layout">
    <Panel title={`Users (${users.length})`} subtitle="Role-based access"><div className="table-scroll"><table className="data-table dense"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th></tr></thead><tbody>{users.map((u) => <tr key={u.id} className={u.is_active ? '' : 'inactive'}><td><b>{u.full_name}</b></td><td className="muted">{u.email}</td><td>{labelize(u.role)}</td><td><input type="checkbox" checked={u.is_active} disabled={u.id === me?.id} onChange={() => toggle(u)} /></td></tr>)}</tbody></table></div></Panel>
    <Panel title="Add a user" subtitle="Staff or customer account"><form className="inline-form" onSubmit={create}><Field label="Full name" full><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field><Field label="Email" full><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Password" full note="At least 8 characters"><input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Field label="Role"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['customer', 'agent', 'reviewer', 'manager', 'administrator'].map((r) => <option key={r} value={r}>{labelize(r)}</option>)}</select></Field>{form.role === 'customer' && <Field label="Customer type"><select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>{['standard', 'vip', 'wholesale', 'enterprise'].map((t) => <option key={t} value={t}>{labelize(t)}</option>)}</select></Field>}<button className="button primary full"><Plus /> Add user</button></form></Panel>
  </div>
}

function ComplaintTable({ rows, compact, loading, customer }: { rows: Complaint[]; compact?: boolean; loading?: boolean; customer?: boolean }) {
  if (loading) return <Skeleton />
  if (!rows.length) return <EmptyState icon={Inbox} title="No complaints found" description="Nothing matches these filters yet." />
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Complaint</th><th>Status</th>{customer ? <><th>Department</th><th>Latest update</th></> : <><th>Category</th><th>Priority</th>{!compact && <th>Validation</th>}</>}<th>Submitted</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link to={`/complaints/${row.id}`}><b>{row.complaint_code}</b><span>{(!customer && row.translated_title) ? row.translated_title : row.title}</span></Link></td><td><StatusBadge status={row.status} />{row.sla_risk && <span className="sla-dot" title="SLA at risk"><Clock3 /></span>}</td>{customer ? <><td>{row.department || <span className="muted">Pending</span>}</td><td className="muted">{row.latest_update}</td></> : <><td>{row.python?.issue_category || <span className="muted">Unanalyzed</span>}</td><td><Priority value={row.python?.priority} /></td>{!compact && <td>{row.verification_score != null ? <Verification score={row.verification_score} /> : row.pending_review ? <span className="muted">Needs review</span> : <span className="muted">{row.python ? 'Python only' : 'Pending'}</span>}</td>}</>}<td className="muted">{date(row.created_at)}</td><td><Link className="row-arrow" to={`/complaints/${row.id}`}><ArrowRight /></Link></td></tr>)}</tbody></table></div>
}

function BriefTable({ rows, empty }: { rows: BriefComplaint[]; empty: string }) {
  if (!rows.length) return <EmptyState icon={Inbox} title="Nothing here" description={empty} />
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Complaint</th><th>Category</th><th>Priority</th><th>Sentiment</th><th>Validation</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link to={`/complaints/${row.id}`}><b>{row.complaint_code}</b><span>{row.translated_title || row.genai_recommendation || row.title}</span></Link></td><td>{row.category || <span className="muted">Unanalyzed</span>}</td><td><Priority value={row.priority} /></td><td>{row.sentiment ? labelize(row.sentiment) : <span className="muted">—</span>}</td><td>{row.verification_score != null ? <Verification score={row.verification_score} /> : <span className="muted">{labelize(row.validation_status || 'pending')}</span>}</td><td><Link className="row-arrow" to={`/complaints/${row.id}`}><ArrowRight /></Link></td></tr>)}</tbody></table></div>
}

function Comparison({ complaint }: { complaint: Complaint }) {
  const fields = complaint.comparison?.fields || {}
  if (!Object.keys(fields).length) return <div className="card"><EmptyState icon={BrainCircuit} title="No comparison available" description={complaint.comparison?.explanation || 'Run a GenAI analysis to compare the two pipelines field by field.'} /></div>
  return <div className="card comparison-card"><div className="comparison-head"><div><Bot />GenAI output</div><span>Field-by-field verification · {labelize(complaint.comparison?.status || '')}</span><div><ShieldCheck />Python ground truth</div></div>{Object.entries(fields).map(([field, item]) => <div className={`comparison-row ${item.match ? 'match' : 'mismatch'}`} key={field}><span>{text(item.genai)}</span><div><b>{labelize(field)}</b><i>{item.match ? <><Check /> Match</> : <><X /> Mismatch</>}</i></div><span>{text(item.python)}</span></div>)}{complaint.comparison?.explanation && <p className="comparison-note">{complaint.comparison.explanation}</p>}</div>
}

function Donut({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data.length) return <p className="muted">No data yet.</p>
  return <div className="donut-layout"><ResponsiveContainer width={165} height={165}><PieChart><Pie data={data} dataKey="value" innerRadius={52} outerRadius={73} paddingAngle={3}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="legend">{data.map((item, i) => <span key={item.name}><i style={{ background: COLORS[i % COLORS.length] }} />{item.name}<b>{item.value}</b></span>)}</div></div>
}

function SentimentDotPlot({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data.length) return <p className="muted">No data yet.</p>
  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const xMax = maxVal <= 4 ? 4 : maxVal + 1
  const ticks = Array.from({ length: xMax + 1 }, (_, i) => i)

  return (
    <div className="donut-layout dotplot-container">
      <div className="dotplot-graph" role="img" aria-label="Sentiment dot plot">
        {data.map((item, i) => {
          const color = COLORS[i % COLORS.length]
          const pct = Math.min(100, Math.max(0, (item.value / xMax) * 100))
          return (
            <div key={item.name} className="dotplot-row" title={`${item.name}: ${item.value} complaint${item.value !== 1 ? 's' : ''}`}>
              <span className="dotplot-label" title={item.name}>{item.name}</span>
              <div className="dotplot-track-wrap">
                <div className="dotplot-track" />
                <div
                  className="dotplot-marker"
                  style={{
                    left: `${pct}%`,
                    backgroundColor: color,
                    borderColor: '#FFFFFF',
                    boxShadow: `0 0 10px ${color}88`,
                  }}
                >
                  <span className="dotplot-badge">{item.value}</span>
                </div>
              </div>
            </div>
          )
        })}
        <div className="dotplot-axis">
          <span className="dotplot-axis-label">0</span>
          {ticks.slice(1).map((t) => (
            <span key={t} className="dotplot-axis-tick" style={{ left: `${(t / xMax) * 100}%` }}>{t}</span>
          ))}
        </div>
      </div>
      <p className="chart-axis-caption">Cleveland dot plot · horizontal count scale</p>
      <div className="legend">
        {data.map((item, i) => (
          <span key={item.name}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            {item.name}
            <b>{item.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function UrgencyScatterPlot({ data }: { data: Array<{ name: string; value: number }> }) {
  if (!data.length) return <p className="muted">No data yet.</p>
  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const yMax = maxVal <= 4 ? 5 : maxVal + 1
  const scatterPoints = data.map((d) => ({
    x: d.name,
    y: d.value,
    name: d.name,
    value: d.value,
  }))

  return (
    <div className="donut-layout scatter-container">
      <ResponsiveContainer width="100%" height={155}>
        <ScatterChart margin={{ top: 18, right: 18, bottom: 22, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.15)" />
          <XAxis
            dataKey="x"
            type="category"
            name="Urgency Tier"
            tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(128, 128, 128, 0.25)' }}
            label={{ value: 'Urgency Tier', position: 'insideBottom', offset: -14, fontSize: 10, fill: 'var(--text-muted)' }}
          />
          <YAxis
            dataKey="y"
            type="number"
            name="Complaints"
            allowDecimals={false}
            domain={[0, yMax]}
            tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(128, 128, 128, 0.25)' }}
            label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 18, fontSize: 10, fill: 'var(--text-muted)' }}
          />
          <ZAxis range={[140, 140]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: 'rgba(128, 128, 128, 0.3)' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload
                return (
                  <div className="chart-tooltip">
                    <b>{item.name} Urgency</b>
                    <span>{item.value} complaint{item.value !== 1 ? 's' : ''}</span>
                    <small>Point plotted: (Tier: {item.name}, Count: {item.value})</small>
                  </div>
                )
              }
              return null
            }}
          />
          <Scatter data={scatterPoints}>
            {scatterPoints.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(255, 255, 255, 0.7)" strokeWidth={1.5} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="chart-axis-caption">Categorical scatter plot · real complaint points</p>
      <div className="legend">
        {data.map((item, i) => (
          <span key={item.name}>
            <i style={{ background: COLORS[i % COLORS.length] }} />
            {item.name}
            <b>{item.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function Brand({ light, collapsed }: { light?: boolean; collapsed?: boolean }) {
  return (
    <div className={`brand ${light ? 'brand-light' : ''} ${collapsed ? 'brand-collapsed' : ''}`}>
      <div className="brand-mark">
        <img src="/logo.png" alt="SupportNova" className="brand-logo-img" />
      </div>
      {!collapsed && (
        <div className="brand-text">
          <span>SupportNova</span>
          <small>ResponseX AI</small>
        </div>
      )}
    </div>
  )
}
function Verification({ score }: { score: number }) { return <span className={`verification ${score >= 80 ? 'good' : score >= 60 ? 'partial' : 'bad'}`}><ShieldCheck /> {Math.round(score)}% verified</span> }
function Data({ label, value, badge }: { label: string; value?: string; badge?: boolean }) { return <div className="data-point"><span>{label}</span><b className={badge ? `value-badge ${(value || '').toLowerCase()}` : ''}>{value || '—'}</b></div> }
function FormSection({ icon: Icon, title, description, children }: { icon: typeof Inbox; title: string; description: string; children: ReactNode }) { return <section className="form-section"><header><div><Icon /></div><span><h2>{title}</h2><p>{description}</p></span></header><div className="form-grid">{children}</div></section> }
function List({ title, items, icon: Icon = CheckCircle2 }: { title: string; items: string[]; icon?: typeof Inbox }) { if (!items.length) return null; return <div className="list-block"><h4>{title}</h4>{items.map((item, i) => <p key={i}><Icon />{item}</p>)}</div> }
function genaiNote(complaint: Complaint): string | undefined {
  const meta = complaint.genai_meta
  if (!meta) return complaint.checks?.genai_skipped_reason || 'GenAI analysis has not run for this complaint yet. The Python ground truth is authoritative.'
  if (meta.available === false) return `GenAI analysis is unavailable${meta.provider && meta.provider !== 'unconfigured' ? ` (tried: ${meta.provider.split(',').join(', ')})` : ' — no provider key is configured'}. ${meta.error || 'No structured output was returned.'} The Python ground truth is authoritative.`
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
function AnalysisEmpty({ onAnalyze }: { onAnalyze?: () => void }) { return <div className="analysis-empty"><div><BrainCircuit /></div><h3>Analysis is waiting</h3><p>Run both intelligence pipelines to classify, route, and validate this complaint.</p>{onAnalyze && <button className="button primary" onClick={onAnalyze}><Sparkles /> Analyze now</button>}</div> }
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) { return <div className="modal-backdrop" onMouseDown={close}><section className="modal card" onMouseDown={(e) => e.stopPropagation()}><header><h2>{title}</h2><button onClick={close}><X /></button></header>{children}</section></div> }
function Avatar({ name }: { name: string }) { return <div className="avatar">{name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div> }

function navigationFor(role: Role | null) {
  type NavItem = { to: string; label: string; icon: typeof Inbox; end?: boolean }
  const nav: NavItem[] = [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }]
  if (role === 'customer') {
    nav.push(
      { to: '/products', label: 'Products', icon: Package },
      { to: '/orders', label: 'Order History', icon: History },
      { to: '/complaints', label: 'My complaints', icon: Inbox },
    )
    return nav
  }
  nav.push({ to: '/complaints', label: 'Complaints', icon: Inbox })
  if (role && REVIEWER_ROLES.includes(role)) nav.push({ to: '/review', label: 'Review queue', icon: UserRoundCheck })
  nav.push({ to: '/knowledge', label: 'Knowledge base', icon: BookOpen })
  if (role === 'manager' || role === 'administrator') nav.push({ to: '/reports', label: 'Reports', icon: BarChart3 }, { to: '/evaluation', label: 'Evaluation', icon: FlaskConical })
  if (role === 'administrator') nav.push({ to: '/settings', label: 'Settings', icon: Settings2 })
  return nav
}
function deriveMetrics(rows: Complaint[]): Metrics {
  const count = (fn: (c: Complaint) => string | undefined) => rows.reduce<Record<string, number>>((a, c) => { const k = fn(c) || 'Unanalyzed'; a[k] = (a[k] || 0) + 1; return a }, {})
  const compared = rows.filter((c) => Object.keys(c.comparison?.fields || {}).length)
  const verified = compared.filter((c) => c.comparison?.status === 'verified').length
  const scores = compared.map((c) => c.verification_score).filter((s): s is number => s != null)
  return {
    total: rows.length, analyzed: rows.filter((c) => c.python).length, statuses: count((c) => c.status), categories: count((c) => c.python?.issue_category), departments: count((c) => c.python?.department),
    priorities: count((c) => c.python?.priority), sentiments: count((c) => c.genai?.sentiment), escalations: rows.filter((c) => c.status === 'escalated' || c.python?.escalation_required).length,
    sla_risks: rows.filter((c) => c.sla_risk).length, genai_python_mismatches: compared.filter((c) => c.comparison?.status !== 'verified').length, genai_compared: compared.length, verified_matches: verified,
    agreement_rate: compared.length ? Math.round((1000 * verified) / compared.length) / 10 : null, average_verification_score: scores.length ? Math.round((10 * scores.reduce((a, b) => a + b, 0)) / scores.length) / 10 : null,
    manual_review_cases: rows.filter((c) => c.requires_manual_review).length, pending_reviews: rows.filter((c) => c.pending_review).length, repeat_complaints: rows.filter((c) => c.is_repeat).length,
  }
}
function eligibility(py: ComplaintIntelligence): Array<[string, 'yes' | 'no' | 'check']> {
  const state = (value?: boolean | null) => value === true ? 'yes' : value === false ? 'no' : 'check'
  return [['Refund', state(py.refund_eligible)], ['Replacement', state(py.replacement_eligible)], ['Compensation', py.compensation_permitted ? 'yes' : 'no']]
}
function secondaryText(items?: Array<string | { issue_category?: string; subcategory?: string }>) {
  return (items || []).map((s) => typeof s === 'string' ? s : [s.issue_category, s.subcategory].filter(Boolean).join(' / ')).join(', ')
}
function slaProgress(c: Complaint) {
  if (!c.sla_resolution_due) return 0
  const start = new Date(c.created_at).getTime(), due = new Date(c.sla_resolution_due).getTime()
  if (['resolved', 'closed'].includes(c.status)) return 100
  return Math.max(2, Math.min(100, Math.round((100 * (Date.now() - start)) / Math.max(1, due - start))))
}
function summarizeDetails(details: Record<string, unknown>) {
  const keys = ['from', 'to', 'verification_status', 'score', 'rule_code', 'genai_provider', 'prompt_version', 'comments', 'agent', 'filename']
  const parts = keys.filter((k) => details?.[k] != null && details[k] !== '').map((k) => `${labelize(k)}: ${text(details[k])}`)
  const reasons = details?.review_reasons as string[] | undefined
  if (reasons?.length) parts.push(`Review: ${reasons.join(', ')}`)
  return parts.length ? <em>{parts.join(' · ')}</em> : null
}
const shorten = (value?: string, max = 220) => !value ? '' : value.length > max ? `${value.slice(0, max)}… (full error in History)` : value
const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean)
const splitLines = (value: string) => value.split('\n').map((s) => s.trim()).filter(Boolean)
const text = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : value == null || value === '' ? '—' : Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)
const greeting = () => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
