import React, { useState, useEffect } from 'react'
import {
  X,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  Settings2,
  BookOpen,
  Users,
  BarChart3,
  FlaskConical,
  UserRoundCheck,
  Inbox,
  Package,
  History,
  Plus,
  FileText,
  Sparkles,
  Bot,
  Activity,
  TrendingUp,
  Clock3,
  PencilLine,
  Scale,
  MessageSquareText,
  Send,
  Star,
  Download,
  SkipForward,
  RotateCcw,
  Check,
  LayoutDashboard,
  Layers,
  Compass,
} from 'lucide-react'
import type { Role } from './types'
import {
  ROLE_TOUR_DATA,
  SYSTEM_ROLES,
  SYSTEM_TOUR_SUMMARY,
  type TourStep,
} from './systemTourData'
import './system-tour.css'

interface SystemTourModalProps {
  isOpen: boolean
  onClose: () => void
  /** If specified, the modal acts in "Role Guide" mode for only that role */
  specificRole?: Role | null
  /** Optional initial step index */
  initialStepIndex?: number
}

// Icon dictionary to safely render string icon names
const ICON_MAP: Record<string, React.ElementType> = {
  ShieldAlert,
  ShieldCheck,
  Settings2,
  BookOpen,
  Users,
  BarChart3,
  FlaskConical,
  UserRoundCheck,
  Inbox,
  Package,
  History,
  Plus,
  FileText,
  Sparkles,
  Bot,
  Activity,
  TrendingUp,
  Clock3,
  PencilLine,
  Scale,
  MessageSquareText,
  Send,
  Star,
  Download,
  LayoutDashboard,
  Layers,
  Compass,
  CheckCircle2,
  XCircle,
}

function renderIcon(iconName: string, className?: string) {
  const IconComp = ICON_MAP[iconName] || Compass
  return <IconComp className={className} />
}

