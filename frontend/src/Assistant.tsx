import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, Bot, ExternalLink, MessageCircle, RefreshCw, Send, ShieldAlert, Sparkles, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import type { AssistantReply } from './types'
import { useAppStore } from './store'

interface ChatEntry extends Partial<AssistantReply> {
  role: 'user' | 'assistant'
  content: string
}

const SOURCE_LABEL: Record<string, string> = {
  genai: 'GenAI, grounded in policy',
  knowledge_base: 'From approved policy',
  system: 'From SupportNova data',
}

/** Floating Nova assistant. Knows which complaint page is open so staff can ask about "this case". */
export default function Assistant() {
  const user = useAppStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const complaintId = Number(location.pathname.match(/^\/complaints\/(\d+)/)?.[1]) || undefined

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [entries, busy])
  useEffect(() => {
    if (open && entries.length === 0) send('hello', true)
    // Greeting only once per open conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const send = async (text: string, silent = false) => {
    const message = text.trim()
    if (!message || busy) return
    if (!silent) setEntries((e) => [...e, { role: 'user', content: message }])
    setInput('')
    setBusy(true)
    try {
      const reply = await api.assistantChat(message, sessionId, complaintId)
      setSessionId(reply.session_id)
      setEntries((e) => [...e, { role: 'assistant', content: reply.reply, ...reply }])
    } catch (error) {
      setEntries((e) => [...e, { role: 'assistant', content: error instanceof Error ? error.message : 'Something went wrong.', intent: 'error' }])
    } finally {
      setBusy(false)
    }
  }

  const act = (action: NonNullable<AssistantReply['actions']>[number]) => {
    if (action.type === 'suggest') return send(action.label)
    if (action.type === 'open_complaint') { navigate('/complaints/new', { state: { prefill: action.prefill || {} } }); setOpen(false) }
    if (action.type === 'link' && action.to) { navigate(action.to); setOpen(false) }
    if (action.type === 'use_draft' && action.complaint_id) {
      navigate(`/complaints/${action.complaint_id}`, { state: { draft: action.text, tab: 'conversation' } })
      setOpen(false)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); send(input) }
  const reset = () => { setEntries([]); setSessionId(null); send('hello', true) }

  if (!user) return null
  return <>
    <button className={`assistant-launcher ${open ? 'hidden' : ''}`} onClick={() => setOpen(true)} aria-label="Open Nova assistant">
      <MessageCircle /><span>Ask Nova</span>
    </button>
    {open && <section className="assistant-panel card" role="dialog" aria-label="Nova assistant">
      <header>
        <div className="assistant-avatar"><Sparkles /></div>
        <div><b>Nova</b><small>{complaintId ? 'Context: this complaint' : 'Support assistant · grounded in policy'}</small></div>
        <button title="New conversation" onClick={reset}><RefreshCw /></button>
        <button title="Close" onClick={() => setOpen(false)}><X /></button>
      </header>
      <div className="assistant-messages" ref={listRef}>
        {entries.map((entry, i) => <div key={i} className={`chat-entry ${entry.role}`}>
          {entry.role === 'assistant' && <div className="chat-icon">{entry.intent === 'blocked' ? <ShieldAlert /> : <Bot />}</div>}
          <div className="chat-bubble">
            <p>{entry.content}</p>
            {!!entry.complaints?.length && <div className="chat-complaints">{entry.complaints.map((c) =>
              <button key={c.id} onClick={() => { navigate(`/complaints/${c.id}`); setOpen(false) }}>
                <b>{c.complaint_code}</b><span>{c.title}</span><small>{c.status.replace(/_/g, ' ')}{c.department ? ` · ${c.department}` : ''}{c.similarity ? ` · ${c.similarity}% similar` : ''}{c.sla_risk ? ' · SLA risk' : ''}</small>
              </button>)}</div>}
            {!!entry.citations?.length && <div className="chat-citations"><BookOpen />{entry.citations.map((c) => <span key={c.document_code} title={`${c.title} · version ${c.version} · ${c.status}`}>{c.document_code} v{c.version}</span>)}</div>}
            {!!entry.flags?.length && entry.intent !== 'blocked' && <p className="chat-warning"><ShieldAlert /> Check before sending: {entry.flags.map((f) => f.replace(/_/g, ' ')).join(', ')}</p>}
            {entry.role === 'assistant' && entry.source && entry.intent !== 'greeting' && entry.intent !== 'help' && <small className="chat-source">{SOURCE_LABEL[entry.source] || entry.source}</small>}
            {!!entry.actions?.length && <div className="chat-actions">{entry.actions.map((a, j) =>
              <button key={j} className={a.type === 'suggest' ? 'chip-button' : 'button secondary compact'} onClick={() => act(a)}>
                {a.type !== 'suggest' && <ExternalLink />}{a.label}
              </button>)}</div>}
          </div>
        </div>)}
        {busy && <div className="chat-entry assistant"><div className="chat-icon"><Bot /></div><div className="chat-bubble typing"><i /><i /><i /></div></div>}
      </div>
      <form className="assistant-input" onSubmit={submit}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={user.role === 'customer' ? 'Ask about a policy or your complaint…' : complaintId ? 'Ask about this case…' : 'Ask Nova…'} maxLength={2000} aria-label="Message" />
        <button className="button primary compact" disabled={busy || !input.trim()} aria-label="Send"><Send /></button>
      </form>
      <p className="assistant-note">Nova answers from approved NimbusCarta policies and never approves refunds or compensation itself.</p>
    </section>}
  </>
}
