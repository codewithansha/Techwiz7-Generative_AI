import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import './supportnova-login-hero.css'

export default function SupportNovaLoginHero() {
  const heroRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = heroRef.current
    if (!el) return

    let animFrameId: number | null = null
    let mx = 0
    let my = 0
    let tx = 0
    let ty = 0
    const cleanupFns: Array<() => void> = []

    const ctx = gsap.context(() => {
      // 1. Initial States
      gsap.set('.supportnova-login-hero-word > span', { y: '105%' })
      gsap.set('.supportnova-login-hero-letter', { y: 24, opacity: 0 })
      gsap.set('.supportnova-login-hero-subline', { opacity: 0, y: 16 })

      const cards = el.querySelectorAll<HTMLElement>('.supportnova-login-hero-card')
      cards.forEach((card) => {
        const rot = parseFloat(card.dataset.rot || '0')
        card.dataset.restRot = String(rot)
        gsap.set(card, { y: -650, rotation: rot + 25, opacity: 0, scale: 0.7 })
      })

      // 2. Intro Timeline
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })

      intro
        .to(
          '.supportnova-login-hero-word > span',
          { y: '0%', duration: 0.85, stagger: 0.08, ease: 'power3.out' },
          0.15
        )
        .to(
          '.supportnova-login-hero-letter',
          { y: 0, opacity: 1, duration: 0.8, stagger: 0.035, ease: 'back.out(1.6)' },
          0.35
        )
        .to(
          cards,
          {
            y: 0,
            opacity: 1,
            scale: 1,
            rotation: (_i, c) => parseFloat((c as HTMLElement).dataset.restRot || '0'),
            duration: 1.05,
            stagger: { each: 0.07, from: 'center' },
            ease: 'back.out(1.4)',
          },
          0.55
        )
        .to(
          '.supportnova-login-hero-subline',
          { opacity: 1, y: 0, duration: 0.7 },
          1.25
        )

      // 3. Floating Animation for Each Card
      cards.forEach((card, i) => {
        const rot = parseFloat(card.dataset.restRot || '0')
        gsap.to(card, {
          y: `+=${5 + (i % 3) * 3}`,
          rotation: rot + (i % 2 === 0 ? 1.2 : -1.2),
          duration: 3 + (i % 4) * 0.45,
          delay: 1.5 + i * 0.08,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        })
      })

      // 4. Smooth Mouse Parallax
      const onMouseMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect()
        mx = ((e.clientX - r.left) / r.width - 0.5) * 2
        my = ((e.clientY - r.top) / r.height - 0.5) * 2
      }

      const onMouseLeave = () => {
        mx = 0
        my = 0
      }

      el.addEventListener('mousemove', onMouseMove)
      el.addEventListener('mouseleave', onMouseLeave)
      cleanupFns.push(() => {
        el.removeEventListener('mousemove', onMouseMove)
        el.removeEventListener('mouseleave', onMouseLeave)
      })

      const loopParallax = () => {
        tx += (mx - tx) * 0.05
        ty += (my - ty) * 0.05
        cards.forEach((card) => {
          const d = parseFloat(card.dataset.depth || '8')
          card.style.translate = `${tx * d}px ${ty * d * 0.4}px`
        })
        animFrameId = requestAnimationFrame(loopParallax)
      }
      loopParallax()

      // 5. 3D Card Tilt on Hover
      cards.forEach((card) => {
        const onCardMove = (e: MouseEvent) => {
          const r = card.getBoundingClientRect()
          const px = (e.clientX - r.left) / r.width - 0.5
          const py = (e.clientY - r.top) / r.height - 0.5
          gsap.to(card, {
            rotateX: -py * 14,
            rotateY: px * 14,
            scale: 1.07,
            zIndex: 35,
            duration: 0.35,
            ease: 'power2.out',
            transformPerspective: 700,
            overwrite: 'auto',
          })
        }

        const onCardLeave = () => {
          const baseZ = card.dataset.baseZ || ''
          gsap.to(card, {
            rotateX: 0,
            rotateY: 0,
            scale: 1,
            zIndex: baseZ,
            duration: 0.75,
            ease: 'elastic.out(1, 0.6)',
            overwrite: 'auto',
          })
        }

        const onCardClick = () => {
          gsap.fromTo(
            card,
            { scale: 1.12 },
            {
              scale: 1.04,
              duration: 0.15,
              yoyo: true,
              repeat: 1,
              ease: 'power2.inOut',
            }
          )
        }

        card.addEventListener('mousemove', onCardMove)
        card.addEventListener('mouseleave', onCardLeave)
        card.addEventListener('click', onCardClick)

        cleanupFns.push(() => {
          card.removeEventListener('mousemove', onCardMove)
          card.removeEventListener('mouseleave', onCardLeave)
          card.removeEventListener('click', onCardClick)
        })
      })
    }, el)

    return () => {
      ctx.revert()
      if (animFrameId) cancelAnimationFrame(animFrameId)
      cleanupFns.forEach((fn) => fn())
    }
  }, [])

  return (
    <div className="supportnova-login-hero" ref={heroRef} aria-hidden="true">
      {/* Soft atmospheric background glow & subtle organic rings */}
      <div className="supportnova-login-hero-grain" />
      <div className="supportnova-login-hero-glow supportnova-login-hero-glow-1" />
      <div className="supportnova-login-hero-glow supportnova-login-hero-glow-2" />
      <div className="supportnova-login-hero-glow supportnova-login-hero-glow-3" />
      <div className="supportnova-hero-bg-lines" />

      <div className="supportnova-login-hero-inner">
        {/* TOP BRAND BAR */}
        <header className="supportnova-login-hero-header">
          <div className="supportnova-brand-badge-group">
            <div className="supportnova-brand-mark">
              <img src="/logo.png" alt="SupportNova" className="supportnova-brand-logo" />
            </div>
            <div className="supportnova-brand-titles">
              <span className="supportnova-brand-name">
                <span className="supportnova-login-hero-letter">S</span>
                <span className="supportnova-login-hero-letter">u</span>
                <span className="supportnova-login-hero-letter">p</span>
                <span className="supportnova-login-hero-letter">p</span>
                <span className="supportnova-login-hero-letter">o</span>
                <span className="supportnova-login-hero-letter">r</span>
                <span className="supportnova-login-hero-letter">t</span>
                <span className="supportnova-login-hero-letter">N</span>
                <span className="supportnova-login-hero-letter">o</span>
                <span className="supportnova-login-hero-letter">v</span>
                <span className="supportnova-login-hero-letter">a</span>
              </span>
              <span className="supportnova-brand-chip">RESPONSEX AI</span>
            </div>
          </div>

          <div className="supportnova-hero-pill-status">
            <span className="hero-status-dot" />
            <span>ResponseX Intelligence</span>
          </div>
        </header>

        {/* HERO EDITORIAL SHOWCASE */}
        <section className="supportnova-login-hero-showcase">
          <h1 className="supportnova-login-hero-heading">
            <span className="supportnova-login-hero-word">
              <span>Customer support,</span>
            </span>
            <br />
            <span className="supportnova-login-hero-word">
              <span className="headline-accent">validated by design.</span>
            </span>
          </h1>

          <p className="supportnova-login-hero-desc">
            Generative AI drafts every resolution. Independent Python rules verify every decision.
          </p>

          {/* DUAL PIPELINE SHOWCASE CARDS */}
          <div className="supportnova-hero-pipelines">
            <div className="supportnova-pipeline-card">
              <div className="pipeline-card-indicator">
                <span className="pipeline-num">01</span>
              </div>
              <div className="pipeline-card-info">
                <span className="pipeline-eyebrow">Pipeline 01</span>
                <strong className="pipeline-title">GenAI intelligence</strong>
                <span className="pipeline-detail">Contextual resolution drafts</span>
              </div>
            </div>

            <div className="supportnova-pipeline-arrow-wrap">
              <div className="pipeline-arrow-line" />
              <div className="pipeline-arrow-circle">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>

            <div className="supportnova-pipeline-card pipeline-card-verified">
              <div className="pipeline-card-indicator indicator-verified">
                <span className="pipeline-num">02</span>
              </div>
              <div className="pipeline-card-info">
                <span className="pipeline-eyebrow">Pipeline 02</span>
                <strong className="pipeline-title">Ground-truth validation</strong>
                <span className="pipeline-detail">Independent Python rules</span>
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT CARDS FLOATING ARENA */}
        <div className="supportnova-login-hero-stage">
          <div className="supportnova-login-hero-cards-row">
            {/* Card 1: Inbox Feed */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-1"
              data-rot="-7"
              data-depth="12"
              data-base-z="1"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>INBOX</span>
                  <span>● LIVE</span>
                </div>
                <div className="supportnova-login-hero-mini-title">All conversations</div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">JM</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Where is my order?</b>Order #NC-000021 status
                  </div>
                  <span className="supportnova-login-hero-mini-pill">NEW</span>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">AL</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Update delivery address</b>Dispatch confirmed
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: AI Assist */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-2"
              data-rot="-4"
              data-depth="8"
              data-base-z="2"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>AI ASSIST</span>
                  <span>✦ DRAFT</span>
                </div>
                <div className="supportnova-login-hero-mini-title">First-response draft</div>
                <div className="supportnova-login-hero-chat-bubble">
                  Where is my replacement shipment?
                </div>
                <div className="supportnova-login-hero-chat-bubble supportnova-login-hero-chat-bubble-agent">
                  Replacement in transit. Arriving tomorrow by 2 PM.
                </div>
                <div className="supportnova-login-hero-mini-chip">✓ Verified by Policy</div>
              </div>
            </div>

            {/* Card 3: Review Queue */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-3"
              data-rot="-2"
              data-depth="7"
              data-base-z="4"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>REVIEW QUEUE</span>
                  <span>● 05 PENDING</span>
                </div>
                <div className="supportnova-login-hero-mini-title">Human verification</div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar avatar-warn">!</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Refund request</b>Policy check · High priority
                  </div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">↗</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Escalation</b>Tier-2 specialist review
                  </div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar avatar-ok">✓</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Suggested reply</b>Approved by Rule RR-01
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Team Pulse */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-4"
              data-rot="3"
              data-depth="10"
              data-base-z="3"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>TEAM PULSE</span>
                  <span>THIS WEEK</span>
                </div>
                <div className="supportnova-login-hero-mini-title">Resolution trend</div>
                <div className="supportnova-login-hero-score">
                  94<span style={{ fontSize: '11px' }}>%</span>
                </div>
                <div className="supportnova-login-hero-score-sub">first-contact resolution</div>
                <div className="supportnova-login-hero-sparkline">
                  <i style={{ height: '36%' }} />
                  <i style={{ height: '54%' }} />
                  <i style={{ height: '45%' }} />
                  <i style={{ height: '72%' }} />
                  <i style={{ height: '59%' }} />
                  <i style={{ height: '91%' }} />
                  <i style={{ height: '82%' }} />
                </div>
              </div>
            </div>

            {/* Card 5: Hero Centerpiece (SupportNova OS) */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-5"
              data-rot="0"
              data-depth="5"
              data-base-z="5"
            >
              <div className="supportnova-login-hero-mini-ui hero-center-card-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>SUPPORTNOVA OS</span>
                  <span className="live-status-pill">● ACTIVE</span>
                </div>
                <div className="supportnova-login-hero-mini-title hero-center-title">
                  Good morning, team
                </div>
                <div className="hero-status-row">
                  <div className="hero-status-badge">
                    <span className="hero-status-dot-sm" />
                    <span>Complaint channels online</span>
                  </div>
                </div>
                
                <div className="hero-metrics-split">
                  <div className="hero-stat-block">
                    <div className="supportnova-login-hero-score">128</div>
                    <div className="supportnova-login-hero-score-sub">Resolved</div>
                  </div>
                  <div className="hero-stat-block highlight-block">
                    <div className="supportnova-login-hero-score score-csat">4.9</div>
                    <div className="supportnova-login-hero-score-sub">CSAT score</div>
                  </div>
                </div>

                <div className="supportnova-login-hero-mini-title" style={{ fontSize: '8.5px', margin: '4px 0 2px' }}>
                  Priority activity stream
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar avatar-warn">!</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Delivery inquiry</b>Assigned Maya · 2m
                  </div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar avatar-ok">✓</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Exchange approved</b>Resolved by Nova
                  </div>
                </div>
              </div>
            </div>

            {/* Card 6: Knowledge Base */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-6"
              data-rot="4"
              data-depth="9"
              data-base-z="3"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>KNOWLEDGE BASE</span>
                  <span>⌕ GROUNDED</span>
                </div>
                <div className="supportnova-login-hero-mini-title">Answers, grounded</div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">⌕</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Return policy</b>Active · v2.4
                  </div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">⌕</div>
                  <div className="supportnova-login-hero-mini-copy">
                    <b>Shipping SLA</b>12 verified guidelines
                  </div>
                </div>
                <div className="supportnova-login-hero-checklist">
                  <div><span>✓</span>Sources linked</div>
                  <div><span>✓</span>Policy aware</div>
                  <div><span>✓</span>Always verified</div>
                </div>
              </div>
            </div>

            {/* Card 7: Performance */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-7"
              data-rot="6"
              data-depth="11"
              data-base-z="4"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>PERFORMANCE</span>
                  <span>↗</span>
                </div>
                <div className="supportnova-login-hero-mini-title">Faster, together</div>
                <div className="supportnova-login-hero-ring" />
                <div style={{ textAlign: 'center' }}>
                  <div className="supportnova-login-hero-score" style={{ fontSize: '18px' }}>−38%</div>
                  <div className="supportnova-login-hero-score-sub">less time to resolve</div>
                </div>
                <div className="supportnova-login-hero-mini-chip" style={{ marginTop: '7px' }}>
                  ↑ improving
                </div>
              </div>
            </div>

            {/* Card 8: Channels */}
            <div
              className="supportnova-login-hero-card supportnova-login-hero-card-8"
              data-rot="-4"
              data-depth="12"
              data-base-z="2"
            >
              <div className="supportnova-login-hero-mini-ui">
                <div className="supportnova-login-hero-mini-top">
                  <span>CHANNELS</span>
                  <span>● 3 ACTIVE</span>
                </div>
                <div className="supportnova-login-hero-mini-title">One shared view</div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">✉</div>
                  <div className="supportnova-login-hero-mini-copy"><b>Email</b>Connected</div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">◉</div>
                  <div className="supportnova-login-hero-mini-copy"><b>Live chat</b>Connected</div>
                </div>
                <div className="supportnova-login-hero-mini-row">
                  <div className="supportnova-login-hero-mini-avatar">◎</div>
                  <div className="supportnova-login-hero-mini-copy"><b>Web portal</b>Connected</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER ATTRIBUTION */}
        <footer className="supportnova-login-hero-footer supportnova-login-hero-subline">
          <div className="hero-footer-org">
            <span className="fictional-org-tag">SupportNova · fictional organization</span>
          </div>
          <div className="hero-footer-tagline">
            <span>Dual-Pipeline Architecture · Validated by Design</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
