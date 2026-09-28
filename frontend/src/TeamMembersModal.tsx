import { useState } from 'react'
import { X, Award, Star, Code2, Users, BrainCircuit, ExternalLink, AtSign, Mail } from 'lucide-react'
import './team-members.css'

interface Member {
  id: string; name: string; role: string; badge: string; initial: string
  color: string; photo?: string; type: 'mentor' | 'member'
  skills?: string[]; contributions?: string[]
  github?: string; linkedin?: string; email?: string
}

const MENTORS: Member[] = [
  { id:'m1', name:'Sir Sheikh Rohan', role:'Mentor', badge:'Mentor', initial:'SR', color:'#00D6D6', type:'mentor'},
  { id:'m2', name:'Miss Noor-ul-Ain', role:'Mentor', badge:'Mentor', initial:'NA', color:'#9b8cff', type:'mentor'},
  { id:'m3', name:'Sir Talha Bin Ghous', role:'Mentor', badge:'Mentor', initial:'TG', color:'#f59f47', type:'mentor'}]

const TEAM: Member[] = [
  { id:'t1', name:'Anousha Zameer', role:'Team Lead · Full Stack Developer', badge:'Team Lead', initial:'AZ', color:'#00D6D6', type:'member', photo:'/team/anousha.png',
    skills:['React','TypeScript','System Architecture','AI Integration','Project Management'],
    contributions:['Led overall project architecture, planning, and sprint management','Built the core SupportNova application shell, routing, and auth system','Implemented the AI-powered complaint intelligence and GenAI integration','Designed the premium SupportNova design system and glassmorphism UI','Developed role-based dashboards for all 5 roles end-to-end'],
    github:'https://github.com', linkedin:'https://linkedin.com', email:'anoushazameer@gmail.com' },
  { id:'t2', name:'Syed Hamza Kamal', role:'Backend Developer · API Engineer', badge:'Backend Lead', initial:'HK', color:'#26b6a0', type:'member', photo:'/team/hamza.png',
    skills:['Python','FastAPI','PostgreSQL','JWT Auth','REST APIs'],
    contributions:['Designed and built the FastAPI backend with role-based access control','Implemented JWT authentication and session management','Built the complaint lifecycle API — creation, assignment, escalation, resolution','Developed SLA policy engine and priority rule evaluation logic','Integrated GenAI report generation and analysis endpoints'],
    github:'https://github.com', linkedin:'https://linkedin.com', email:'hamza@team.example' },
  { id:'t3', name:'Umme Hani', role:'Frontend Developer · UI Specialist', badge:'Frontend Dev', initial:'UH', color:'#9b8cff', type:'member', photo:'/team/umme.png',
    skills:['React','CSS/SCSS','Responsive Design','Data Visualisation','Accessibility'],
    contributions:['Implemented agent and customer-facing dashboards and complaint flows','Built interactive charts and analytics visualisations using Recharts','Crafted responsive layouts and mobile-first UI patterns','Contributed to the product catalogue and order management UI','Ensured WCAG accessibility compliance across all components'],
    github:'https://github.com', linkedin:'https://linkedin.com', email:'umme@team.example' },
  { id:'t4', name:'Rubab', role:'QA Engineer · Documentation', badge:'QA & Docs', initial:'RB', color:'#f59f47', type:'member', photo:'/team/rubab.png',
    skills:['Testing','Documentation','UI Testing','User Stories','Quality Assurance'],
    contributions:['Conducted systematic QA testing across all 5 user role flows','Authored comprehensive project documentation and user guides','Created test cases covering edge cases for escalation and SLA policies','Validated demo profile flows and cross-role permission boundaries','Maintained the project wiki and sprint retrospective notes'],
    github:'https://github.com', linkedin:'https://linkedin.com', email:'rubab@team.example' },
]