export default function SystemTourModal({
  isOpen,
  onClose,
  specificRole,
  initialStepIndex = 0,
}: SystemTourModalProps) {
  const isSingleRoleMode = Boolean(specificRole)

  // Current state
  // In global tour mode, start at intro screen unless already started
  const [viewState, setViewState] = useState<'intro' | 'tour' | 'completed'>(
    isSingleRoleMode ? 'tour' : 'intro'
  )
  const [currentRoleIndex, setCurrentRoleIndex] = useState(0)
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex)

  // Sync role if specificRole changes
  useEffect(() => {
    if (specificRole) {
      const idx = SYSTEM_ROLES.indexOf(specificRole)
      if (idx !== -1) {
        setCurrentRoleIndex(idx)
      }
      setViewState('tour')
      setCurrentStepIndex(initialStepIndex)
    } else {
      setViewState('intro')
      setCurrentRoleIndex(0)
      setCurrentStepIndex(0)
    }
  }, [specificRole, initialStepIndex, isOpen])

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const activeRoleKey = specificRole || SYSTEM_ROLES[currentRoleIndex]
  const currentRoleConfig = ROLE_TOUR_DATA[activeRoleKey]
  const steps = currentRoleConfig.steps
  const activeStep: TourStep = steps[currentStepIndex] || steps[0]

  // Navigation handlers
  const handleStartTour = (startRoleIndex = 0) => {
    setCurrentRoleIndex(startRoleIndex)
    setCurrentStepIndex(0)
    setViewState('tour')
  }

  const handleNext = () => {
    if (isSingleRoleMode) {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1)
      } else {
        setViewState('completed')
      }
      return
    }

    // Global mode
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      // End of current role
      if (currentRoleIndex < SYSTEM_ROLES.length - 1) {
        setCurrentRoleIndex((prev) => prev + 1)
        setCurrentStepIndex(0)
      } else {
        setViewState('completed')
      }
    }
  }

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
      return
    }

    // At step 0
    if (!isSingleRoleMode && currentRoleIndex > 0) {
      const prevRoleIdx = currentRoleIndex - 1
      const prevRoleKey = SYSTEM_ROLES[prevRoleIdx]
      const prevSteps = ROLE_TOUR_DATA[prevRoleKey].steps
      setCurrentRoleIndex(prevRoleIdx)
      setCurrentStepIndex(prevSteps.length - 1)
    } else if (!isSingleRoleMode && currentRoleIndex === 0) {
      setViewState('intro')
    }
  }

  const handleSkipRole = () => {
    if (isSingleRoleMode) {
      setViewState('completed')
      return
    }

    if (currentRoleIndex < SYSTEM_ROLES.length - 1) {
      setCurrentRoleIndex((prev) => prev + 1)
      setCurrentStepIndex(0)
    } else {
      setViewState('completed')
    }
  }

  const handleJumpToRole = (roleKey: Role) => {
    if (isSingleRoleMode) return
    const idx = SYSTEM_ROLES.indexOf(roleKey)
    if (idx !== -1) {
      setCurrentRoleIndex(idx)
      setCurrentStepIndex(0)
      setViewState('tour')
    }
  }

  return (
    <div
      className="tour-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-modal-title"
      onMouseDown={onClose}
    >
      <div
        className="tour-modal-container"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================================= */}
        <header className="tour-modal-header">
          <div className="tour-header-left">
            <div className="tour-brand-badge">
              <span className="tour-brand-dot" />
              <span className="tour-brand-label">SupportNova Intelligence</span>
              <span className="tour-brand-divider">/</span>
              <span className="tour-brand-title">
                {isSingleRoleMode ? `${currentRoleConfig.title} Guide` : 'System Project Tour'}
              </span>
            </div>
          </div>

          {/* Role progression pipeline in Global mode */}
          {!isSingleRoleMode && viewState === 'tour' && (
            <div className="tour-role-progression-bar" aria-label="Role progression tracker">
              {SYSTEM_ROLES.map((roleKey, idx) => {
                const conf = ROLE_TOUR_DATA[roleKey]
                const isActive = idx === currentRoleIndex
                const isPassed = idx < currentRoleIndex
                return (
                  <button
                    key={roleKey}
                    type="button"
                    className={`tour-role-pill ${isActive ? 'active' : ''} ${isPassed ? 'passed' : ''}`}
                    onClick={() => handleJumpToRole(roleKey)}
                    title={`Jump to ${conf.title} tour`}
                  >
                    <span className="pill-index">{idx + 1}</span>
                    <span className="pill-name">{conf.title}</span>
                    {idx < SYSTEM_ROLES.length - 1 && (
                      <span className="pill-arrow">→</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="tour-header-right">
            {viewState === 'tour' && (
              <div className="tour-step-counter">
                {!isSingleRoleMode && (
                  <span className="role-counter">
                    Role <b>{currentRoleIndex + 1}</b> of {SYSTEM_ROLES.length}
                  </span>
                )}
                <span className="step-counter">
                  Step <b>{currentStepIndex + 1}</b> of {steps.length}
                </span>
              </div>
            )}
            <button
              type="button"
              className="tour-close-btn"
              onClick={onClose}
              title="Close tour"
              aria-label="Close tour"
            >
              <X />
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* MODAL BODY */}
        {/* ========================================================================= */}
        <div className="tour-modal-body">
          {/* ===================================================================== */}
          {/* VIEW 1: INTRO SCREEN */}
          {/* ===================================================================== */}
          {viewState === 'intro' && (
            <div className="tour-intro-layout">
              <div className="tour-intro-hero">
                <div className="tour-intro-badge">
                  <Sparkles className="sparkle-icon" />
                  <span>Interactive System Map & Role Architecture</span>
                </div>
                <h1 id="tour-modal-title" className="tour-intro-headline">
                  Welcome to the <span className="highlight-text">SupportNova</span> System Tour
                </h1>
                <p className="tour-intro-subline">
                  Explore the complete operational capabilities, dual-pipeline AI safeguards,
                  permissions, and end-to-end workflows of every role in the platform.
                </p>

                {/* System Metrics Bar */}
                <div className="tour-intro-metrics-grid">
                  <div className="intro-metric-card">
                    <strong>{SYSTEM_TOUR_SUMMARY.totalRoles}</strong>
                    <span>System Roles</span>
                    <small>Customer to Admin</small>
                  </div>
                  <div className="intro-metric-card">
                    <strong>{SYSTEM_TOUR_SUMMARY.totalModules}</strong>
                    <span>Core Modules</span>
                    <small>Triage to Settings</small>
                  </div>
                  <div className="intro-metric-card">
                    <strong>{SYSTEM_TOUR_SUMMARY.accessibleRoutes}</strong>
                    <span>System Routes</span>
                    <small>Dedicated Workspaces</small>
                  </div>
                  <div className="intro-metric-card">
                    <strong>{SYSTEM_TOUR_SUMMARY.corePipelines}</strong>
                    <span>Intelligence Pipelines</span>
                    <small>GenAI + Python Ground Truth</small>
                  </div>
                </div>

                {/* Role Progression Roadmap */}
                <div className="tour-intro-roadmap">
                  <div className="roadmap-title">
                    <span>EXPLORE THE 5 SYSTEM ROLES IN SEQUENCE</span>
                  </div>
                  <div className="roadmap-cards-grid">
                    {SYSTEM_ROLES.map((roleKey, idx) => {
                      const conf = ROLE_TOUR_DATA[roleKey]
                      return (
                        <div
                          key={roleKey}
                          className="roadmap-card"
                          onClick={() => handleStartTour(idx)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="roadmap-card-head">
                            <div className="roadmap-step-badge">0{idx + 1}</div>
                            <div className="roadmap-icon-box">
                              {renderIcon(conf.icon)}
                            </div>
                          </div>
                          <h3>{conf.title}</h3>
                          <p className="roadmap-tagline">{conf.tagline}</p>
                          <div className="roadmap-card-hover-action">
                            <span>Start here</span>
                            <ArrowRight />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="tour-intro-actions">
                  <button
                    type="button"
                    className="button primary tour-start-btn"
                    onClick={() => handleStartTour(0)}
                  >
                    <span>Start Full Project Tour</span>
                    <ArrowRight />
                  </button>
                  <button
                    type="button"
                    className="button ghost tour-dismiss-btn"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW 2: STEP-BY-STEP ROLE TOUR */}
          {/* ===================================================================== */}
          {viewState === 'tour' && (
            <div className="tour-step-layout">
              {/* Step Navigation Sidebar / Tracker */}
              <aside className="tour-step-nav-sidebar">
                <div className="tour-sidebar-role-badge">
                  <div className="role-icon-circle">
                    {renderIcon(currentRoleConfig.icon)}
                  </div>
                  <div className="role-info">
                    <span className="role-tag">ROLE {currentRoleIndex + 1} OF 5</span>
                    <h3>{currentRoleConfig.title}</h3>
                  </div>
                </div>

                <nav className="tour-step-links-list">
                  {steps.map((st, idx) => {
                    const isSelected = idx === currentStepIndex
                    const isDone = idx < currentStepIndex
                    return (
                      <button
                        key={st.stepId}
                        type="button"
                        className={`tour-step-link-btn ${isSelected ? 'active' : ''} ${isDone ? 'done' : ''}`}
                        onClick={() => setCurrentStepIndex(idx)}
                      >
                        <span className="step-num">{st.stepNumber}</span>
                        <span className="step-title">{st.title}</span>
                        {isDone && <Check className="step-done-check" />}
                      </button>
                    )
                  })}
                </nav>

                <div className="tour-sidebar-summary-box">
                  <small>Primary Objective</small>
                  <p>{currentRoleConfig.overview.primaryGoal}</p>
                </div>
              </aside>

              {/* Step Main Content View */}
              <main className="tour-step-content-pane">
                {/* Step Header */}
                <div className="step-pane-header">
                  <div className="step-eyebrow">
                    <span className="step-badge">{activeStep.stepNumber}</span>
                    <span className="step-category">{activeStep.subtitle}</span>
                  </div>
                  <h2 className="step-main-title">{activeStep.title}</h2>
                  <p className="step-lead-text">{activeStep.content.lead}</p>
                  {activeStep.content.description && (
                    <p className="step-desc-text">{activeStep.content.description}</p>
                  )}
                </div>

                {/* Dynamic Content based on Category */}
                <div className="step-dynamic-content">
                  {/* CATEGORY: OVERVIEW HIGHLIGHTS */}
                  {activeStep.content.highlights && (
                    <div className="tour-highlights-grid">
                      {activeStep.content.highlights.map((h, i) => (
                        <div key={i} className="tour-highlight-card">
                          <div className="highlight-card-head">
                            <div className="highlight-icon">
                              {renderIcon(h.icon)}
                            </div>
                            {h.badge && (
                              <span className="highlight-badge">{h.badge}</span>
                            )}
                          </div>
                          <h4>{h.title}</h4>
                          <p>{h.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CATEGORY: DASHBOARD STATS */}
                  {activeStep.content.stats && (
                    <div className="tour-stats-grid">
                      {activeStep.content.stats.map((s, i) => (
                        <div key={i} className="tour-stat-card">
                          <small>{s.label}</small>
                          <strong>{s.value}</strong>
                          {s.note && <span>{s.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CATEGORY: PAGES ACCESSIBLE */}
                  {activeStep.content.pages && (
                    <div className="tour-pages-list">
                      {activeStep.content.pages.map((p, i) => (
                        <div key={i} className="tour-page-card">
                          <div className="page-card-header">
                            <div className="page-icon">
                              {renderIcon(p.icon)}
                            </div>
                            <div className="page-meta">
                              <h4>{p.name}</h4>
                              <code className="page-route-badge">{p.path}</code>
                            </div>
                          </div>
                          <p className="page-purpose">{p.purpose}</p>
                          <div className="page-split-info">
                            <div className="page-info-col">
                              <span className="info-label">WHAT THEY SEE:</span>
                              <p>{p.canSee}</p>
                            </div>
                            <div className="page-info-col">
                              <span className="info-label">WHAT THEY CAN DO:</span>
                              <p>{p.canDo}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CATEGORY: CRUD FUNCTIONALITIES */}
                  {activeStep.content.crudActions && (
                    <div className="tour-crud-grid">
                      {activeStep.content.crudActions.map((c, i) => (
                        <div key={i} className={`tour-crud-card kind-${c.kind}`}>
                          <div className="crud-badge-row">
                            <span className={`crud-pill ${c.kind}`}>
                              {c.kind.toUpperCase()}
                            </span>
                            <span className="crud-target">{c.target}</span>
                          </div>
                          <h4>{c.action}</h4>
                          <p>{c.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CATEGORY: WORKFLOW PIPELINE */}
                  {activeStep.content.workflowNodes && (
                    <div className="tour-workflow-container">
                      <div className="workflow-nodes-flow">
                        {activeStep.content.workflowNodes.map((n, i) => (
                          <div key={i} className="workflow-node-card">
                            <div className="node-step-circle">
                              <span>{n.step}</span>
                            </div>
                            <div className="node-content">
                              <div className="node-action-pill">
                                {renderIcon(n.icon)}
                                <span>{n.action}</span>
                              </div>
                              <h4>{n.title}</h4>
                              <p>{n.detail}</p>
                            </div>
                            {i < (activeStep.content.workflowNodes?.length || 0) - 1 && (
                              <div className="node-connector-line" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CATEGORY: PERMISSIONS MATRIX */}
                  {activeStep.content.permissions && (
                    <div className="tour-permissions-split">
                      <div className="permission-col can-access-col">
                        <div className="col-header">
                          <CheckCircle2 className="can-icon" />
                          <h3>CAN ACCESS & PERFORM</h3>
                        </div>
                        <div className="permission-items-list">
                          {activeStep.content.permissions.canAccess.map((perm, i) => (
                            <div key={i} className="perm-item pass">
                              <Check className="perm-check" />
                              <div>
                                <b>{perm.title}</b>
                                <p>{perm.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="permission-col cannot-access-col">
                        <div className="col-header">
                          <XCircle className="cannot-icon" />
                          <h3>CANNOT ACCESS / RESTRICTED</h3>
                        </div>
                        <div className="permission-items-list">
                          {activeStep.content.permissions.cannotAccess.map((perm, i) => (
                            <div key={i} className="perm-item fail">
                              <X className="perm-cross" />
                              <div>
                                <b>{perm.title}</b>
                                <p>{perm.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Role Completion Callout when at last step */}
                {currentStepIndex === steps.length - 1 && (
                  <div className="tour-role-completed-banner">
                    <div className="banner-left">
                      <CheckCircle2 className="banner-icon" />
                      <div>
                        <h4>{currentRoleConfig.title} Tour Completed</h4>
                        <p>
                          {!isSingleRoleMode && currentRoleIndex < SYSTEM_ROLES.length - 1
                            ? `Ready to explore the next role: ${ROLE_TOUR_DATA[SYSTEM_ROLES[currentRoleIndex + 1]].title}`
                            : 'You have reviewed all role capabilities.'}
                        </p>
                      </div>
                    </div>
                    {!isSingleRoleMode && currentRoleIndex < SYSTEM_ROLES.length - 1 && (
                      <button
                        type="button"
                        className="button primary"
                        onClick={handleNext}
                      >
                        <span>Next: {ROLE_TOUR_DATA[SYSTEM_ROLES[currentRoleIndex + 1]].title}</span>
                        <ChevronRight />
                      </button>
                    )}
                  </div>
                )}
              </main>
            </div>
          )}

          {/* ===================================================================== */}
          {/* VIEW 3: TOUR COMPLETION (JUDGE MODE) */}
          {/* ===================================================================== */}
          {viewState === 'completed' && (
            <div className="tour-completion-layout">
              <div className="completion-hero">
                <div className="completion-badge">
                  <ShieldCheck className="check-icon" />
                  <span>Comprehensive System Verification</span>
                </div>
                <h1 className="completion-title">Complete System Tour Finished</h1>
                <p className="completion-subline">
                  {isSingleRoleMode
                    ? `You have explored the full capabilities, permissions, and workflow for the ${currentRoleConfig.title} role.`
                    : "You've explored the complete role-based workflow, dual-pipeline safeguards, and interaction synergies across SupportNova."}
                </p>

                {/* Summary Metrics */}
                <div className="completion-metrics-bar">
                  <div className="completion-metric">
                    <strong>{SYSTEM_TOUR_SUMMARY.totalRoles}</strong>
                    <span>Total Roles</span>
                    <small>Admin → Customer</small>
                  </div>
                  <div className="completion-metric">
                    <strong>{SYSTEM_TOUR_SUMMARY.totalModules}</strong>
                    <span>Workspaces</span>
                    <small>Zero Redundancy</small>
                  </div>
                  <div className="completion-metric">
                    <strong>{SYSTEM_TOUR_SUMMARY.accessibleRoutes}</strong>
                    <span>Total Pages</span>
                    <small>Role Scoped</small>
                  </div>
                  <div className="completion-metric">
                    <strong>100%</strong>
                    <span>Audited Ground Truth</span>
                    <small>No Hallucinations</small>
                  </div>
                </div>

                {/* Judge Mode Highlights */}
                <div className="completion-highlights-grid">
                  {SYSTEM_TOUR_SUMMARY.keyHighlights.map((kh, i) => (
                    <div key={i} className="completion-highlight-box">
                      <div className="kh-icon">
                        <CheckCircle2 />
                      </div>
                      <div className="kh-body">
                        <h4>{kh.title}</h4>
                        <p>{kh.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="completion-actions-row">
                  <button
                    type="button"
                    className="button primary"
                    onClick={onClose}
                  >
                    <span>Explore Project</span>
                    <ArrowRight />
                  </button>
                  {!isSingleRoleMode && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => handleStartTour(0)}
                    >
                      <RotateCcw />
                      <span>Restart Full Tour</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="button ghost"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MODAL FOOTER CONTROLS */}
        {/* ========================================================================= */}
        <footer className="tour-modal-footer">
          <div className="footer-left">
            {viewState === 'tour' && (
              <button
                type="button"
                className="button ghost tour-control-btn"
                onClick={handlePrevious}
                disabled={currentStepIndex === 0 && currentRoleIndex === 0 && isSingleRoleMode}
              >
                <ChevronLeft />
                <span>Previous</span>
              </button>
            )}
          </div>

          <div className="footer-center">
            {viewState === 'tour' && (
              <div className="step-indicator-dots" aria-hidden="true">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`step-dot ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'done' : ''}`}
                    onClick={() => setCurrentStepIndex(i)}
                    title={`Step ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="footer-right">
            {viewState === 'tour' && !isSingleRoleMode && currentRoleIndex < SYSTEM_ROLES.length - 1 && (
              <button
                type="button"
                className="button secondary compact tour-skip-btn"
                onClick={handleSkipRole}
                title="Skip this role and jump to the next one"
              >
                <SkipForward />
                <span>Skip Role</span>
              </button>
            )}

            {viewState === 'tour' && (
              <button
                type="button"
                className="button primary tour-next-btn"
                onClick={handleNext}
              >
                <span>
                  {currentStepIndex === steps.length - 1
                    ? !isSingleRoleMode && currentRoleIndex < SYSTEM_ROLES.length - 1
                      ? `Next: ${ROLE_TOUR_DATA[SYSTEM_ROLES[currentRoleIndex + 1]].title}`
                      : 'Complete Tour'
                    : 'Next'}
                </span>
                <ChevronRight />
              </button>
            )}

            {viewState !== 'tour' && (
              <button
                type="button"
                className="button ghost tour-control-btn"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
