import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X, Star, Award, Code2, Database, FileText, Shield, Sparkles, Sun, Moon } from 'lucide-react'
import { useAppStore } from './store'
import './team-page.css'

/* ─── Mentors ───────────────────────────────────────────────────────────── */
const MENTORS = [
  {
    id: 'sr',
    initials: 'SR',
    name: 'Sir Sheikh Rohan',
    title: 'Faculty Mentor',
    role: 'Mentor',
    badge: 'Advisor',
    color: '#00D6D6',
  },
  {
    id: 'na',
    initials: 'NA',
    name: 'Miss Noor-ul-Ain',
    title: 'Faculty Mentor',
    role: 'Mentor',
    badge: 'Advisor',
    color: '#9b8cff',
  },
  {
    id: 'tg',
    initials: 'TG',
    name: 'Sir Talha Bin Ghous',
    title: 'Faculty Mentor',
    role: 'Mentor',
    badge: 'Advisor',
    color: '#f59f47',
  },
]

/* ─── Team Members ─────────────────────────────────────────────────────── */
interface TeamMember {
  id: string
  name: string
  role: string
  responsibility: string
  photo: string
  color: string
  tilt: number
  icon: string
  tagPos: 'tr' | 'bl'
  tagSub: string
  tagMain: string
  contributions: string[]
  areas: string[]
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'hamza',
    name: 'Syed Hamza Kamal',
    role: 'Backend Developer · API Engineer',
    responsibility: 'Database & API Architecture',
    photo: '/team/hamza.png',
    color: '#00e5ff',
    tilt: -3.5,
    icon: 'Database',
    tagPos: 'tr',
    tagSub: 'Lead',
    tagMain: 'BACKEND API',
    contributions: [
      'Designed and built the FastAPI backend service with role-based access control',
      'Engineered JWT session management and authentication middleware',
      'Developed complaint lifecycle logic: creation, auto-assignment, and resolution flows',
      'Built SLA monitoring rules and background priority evaluation engine',
      'Maintained PostgreSQL database models and query optimization for high throughput',
    ],
    areas: ['Python', 'FastAPI', 'PostgreSQL', 'JWT Auth', 'REST APIs', 'Data Architecture'],
  },
  {
    id: 'anousha',
    name: 'Anousha Zameer',
    role: 'Team Lead · Full Stack Developer',
    responsibility: 'Full Stack & AI Intelligence',
    photo: '/team/anousha.png',
    color: '#00D6D6',
    tilt: 2.5,
    icon: 'Code2',
    tagPos: 'bl',
    tagSub: 'Full Stack',
    tagMain: 'TEAM LEAD',
    contributions: [
      'Led the end-to-end development lifecycle, sprint planning, and architecture decisions',
      'Built the entire SupportNova frontend application shell and routing architecture',
      'Architected the AI-powered complaint intelligence pipeline and GenAI resolution drafts',
      'Crafted the premium SupportNova design system, glassmorphism UI, and dark/light themes',
      'Developed complete, fully-featured interactive dashboards for all 5 roles',
    ],
    areas: ['React', 'TypeScript', 'System Architecture', 'GenAI Integration', 'UI/UX Design', 'Project Leadership'],
  },
  {
    id: 'umme',
    name: 'Umme Hani',
    role: 'Frontend Developer · UI Specialist',
    responsibility: 'UI Engineering & Accessibility',
    photo: '/team/umme.png',
    color: '#a78bfa',
    tilt: -2,
    icon: 'FileText',
    tagPos: 'tr',
    tagSub: 'Specialist',
    tagMain: 'FRONTEND UI',
    contributions: [
      'Built interactive agent and customer complaint submission flows and dashboards',
      'Implemented dynamic analytics charts and CSAT visualizations with responsive scaling',
      'Designed responsive layout components supporting desktop, tablet, and mobile displays',
      'Contributed to product catalog UI, order linking, and status tracking modules',
      'Ensured WCAG accessibility and theme color compliance across all components',
    ],
    areas: ['React', 'CSS/SCSS', 'Responsive Design', 'Data Visualization', 'WCAG Accessibility'],
  },
  {
    id: 'rubab',
    name: 'Rubab',
    role: 'QA Engineer · Documentation',
    responsibility: 'Quality Assurance & Technical Docs',
    photo: '/team/rubab.png',
    color: '#fbbf24',
    tilt: 3.5,
    icon: 'Shield',
    tagPos: 'bl',
    tagSub: 'Documentation',
    tagMain: 'QA & DOCS',
    contributions: [
      'Conducted end-to-end QA validation across all 5 user role workflows and permission boundaries',
      'Authored the complete system documentation, architecture overview, and competition guides',
      'Created edge-case test suites for SLA escalation triggers and priority scoring',
      'Validated demo credentials, mock complaint lifecycles, and audit trail fidelity',
      'Prepared deliverables and organized presentation materials for evaluation',
    ],
    areas: ['Quality Assurance', 'Technical Writing', 'User Workflows', 'Test Cases', 'Documentation'],
  },
]