function DetailDrawer({ member, onClose }: { member: Member; onClose: () => void }) {
  return (
    <div className="tm-drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tm-drawer">
        <button type="button" className="tm-drawer-close" onClick={onClose}><X size={16} /></button>
        <div className="tm-drawer-header" style={{ '--tm-accent': member.color } as React.CSSProperties}>
          {member.photo
            ? <div className="tm-drawer-photo-wrap"><img src={member.photo} alt={member.name} className="tm-drawer-photo" /></div>
            : <div className="tm-drawer-initial-wrap" style={{ borderColor: member.color, color: member.color }}>{member.initial}</div>
          }
          <div className="tm-drawer-info">
            <h3>{member.name}</h3>
            <p>{member.role}</p>
            <span className="tm-card-badge" style={{ '--tm-accent': member.color } as React.CSSProperties}>{member.badge}</span>
          </div>
        </div>
        {member.skills && member.skills.length > 0 && (
          <div className="tm-drawer-section">
            <div className="tm-drawer-section-label"><Code2 size={12}/><span>Skills &amp; Technologies</span></div>
            <div className="tm-skill-chips-row">{member.skills.map(s => <span key={s} className="tm-skill-chip">{s}</span>)}</div>
          </div>
        )}
        {member.contributions && member.contributions.length > 0 && (
          <div className="tm-drawer-section">
            <div className="tm-drawer-section-label"><Star size={12}/><span>Key Contributions</span></div>
            <ul className="tm-contributions-list">{member.contributions.map((c,i) => (
              <li key={i} className="tm-contribution-item">
                <span className="tm-contrib-dot" style={{ background: member.color }}/>
                <span>{c}</span>
              </li>
            ))}</ul>
          </div>
        )}
        {member.type === 'member' && (
          <div className="tm-drawer-section">
            <div className="tm-drawer-section-label"><Users size={12}/><span>Connect</span></div>
            <div className="tm-contact-row">
              {member.github && <a href={member.github} target="_blank" rel="noopener noreferrer" className="tm-contact-link"><ExternalLink size={14}/><span>GitHub</span></a>}
              {member.linkedin && <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className="tm-contact-link"><AtSign size={14}/><span>LinkedIn</span></a>}
              {member.email && <a href={`mailto:${member.email}`} className="tm-contact-link"><Mail size={14}/><span>Email</span></a>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TeamCard({ member, onClick }: { member: Member; onClick: () => void }) {
  return (
    <button type="button" className="tm-photo-card" style={{ '--tm-accent': member.color } as React.CSSProperties} onClick={onClick} aria-label={`View ${member.name}`}>
      <div className="tm-photo-card-img-wrap">
        {member.photo
          ? <img src={member.photo} alt={member.name} className="tm-photo-card-img" />
          : <div className="tm-photo-card-initial"><span>{member.initial}</span></div>
        }
        <div className="tm-photo-card-gradient"/>
      </div>
      <div className="tm-photo-card-side-label"><span>{member.badge}</span></div>
      <div className="tm-photo-card-bottom">
        <div className="tm-photo-card-name">{member.name}</div>
        <div className="tm-photo-card-role">{member.role}</div>
      </div>
      <div className="tm-photo-card-border"/>
    </button>
  )
}

function MentorPill({ mentor, onClick }: { mentor: Member; onClick: () => void }) {
  return (
    <button type="button" className="tm-mentor-pill" style={{ '--tm-accent': mentor.color } as React.CSSProperties} onClick={onClick}>
      <div className="tm-mentor-pill-avatar">
        <span>{mentor.initial}</span>
        <div className="tm-mentor-crown"><Award size={9}/></div>
      </div>
      <div className="tm-mentor-pill-info">
        <div className="tm-mentor-pill-name">{mentor.name}</div>
        <div className="tm-mentor-pill-role">{mentor.role}</div>
      </div>
      <span className="tm-mentor-pill-badge">{mentor.badge}</span>
    </button>
  )
}

interface TeamMembersModalProps { isOpen: boolean; onClose: () => void }

export default function TeamMembersModal({ isOpen, onClose }: TeamMembersModalProps) {
  const [selected, setSelected] = useState<Member | null>(null)
  if (!isOpen) return null

  return (
    <div className="tm-backdrop" role="dialog" aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      tabIndex={-1}>
      <div className="tm-container tm-container--photo">

        {/* ── LOGO BAR ── */}
        <div className="tm-logo-bar">
          <div className="tm-logo-slot tm-logo-slot--left">
            <img src="/logo.png" alt="SupportNova" className="tm-logo-img tm-logo-nova" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
            <span className="tm-logo-label">SupportNova</span>
          </div>
          <div className="tm-logo-slot tm-logo-slot--center">
            <img src="/logos/techwiz.png" alt="TechWiz 7" className="tm-logo-img tm-logo-techwiz" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
            <span className="tm-logo-label-center">THE WORLD TECH CHAMPIONSHIP</span>
          </div>
          <div className="tm-logo-slot tm-logo-slot--right">
            <img src="/logos/aptech.png" alt="Aptech Learning" className="tm-logo-img tm-logo-aptech" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
          </div>
        </div>

        {/* ── HEADER ── */}
        <div className="tm-header">
          <div className="tm-header-left">
            <div className="tm-header-icon-wrap"><Users size={20}/></div>
            <div>
              <h2 className="tm-title">Meet the Team</h2>
              <p className="tm-subtitle">SupportNova · TechWiz 7 · Project Credits</p>
            </div>
          </div>
          <button type="button" className="tm-close-btn" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </div>

        {/* ── BODY ── */}
        <div className="tm-photo-body">

          {/* Mentors */}
          <div className="tm-mentors-strip">
            <div className="tm-mentors-strip-label"><Award size={13}/><span>Our Mentors</span></div>
            <div className="tm-mentor-pills-row">
              {MENTORS.map(m => <MentorPill key={m.id} mentor={m} onClick={() => setSelected(m)} />)}
            </div>
          </div>

          {/* Team Cards */}
          <div className="tm-team-section">
            <div className="tm-team-section-label"><BrainCircuit size={13}/><span>Our Development Team</span></div>
            <div className="tm-photo-cards-row">
              {TEAM.map(m => <TeamCard key={m.id} member={m} onClick={() => setSelected(m)} />)}
            </div>
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="tm-footer">
          <span className="tm-footer-credit">Built with ❤️ by Team SupportNova · TechWiz 7 · Aptech Learning</span>
          <span className="tm-footer-right"><Star size={11}/><span>Generative AI · Customer Intelligence</span></span>
        </div>

      </div>
      {selected && <DetailDrawer member={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
