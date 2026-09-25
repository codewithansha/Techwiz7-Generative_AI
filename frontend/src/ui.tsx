/** Shared UI primitives and formatters used across SupportNova pages. */
import type { ReactNode } from 'react'
import { CheckCircle2, Inbox } from 'lucide-react'
import { ApiError } from './api'

export const STATUS_LABEL: Record<string, string> = {
  new: 'New', analyzed: 'Analyzed', assigned: 'Assigned', in_progress: 'In progress',
  awaiting_customer: 'Awaiting customer', escalated: 'Escalated', resolved: 'Resolved',
  closed: 'Closed', reopened: 'Reopened',
}

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) { return <div className={`page ${narrow ? 'narrow' : ''}`}>{children}</div> }
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <header className="page-header"><div><span className="eyebrow purple">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header> }
export function Panel({ title, subtitle, children, action, className = '' }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) { return <section className={`panel card ${className}`}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header><div className="panel-content">{children}</div></section> }
export function Metric({ label, value, icon: Icon, tone, note }: { label: string; value: string | number; icon: typeof Inbox; tone: string; note: string }) { return <article className="metric-card card"><div className={`metric-icon ${tone}`}><Icon /></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article> }
export function StatusBadge({ status }: { status: string }) { return <span className={`status-badge ${status}`}>{status === 'active' && <CheckCircle2 />}{STATUS_LABEL[status] || labelize(status)}</span> }
export function Priority({ value }: { value?: string }) { return value ? <span className={`priority ${(value || '').toLowerCase()}`}><i />{value}</span> : <span className="muted">—</span> }
export function Field({ label, children, full, note }: { label: string; children: ReactNode; full?: boolean; note?: string }) { return <label className={`field ${full ? 'full' : ''}`}>{label}{children}{note && <small>{note}</small>}</label> }
export function EmptyState({ icon: Icon, title, description }: { icon: typeof Inbox; title: string; description: string }) { return <div className="empty-state"><div><Icon /></div><h3>{title}</h3><p>{description}</p></div> }
export function Skeleton() { return <div className="skeleton-wrap">{[1, 2, 3, 4].map((i) => <i className="skeleton" key={i} />)}</div> }
export const labelize = (value: string) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase())
export const date = (value: string) => new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
export const dateTime = (value: string) => new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
export const messageOf = (error: unknown) => error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong'
export const entries = (data: Record<string, number>) => Object.entries(data).map(([name, value]) => ({ name: labelize(name), value }))