const ICON_MAP: Record<string, React.ElementType> = { Code2, Database, FileText, Shield }

/* ─── Detail Modal ────────────────────────────────────────────────────── */
function DetailModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const Icon = ICON_MAP[member.icon] || Code2
  return (
    <div className="tp-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tp-modal" style={{ '--member-color': member.color } as React.CSSProperties}>
        <button className="tp-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>

        <div className="tp-modal-top">
          <div className="tp-modal-photo-wrap">
            <div className="tp-modal-photo-border" />
            <img src={member.photo} alt={member.name} className="tp-modal-photo" />
            <div className="tp-modal-photo-glow" />
          </div>
          <div className="tp-modal-identity">
            <div className="tp-modal-number">
              <Icon size={16} />
            </div>
            <h2 className="tp-modal-name">{member.name}</h2>
            <p className="tp-modal-role">{member.role}</p>
            <span className="tp-modal-resp">{member.responsibility}</span>
          </div>
        </div>

        <div className="tp-modal-divider" />

        <div className="tp-modal-body">
          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              <Star size={13} /> Key Contributions
            </div>
            <ul className="tp-modal-list">
              {member.contributions.map((c, i) => (
                <li key={i} className="tp-modal-list-item">
                  <span className="tp-modal-dot" style={{ background: member.color }} />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tp-modal-section">
            <div className="tp-modal-section-label">
              <Award size={13} /> Areas &amp; Technologies
            </div>
            <div className="tp-modal-chips">
              {member.areas.map((a) => (
                <span key={a} className="tp-modal-chip">{a}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Team Page ──────────────────────────────────────────────────── */
export default function TeamPage() {
  const navigate = useNavigate()
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  return (
    <div className="tp-poster-page" data-theme={theme || 'dark'}>
      {/* ── Background Facets (Exact 3D Geometric Crystal Emerald Backdrop) ── */}
      <div className="tp-facets-bg" aria-hidden="true">
        <svg className="tp-facets-svg" viewBox="0 0 1440 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="facet1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#15803d" stopOpacity="0.22" />
            </linearGradient>
            <linearGradient id="facet2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="facet3" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#14532d" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="facet4" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#052e16" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* Faceted polygon shards */}
          <polygon points="0,0 380,0 240,420 0,320" fill="url(#facet1)" />
          <polygon points="380,0 780,0 620,380 240,420" fill="url(#facet3)" />
          <polygon points="780,0 1200,0 1020,440 620,380" fill="url(#facet1)" />
          <polygon points="1200,0 1440,0 1440,360 1020,440" fill="url(#facet2)" />

          <polygon points="0,320 240,420 180,900 0,900" fill="url(#facet2)" />
          <polygon points="240,420 620,380 540,900 180,900" fill="url(#facet4)" />
          <polygon points="620,380 1020,440 920,900 540,900" fill="url(#facet3)" />
          <polygon points="1020,440 1440,360 1440,900 920,900" fill="url(#facet2)" />

          {/* Diagonal light rays */}
          <polygon points="120,0 450,0 680,900 350,900" fill="#ffffff" fillOpacity="0.03" />
          <polygon points="980,0 1320,0 1140,900 800,900" fill="#ffffff" fillOpacity="0.02" />
        </svg>
      </div>

      {/* ── TOP HEADER BAR ── */}
      <header className="tp-poster-header">
        {/* Left: Back Button & Exact SupportNova Logo Lockup */}
        <div className="tp-logo-item tp-logo-item--left">
          <button className="tp-back-btn" onClick={() => navigate('/login')} aria-label="Back to login">
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>

          {/* Exact Brand Lockup from User Reference */}
          <div className="tp-brand-lockup">
            <div className="tp-brand-icon-box">
              <img src="/logo.png" alt="SupportNova Logo" className="tp-brand-logo-img" />
            </div>
            <div className="tp-brand-text-col">
              <span className="tp-brand-main-title">SupportNova</span>
              <span className="tp-brand-sub-badge">RESPONSEX AI</span>
            </div>
          </div>
        </div>

        {/* Center: TECHWIZ 7 Logo */}
        <div className="tp-logo-item tp-logo-item--center">
          <img src="/logos/techwiz7.png" alt="Techwiz 7" className="tp-header-techwiz" />
        </div>

        {/* Right: Aptech Logo Badge & Theme Toggle */}
        <div className="tp-logo-item tp-logo-item--right">
          <div className="tp-aptech-badge">
            <img src="/logos/aptechlogo.png" height={50} width={100} alt="Aptech Logo" className="tp-header-aptech" />
          </div>
          <button
            type="button"
            className="tp-theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>
      {/* ── MENTORS SECTION (Strict Single Row) ── */}
      <section className="tp-mentors-section">
        <div className="tp-mentors-header">
          <div className="tp-mentors-line" />
          <div className="tp-mentors-label-badge">
            <Award size={15} />
            <span>FACULTY ADVISORS &amp; MENTORS</span>
          </div>
          <div className="tp-mentors-line" />
        </div>
        <p className="tp-mentors-desc">
          Honoring the guidance, supervision, and mentorship of Aptech Learning Faculty
        </p>

        <div className="tp-mentors-grid">
          {MENTORS.map((mentor) => (
            <div
              key={mentor.id}
              className="tp-mentor-pill-card"
              style={{ '--mentor-accent': mentor.color } as React.CSSProperties}
            >
              <div className="tp-mentor-pill-avatar">
                <span>{mentor.initials}</span>
                <div className="tp-mentor-pill-ring" />
              </div>
              <div className="tp-mentor-pill-info">
                <div className="tp-mentor-pill-name">{mentor.name}</div>
                <div className="tp-mentor-pill-role">{mentor.title}</div>
              </div>
              <div className="tp-mentor-pill-tag">
                <Award size={12} />
                <span>{mentor.badge}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── THE 4 CHAMPIONSHIP POSTER CARDS ── */}
      <main className="tp-poster-stage-wrap">
        {/* ── POSTER SIGNATURE / BOTTOM TYPOGRAPHY ── */}
        <div className="tp-poster-branding">
          <div className="tp-branding-container">
            {/* Elegant Calligraphic Script "Team" with extended diagonal flourish */}
            <div className="tp-script-wrap">
              <span className="tp-script-team">Team</span>
              {/* Signature diagonal flourish line shooting up towards card 2 */}
              <svg className="tp-script-flourish" viewBox="0 0 260 140" fill="none">
                <path
                  d="M 12 110 Q 70 115 130 85 T 255 10"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle cx="255" cy="10" r="3" fill="currentColor" />
              </svg>
            </div>

            {/* Bold 3D Metallic Uppercase Typography */}
            <div className="tp-brand-center">
              <div className="tp-brand-eyebrow">
                <span className="tp-eyebrow-chip">TECHWIZ 7</span>
                <span className="tp-eyebrow-text">ResponseX AI Intelligence</span>
              </div>
              <h1 className="tp-brand-title">SUPPORTNOVA</h1>
              <div className="tp-brand-sub">
                <span className="tp-brand-track">GENERATIVE AI WORLD TRACK</span>
                <span className="tp-brand-dot">•</span>
                <span className="tp-brand-org">APTECH LEARNING</span>
              </div>
            </div>
          </div>
        </div>
        <div className="tp-poster-stage">
          {TEAM_MEMBERS.map((member, idx) => (
            <div
              key={member.id}
              className={`tp-card-col tp-card-col--${idx + 1}`}
              onClick={() => setSelectedMember(member)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedMember(member) }}
              aria-label={`View ${member.name}'s details`}
            >
              {/* Tilted emerald card frame with crisp white outline */}
              <div
                className="tp-card-frame"
                style={{
                  '--card-tilt': `${member.tilt}deg`,
                  '--card-accent': member.color,
                } as React.CSSProperties}
              >
                {/* Emerald gradient inside the placard */}
                <div className="tp-card-bg" />

                {/* Vertical Tag (Top-Right or Bottom-Left) */}
                <div className={`tp-vert-tag tp-vert-tag--${member.tagPos}`}>
                  <span className="tp-vert-sub">{member.tagSub}</span>
                  <span className="tp-vert-main">{member.tagMain}</span>
                </div>

                {/* Person Cutout Portrait */}
                <div className="tp-card-photo-box">
                  <img
                    src={member.photo}
                    alt={member.name}
                    className="tp-card-photo-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/logo.png'
                    }}
                  />
                  {/* Subtle bottom fade matching card gradient */}
                  <div className="tp-card-photo-fade" />
                </div>

                {/* Member Name Plate at Bottom of Card */}
                <div className="tp-card-nameplate">
                  <div className="tp-card-name">{member.name}</div>
                  <div className="tp-card-role-label">{member.role}</div>
                </div>

                {/* Hover CTA Indicator */}
                <div className="tp-card-hover-pill">
                  <Sparkles size={11} />
                  <span>View Details</span>
                </div>
              </div>
            </div>
          ))}
        </div>


      </main>


      {/* ── FOOTER ── */}
      <footer className="tp-poster-footer">
        <p>SupportNova · TechWiz 7 World Championship · Built with pride by Team SupportNova</p>
      </footer>

      {/* ── DETAIL MODAL ── */}
      {selectedMember && (
        <DetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  )
}
