import type { Role } from './types'

export interface TourStep {
  stepId: string
  stepNumber: string
  title: string
  subtitle: string
  category: 'overview' | 'dashboard' | 'pages' | 'features' | 'workflow' | 'permissions' | 'summary'
  content: {
    lead: string
    description?: string
    highlights?: Array<{
      icon: string
      title: string
      desc: string
      badge?: string
    }>
    pages?: Array<{
      path: string
      name: string
      purpose: string
      canSee: string
      canDo: string
      icon: string
    }>
    crudActions?: Array<{
      action: string
      target: string
      description: string
      kind: 'create' | 'read' | 'update' | 'delete' | 'review' | 'export'
    }>
    workflowNodes?: Array<{
      step: number
      title: string
      action: string
      detail: string
      icon: string
    }>
    permissions?: {
      canAccess: Array<{ title: string; desc: string }>
      cannotAccess: Array<{ title: string; reason: string }>
    }
    stats?: Array<{
      label: string
      value: string
      note?: string
    }>
  }
}

export interface RoleTourConfig {
  role: Role
  title: string
  tagline: string
  badgeColor: string
  themeTone: 'purple' | 'cyan' | 'amber' | 'emerald' | 'blue'
  icon: string
  overview: {
    responsibilities: string[]
    primaryGoal: string
    interactionSummary: string
  }
  steps: TourStep[]
}

export const SYSTEM_ROLES: Role[] = [
  'administrator',
  'manager',
  'reviewer',
  'agent',
  'customer',
]

export const ROLE_TOUR_DATA: Record<Role, RoleTourConfig> = {
  administrator: {
    role: 'administrator',
    title: 'Administrator',
    tagline: 'System Governor & Platform Architect',
    badgeColor: '#ec4899',
    themeTone: 'purple',
    icon: 'ShieldAlert',
    overview: {
      responsibilities: [
        'Complete governance over AI pipelines, models, and fallback thresholds',
        'Direct rule matrix management (Resolution Rules & Escalation Rules)',
        'Taxonomy structuring: Categories, Subcategories, and Departments',
        'SLA policy calibration and customer tier priority definitions',
        'User lifecycle & role-based access management (RBAC)',
        'Knowledge base ingestion, policy versioning, and impact re-analysis',
      ],
      primaryGoal: 'Ensure system resilience, policy compliance, dual-pipeline consistency, and secure user access without code redeployments.',
      interactionSummary: 'Configures rules and thresholds that guide Agent triage, feeds Reviewer oversight queues, sets Manager SLA targets, and governs Customer routing.',
    },
    steps: [
      {
        stepId: 'admin-01',
        stepNumber: '01',
        title: 'Role Overview & Responsibilities',
        subtitle: 'Enterprise Administration & Governance',
        category: 'overview',
        content: {
          lead: 'The Administrator holds supreme authority over SupportNova, governing both AI intelligence pipelines, business logic rules, knowledge policies, and organizational users.',
          description: 'Administrators configure live system parameters without requiring software rebuilds or code changes. Every change is immediately tracked in the immutable audit log.',
          highlights: [
            {
              icon: 'Settings2',
              title: 'Full Workspace Settings',
              desc: 'Direct configuration of AI pipelines, resolution matrices, escalation rules, SLA thresholds, and system users.',
              badge: 'Full Access',
            },
            {
              icon: 'Bot',
              title: 'Dual-Pipeline Governance',
              desc: 'Oversee GenAI model provider chains, retry budgets, prompt templates, and Python deterministic ground truth thresholds.',
              badge: 'Pipeline 1 & 2',
            },
            {
              icon: 'BookOpen',
              title: 'Knowledge Base Ingestion',
              desc: 'Upload PDF/DOCX policy documents, trigger automated chunking, analyze policy change impacts, and run bulk re-analyses.',
              badge: 'Superpower',
            },
            {
              icon: 'Users',
              title: 'RBAC User Management',
              desc: 'Create and activate/deactivate accounts across all 5 roles with custom customer tiers and Argon2 credentials.',
              badge: 'Security',
            },
          ],
        },
      },
      {
        stepId: 'admin-02',
        stepNumber: '02',
        title: 'Intelligence Overview Dashboard',
        subtitle: 'Executive Telemetry & Real-Time Operational Health',
        category: 'dashboard',
        content: {
          lead: 'Administrators access a high-density intelligence overview that synthesizes complaints, verification accuracy, SLA risks, and system workload.',
          description: 'The dashboard provides immediate visibility into how well GenAI is matching the deterministic Python rule engine.',
          stats: [
            { label: 'Total Complaints', value: 'Live Count', note: 'All customer cases across departments' },
            { label: 'Pending Review', value: 'Live Queue', note: 'Cases awaiting human reviewer validation' },
            { label: 'Active Escalations', value: 'Tracked', note: 'Regulatory, safety, or repeated complaints' },
            { label: 'SLA At Risk', value: 'Monitored', note: 'Cases using ≥75% of their resolution window' },
          ],
          highlights: [
            {
              icon: 'Activity',
              title: 'Validation Health Ring',
              desc: 'Measures exact field agreement between GenAI and Python ground truth with average verification scores.',
            },
            {
              icon: 'BarChart3',
              title: 'Complaint Volume & Mix',
              desc: 'Area chart by Python-validated category and donut chart of current priority mix (P1 to P4).',
            },
            {
              icon: 'ShieldCheck',
              title: 'Unassigned & Escalation Queues',
              desc: 'Live telemetry on cases awaiting staff ownership and escalation warnings requiring urgent handling.',
            },
          ],
        },
      },
      {
        stepId: 'admin-03',
        stepNumber: '03',
        title: 'Accessible Pages & Modules',
        subtitle: 'Unrestricted Access Across All 10 Workspace Routes',
        category: 'pages',
        content: {
          lead: 'The Administrator has unrestricted navigation to every single module, including exclusive access to the Workspace Settings suite.',
          pages: [
            {
              path: '/settings',
              name: 'Workspace Settings (Exclusive)',
              purpose: 'Manage AI provider chains, rules, taxonomies, SLA tiers, and users.',
              canSee: '6 configuration tabs: Pipelines, Rules, Escalations, Taxonomy, SLA, Users.',
              canDo: 'Edit prompt versions, tweak similarity thresholds, CRUD rules, add users.',
              icon: 'Settings2',
            },
            {
              path: '/knowledge',
              name: 'Knowledge Base (Admin Mode)',
              purpose: 'Grounding policies, SOPs, and FAQ version control.',
              canSee: 'All document versions, chunk counts, active/obsolete statuses, and impact reports.',
              canDo: 'Upload PDF/DOCX docs, change version status, trigger bulk re-analysis of affected cases.',
              icon: 'BookOpen',
            },
            {
              path: '/reports',
              name: 'Reports & Analytics',
              purpose: 'Cross-department performance and trend intelligence.',
              canSee: 'CSAT distribution, sentiment dot plots, urgency scatter plots, first response SLAs.',
              canDo: 'Export full audit reports to CSV, Excel (XLSX), or PDF.',
              icon: 'BarChart3',
            },
            {
              path: '/evaluation',
              name: 'Evaluation & Bulk Import',
              purpose: 'Hidden test pack validation against ground truth.',
              canSee: 'Batch accuracy runs, field-by-field precision, and GenAI-Python agreement rates.',
              canDo: 'Upload CSV/JSON complaint packs, run batch AI tests, download comparative spreadsheets.',
              icon: 'FlaskConical',
            },
            {
              path: '/review',
              name: 'Manual Review Queue',
              purpose: 'Human-in-the-loop oversight of ambiguous cases.',
              canSee: 'Cases flagged for mismatches, prompt injection containment, or missing info.',
              canDo: 'Approve, Reject, Reclassify, Reassign, or Modify decisions.',
              icon: 'UserRoundCheck',
            },
            {
              path: '/complaints',
              name: 'Complaint Directory & Detail',
              purpose: 'Global complaint repository with dual-pipeline inspection.',
              canSee: 'All customer complaints, audit histories, GenAI drafts, and Python checks.',
              canDo: 'Re-run dual analysis, assign cases, update status with notes, message customers.',
              icon: 'Inbox',
            },
          ],
        },
      },
      {
        stepId: 'admin-04',
        stepNumber: '04',
        title: 'Core Functionalities & CRUD Capabilities',
        subtitle: 'Comprehensive Operational & Architectural Controls',
        category: 'features',
        content: {
          lead: 'Administrators have complete Read, Create, Update, Toggle, and Export rights across all core entities.',
          crudActions: [
            {
              action: 'Configure AI Pipelines',
              target: 'GenAI & Python Engines',
              description: 'Configure multi-provider fallbacks, timeouts, prompt versions, and reset paused providers after API outages.',
              kind: 'update',
            },
            {
              action: 'Manage Rule Matrix',
              target: 'Resolution Rules',
              description: 'Create & edit rules linking keywords, categories, departments, policies, and refund/replacement eligibilities.',
              kind: 'create',
            },
            {
              action: 'Enforce Escalations',
              target: 'Mandatory Escalation Rules',
              description: 'Define conditions (keywords, repeat counts, categories) that force supervisor review even if AI misses them.',
              kind: 'create',
            },
            {
              action: 'Manage User Accounts',
              target: 'Platform Users',
              description: 'Add new staff or customer accounts; toggle user activation states with self-deactivation protection.',
              kind: 'create',
            },
            {
              action: 'Ingest Knowledge Docs',
              target: 'Policies & SOPs',
              description: 'Upload regulatory documents; chunk text into traceable passages; retire obsolete versions.',
              kind: 'create',
            },
            {
              action: 'Export Reports',
              target: 'System Analytics',
              description: 'Generate and download executive reports in CSV, formatted Excel (.xlsx), and print-ready PDF.',
              kind: 'export',
            },
          ],
        },
      },
      {
        stepId: 'admin-05',
        stepNumber: '05',
        title: 'End-to-End Administrator Workflow',
        subtitle: 'System Lifecycle & Continuous Oversight Flow',
        category: 'workflow',
        content: {
          lead: 'The Administrator keeps the operational engine tuned, compliant, and synchronized with evolving company policies.',
          workflowNodes: [
            {
              step: 1,
              title: 'Sign In & Authenticate',
              action: 'Secure JWT Session',
              detail: 'Logs in via JWT + Argon2 authentication with highest privilege tier.',
              icon: 'ShieldCheck',
            },
            {
              step: 2,
              title: 'Review System Health',
              action: 'Intelligence Overview',
              detail: 'Checks verification scores, SLA breaches, pipeline errors, and escalation alerts.',
              icon: 'Activity',
            },
            {
              step: 3,
              title: 'Update Business Rules',
              action: 'Settings → Rules & SLA',
              detail: 'Adjusts keywords, triage departments, escalation criteria, or urgency mappings.',
              icon: 'Settings2',
            },
            {
              step: 4,
              title: 'Ingest Policy Documents',
              action: 'Knowledge Base Upload',
              detail: 'Uploads new SOPs; reviews impact analysis on open complaints; triggers bulk re-analysis.',
              icon: 'BookOpen',
            },
            {
              step: 5,
              title: 'Benchmark System Accuracy',
              action: 'Evaluation Pack Runs',
              detail: 'Uploads hidden test sets to verify accuracy and pipeline agreement against benchmarks.',
              icon: 'FlaskConical',
            },
            {
              step: 6,
              title: 'Audit & User Governance',
              action: 'Audit Log & User Control',
              detail: 'Inspects immutable audit trail of actions taken across the organization; manages access.',
              icon: 'Users',
            },
          ],
        },
      },
      {
        stepId: 'admin-06',
        stepNumber: '06',
        title: 'Role Permissions & Access Boundaries',
        subtitle: 'Explicit Privileges & Strategic Design Boundaries',
        category: 'permissions',
        content: {
          lead: 'The Administrator role has the broadest permissions, with purpose-built safeguards to preserve data integrity.',
          permissions: {
            canAccess: [
              { title: 'Workspace Settings Suite', desc: 'Pipelines, resolution rules, escalation matrix, taxonomy, SLAs, and user administration.' },
              { title: 'Knowledge Base Upload & Deprecation', desc: 'Upload documents, activate/deactivate policy versions, run re-analysis.' },
              { title: 'Reports & Analytics Hub', desc: 'Full operational KPIs, CSAT breakdowns, sentiment plots, and file exports.' },
              { title: 'Evaluation Engine', desc: 'Bulk import unseen CSV/JSON test packs and analyze accuracy metrics.' },
              { title: 'Review Queue & Complaint Override', desc: 'Full manual review override, decision modification, and reclassification.' },
              { title: 'All Complaints & Conversations', desc: 'Access any customer complaint, assign owners, update statuses, post updates.' },
            ],
            cannotAccess: [
              { title: 'Self-Deactivation', reason: 'System blocks administrators from deactivating their own active account to prevent lockouts.' },
              { title: 'Audit Trail Alteration', reason: 'Audit logs are strictly append-only in SQLite/Postgres to preserve legal compliance.' },
              { title: 'Customer Credit Card Numbers', reason: 'Sensitive customer PII (cards, SSNs) is masked before GenAI processing.' },
            ],
          },
        },
      },
      {
        stepId: 'admin-07',
        stepNumber: '07',
        title: 'Role Completion & System Impact',
        subtitle: 'Administrator Tour Complete',
        category: 'summary',
        content: {
          lead: 'You have explored the complete Administrator capabilities — from dual-pipeline governance and rule matrix editing to user RBAC and knowledge ingestion.',
          description: 'The Administrator provides the foundation that enables Managers, Reviewers, Agents, and Customers to interact seamlessly.',
          stats: [
            { label: 'Role Authority', value: 'Tier 1 (Highest)' },
            { label: 'Modules Accessible', value: '10 of 10' },
            { label: 'Exclusive Routes', value: '/settings' },
          ],
        },
      },
    ],
  },

  manager: {
    role: 'manager',
    title: 'Manager',
    tagline: 'Operational Leader & Analytics Strategist',
    badgeColor: '#0ea5e9',
    themeTone: 'cyan',
    icon: 'BarChart3',
    overview: {
      responsibilities: [
        'Monitor operational performance, department workloads, and SLA compliance',
        'Analyze customer satisfaction (CSAT) scores and recurring product defects',
        'Review emerging complaint trends and escalation volume spikes',
        'Conduct AI evaluation benchmarks on hidden complaint packs',
        'Audit reviewer decisions and intervene on high-priority escalations',
        'Export compliance reports in CSV, XLSX, and PDF for executive stakeholders',
      ],
      primaryGoal: 'Drive support operations efficiency, maintain SLA compliance above 95%, detect product defect spikes early, and validate AI accuracy.',
      interactionSummary: 'Supervises Agents and Reviewers, reviews aggregated team metrics, monitors escalated complaints, and benchmarks AI performance.',
    },
    steps: [
      {
        stepId: 'mgr-01',
        stepNumber: '01',
        title: 'Role Overview & Responsibilities',
        subtitle: 'Support Leadership & Operational Strategy',
        category: 'overview',
        content: {
          lead: 'The Manager oversees team performance, complaint triage efficiency, and customer satisfaction across all service departments.',
          description: 'With deep analytical tooling, Managers spot rising defect trends, ensure SLA windows are honored, and validate that AI recommendations remain grounded and accurate.',
          highlights: [
            {
              icon: 'BarChart3',
              title: 'Operational Analytics Hub',
              desc: 'Interactive dashboards displaying department workloads, daily volume trends, and first-response compliance.',
              badge: 'Analytics',
            },
            {
              icon: 'FlaskConical',
              title: 'Batch AI Evaluation',
              desc: 'Upload real or synthetic test datasets to calculate precision, recall, and AI-Python agreement rates.',
              badge: 'Quality Control',
            },
            {
              icon: 'UserRoundCheck',
              title: 'Review Queue Oversight',
              desc: 'Inspect human-in-the-loop decisions, review notes, and policy reclassifications.',
              badge: 'Supervision',
            },
            {
              icon: 'Download',
              title: 'Multi-Format Reporting',
              desc: 'Export complaint logs and pipeline comparisons to CSV, Excel, and PDF.',
              badge: 'Reporting',
            },
          ],
        },
      },
      {
        stepId: 'mgr-02',
        stepNumber: '02',
        title: 'Manager Overview Dashboard',
        subtitle: 'High-Level Operational Health & Risk Telemetry',
        category: 'dashboard',
        content: {
          lead: 'Managers are presented with aggregated metrics covering total volume, pending reviews, escalations, and at-risk SLA cases.',
          description: 'The dashboard highlights operational bottlenecks before they become customer-facing failures.',
          stats: [
            { label: 'Total Volume', value: 'Aggregated', note: 'Combined intake across all departments' },
            { label: 'SLA At Risk', value: 'High Priority', note: 'Complaints past 75% of target window' },
            { label: 'Agreement Rate', value: 'Monitored', note: 'GenAI vs Python verification alignment' },
            { label: 'Pending Reviews', value: 'Active', note: 'Cases waiting on Reviewer sign-off' },
          ],
          highlights: [
            {
              icon: 'TrendingUp',
              title: 'Workload & Priority Mix',
              desc: 'Real-time charts showing distribution across P1 (Critical), P2 (High), P3 (Medium), and P4 (Low).',
            },
            {
              icon: 'Clock3',
              title: 'SLA Risk Tracking',
              desc: 'Direct visibility into cases approaching breach thresholds to reallocate staff dynamically.',
            },
            {
              icon: 'ShieldAlert',
              title: 'Escalation Alert Monitor',
              desc: 'Surfaces safety and regulatory cases that require supervisory intervention.',
            },
          ],
        },
      },
      {
        stepId: 'mgr-03',
        stepNumber: '03',
        title: 'Accessible Pages & Modules',
        subtitle: 'Analytical & Supervisory Route Access',
        category: 'pages',
        content: {
          lead: 'Managers have access to analytical and evaluation suites, review queues, knowledge policies, and all complaint records.',
          pages: [
            {
              path: '/reports',
              name: 'Reports & Analytics',
              purpose: 'Operational intelligence, trends, department workload, and CSAT.',
              canSee: 'Department volume charts, CSAT ratings, sentiment dot plots, urgency scatter plots, SLA metrics.',
              canDo: 'Export complaints, comparisons, and SLA reports to CSV, XLSX, and PDF.',
              icon: 'BarChart3',
            },
            {
              path: '/evaluation',
              name: 'Evaluation & Bulk Testing',
              purpose: 'Benchmark accuracy on hidden test packs without altering live rules.',
              canSee: 'Evaluation runs history, category accuracy bars, escalation recall, pipeline agreement.',
              canDo: 'Upload CSV/JSON packs, run batch evaluations with/without GenAI, download reports.',
              icon: 'FlaskConical',
            },
            {
              path: '/review',
              name: 'Manual Review Queue',
              purpose: 'Oversight of ambiguous, flagged, or disputed complaint decisions.',
              canSee: 'Cases flagged for human decision, AI vs Python comparison cards, reviewer notes.',
              canDo: 'Approve, reject, escalate, reclassify, or modify customer response drafts.',
              icon: 'UserRoundCheck',
            },
            {
              path: '/knowledge',
              name: 'Knowledge Base (Reader)',
              purpose: 'Approved policies, SOPs, and FAQ documentation.',
              canSee: 'All policy versions, chunk texts, effective dates, and status badges.',
              canDo: 'Search policies, inspect chunk references, verify grounded rules.',
              icon: 'BookOpen',
            },
            {
              path: '/complaints',
              name: 'Complaints Directory',
              purpose: 'Comprehensive search and filter across all customer cases.',
              canSee: 'Full complaint list with category, status, priority, department, and SLA flags.',
              canDo: 'Filter by date range, department, sentiment; open cases for detailed audit.',
              icon: 'Inbox',
            },
          ],
        },
      },
      {
        stepId: 'mgr-04',
        stepNumber: '04',
        title: 'Functionalities & Tactical Capabilities',
        subtitle: 'Analytics, Evaluation, Supervision & Oversight',
        category: 'features',
        content: {
          lead: 'Managers utilize advanced analytical tools to guide operational decisions and maintain support quality.',
          crudActions: [
            {
              action: 'Run Evaluation Packs',
              target: 'Batch Testing Suite',
              description: 'Import unseen complaint packs to measure model accuracy, category matching, and prompt alignment.',
              kind: 'create',
            },
            {
              action: 'Export Reports',
              target: 'Audit & Compliance Files',
              description: 'Download full complaint datasets, SLA compliance sheets, and pipeline comparisons in Excel/PDF.',
              kind: 'export',
            },
            {
              action: 'Intervene in Review Queue',
              target: 'Flagged Complaints',
              description: 'Approve or override AI recommendations, reassign departments, and refine agent response drafts.',
              kind: 'review',
            },
            {
              action: 'Track Trends & Anomalies',
              target: '7-Day Trend Engine',
              description: 'Detect rising categories, recurring hardware product issues, and daily escalation spikes automatically.',
              kind: 'read',
            },
            {
              action: 'Audit SLA Compliance',
              target: 'First Response & Resolution Timers',
              description: 'Monitor on-time response rates, identify overdue cases, and enforce resolution SLAs.',
              kind: 'read',
            },
          ],
        },
      },
      {
        stepId: 'mgr-05',
        stepNumber: '05',
        title: 'End-to-End Manager Workflow',
        subtitle: 'Strategic Operational Supervision Routine',
        category: 'workflow',
        content: {
          lead: 'A typical day for a Support Manager involves reviewing KPIs, addressing escalated bottlenecks, and evaluating model accuracy.',
          workflowNodes: [
            {
              step: 1,
              title: 'Login & Health Check',
              action: 'Review Dashboard KPIs',
              detail: 'Examines daily intake volume, escalation alerts, and cases approaching SLA expiration.',
              icon: 'ShieldCheck',
            },
            {
              step: 2,
              title: 'Inspect Review Queue',
              action: 'Human Oversight',
              detail: 'Checks high-stakes cases in /review where AI and Python differed or prompt injections were blocked.',
              icon: 'UserRoundCheck',
            },
            {
              step: 3,
              title: 'Analyze Operational Trends',
              action: 'Reports & Analytics',
              detail: 'Reviews department workload distribution, CSAT customer feedback ratings, and top defect products.',
              icon: 'BarChart3',
            },
            {
              step: 4,
              title: 'Run AI Quality Benchmarks',
              action: 'Evaluation Suite',
              detail: 'Uploads batch evaluation test files to ensure AI categorization accuracy meets organizational thresholds.',
              icon: 'FlaskConical',
            },
            {
              step: 5,
              title: 'Export Stakeholder Reports',
              action: 'Multi-Format Export',
              detail: 'Downloads comprehensive CSV, Excel, or PDF reports for weekly leadership reviews.',
              icon: 'Download',
            },
          ],
        },
      },
      {
        stepId: 'mgr-06',
        stepNumber: '06',
        title: 'Role Permissions & Access Boundaries',
        subtitle: 'Managerial Authority & Deliberate Boundaries',
        category: 'permissions',
        content: {
          lead: 'Managers hold high operational authority while system architecture and user accounts remain restricted to Administrators.',
          permissions: {
            canAccess: [
              { title: 'Operational Reports & Analytics', desc: 'Full access to /reports, charts, CSAT analysis, and data exports.' },
              { title: 'AI Evaluation & Benchmarking', desc: 'Full access to /evaluation to run batch tests and download accuracy scores.' },
              { title: 'Manual Review Queue Oversight', desc: 'Full access to /review to approve, reject, modify, or reclassify cases.' },
              { title: 'All Complaints & Case Histories', desc: 'Can view, filter, inspect, and assign any complaint across departments.' },
              { title: 'Knowledge Base Browsing', desc: 'Access to read all approved policies and traceable chunks in /knowledge.' },
            ],
            cannotAccess: [
              { title: 'Workspace Settings (/settings)', reason: 'Direct modification of provider keys, system thresholds, and rule tables requires Administrator role.' },
              { title: 'User Account Management', reason: 'Creating, editing, or deactivating staff and customer accounts is restricted to Administrators.' },
              { title: 'Knowledge Document Upload', reason: 'Publishing new policy documents or altering policy statuses requires Administrator authority.' },
            ],
          },
        },
      },
      {
        stepId: 'mgr-07',
        stepNumber: '07',
        title: 'Role Completion & Strategic Value',
        subtitle: 'Manager Tour Complete',
        category: 'summary',
        content: {
          lead: 'You have explored the Manager role — leading the operational strategy, driving SLA compliance, auditing AI accuracy, and mentoring teams.',
          description: 'Managers ensure that customer support runs efficiently and that AI automation remains disciplined, accurate, and accountable.',
          stats: [
            { label: 'Role Authority', value: 'Tier 2 (Supervisory)' },
            { label: 'Modules Accessible', value: '8 of 10' },
            { label: 'Key Domains', value: 'Analytics & Evaluation' },
          ],
        },
      },
    ],
  },

  reviewer: {
    role: 'reviewer',
    title: 'Reviewer',
    tagline: 'Quality Assurance & Human-in-the-Loop Auditor',
    badgeColor: '#f59e0b',
    themeTone: 'amber',
    icon: 'UserRoundCheck',
    overview: {
      responsibilities: [
        'Perform human-in-the-loop oversight on ambiguous or disputed complaints',
        'Audit side-by-side comparisons between GenAI recommendations and Python ground truth',
        'Resolve mismatches in category, subcategory, urgency, or department routing',
        'Modify agent-facing customer response drafts before dispatch',
        'Handle cases where prompt injection attempts were contained',
        'Preserve full audit trails: original AI recommendations remain archived alongside final human decisions',
      ],
      primaryGoal: 'Eliminate AI hallucinations, ensure policy fidelity, resolve edge-case ambiguities, and safeguard customer communications.',
      interactionSummary: 'Acts as the critical human validation bridge between AI triage outputs and front-line Agent resolution actions.',
    },
    steps: [
      {
        stepId: 'rev-01',
        stepNumber: '01',
        title: 'Role Overview & Responsibilities',
        subtitle: 'Human-in-the-Loop Quality & Policy Assurance',
        category: 'overview',
        content: {
          lead: 'The Reviewer provides essential human oversight, reviewing cases where GenAI and deterministic Python rules disagree or ambiguity triggers manual review.',
          description: 'By design, SupportNova never allows unverified AI outputs to reach high-risk customers without human validation. Reviewers guarantee policy adherence and audit compliance.',
          highlights: [
            {
              icon: 'UserRoundCheck',
              title: 'Dedicated Review Queue',
              desc: 'Focused workspace listing all complaints requiring manual triage, policy verification, or prompt injection review.',
              badge: 'Core Duty',
            },
            {
              icon: 'Scale',
              title: 'Dual-Pipeline Comparison',
              desc: 'Inspect GenAI recommendations alongside Python ground truth with clear match/mismatch indicators.',
              badge: 'Verification',
            },
            {
              icon: 'PencilLine',
              title: 'Decision Modification',
              desc: 'Edit category, urgency, priority, or customer response draft while automatically saving original AI outputs in audit.',
              badge: 'Oversight',
            },
            {
              icon: 'ShieldCheck',
              title: 'Adversarial Containment',
              desc: 'Review complaints flagged for prompt injection patterns to verify that instructions were treated strictly as data.',
              badge: 'Security',
            },
          ],
        },
      },
      {
        stepId: 'rev-02',
        stepNumber: '02',
        title: 'Reviewer Dashboard Experience',
        subtitle: 'Case Triage & Review Queue Readiness',
        category: 'dashboard',
        content: {
          lead: 'Reviewers access the operational overview with immediate focus on cases awaiting human intervention.',
          description: 'The dashboard highlights validation health, agreement rates, and cases flagged for human decision.',
          stats: [
            { label: 'Awaiting Review', value: 'Live Counter', note: 'Cases in /review queue right now' },
            { label: 'Full Agreement', value: 'Monitored', note: 'Percentage of cases matching perfectly' },
            { label: 'Mismatched Analyses', value: 'Flagged', note: 'Cases where GenAI deviated from Python' },
            { label: 'Escalations', value: 'Tracked', note: 'Cases flagged for regulatory or safety escalations' },
          ],
          highlights: [
            {
              icon: 'UserRoundCheck',
              title: 'Direct Queue Access',
              desc: 'Instant one-click navigation to the Manual Review Queue to clear pending backlog.',
            },
            {
              icon: 'Activity',
              title: 'Agreement Telemetry',
              desc: 'Track system-wide accuracy score and average field-by-field verification rate.',
            },
            {
              icon: 'ShieldAlert',
              title: 'Prompt Injection Alerts',
              desc: 'Immediate warning if incoming customer text attempted to override system instructions.',
            },
          ],
        },
      },
      {
        stepId: 'rev-03',
        stepNumber: '03',
        title: 'Accessible Pages & Modules',
        subtitle: 'Audit & Investigation Module Access',
        category: 'pages',
        content: {
          lead: 'Reviewers have full access to the Manual Review Queue, Complaint Directory, Detailed Audit Trails, and Knowledge Base.',
          pages: [
            {
              path: '/review',
              name: 'Manual Review Queue (Core Tool)',
              purpose: 'Side-by-side audit and final decision sign-off.',
              canSee: 'Pending cases, GenAI vs Python split comparison, review reasons, validation flags.',
              canDo: 'Approve, Reject, Escalate, Comment, Regenerate, Reassign, Reclassify, Modify Decision.',
              icon: 'UserRoundCheck',
            },
            {
              path: '/complaints',
              name: 'Complaints Directory',
              purpose: 'Search and inspect any complaint across the enterprise.',
              canSee: 'Complaints filtered by review status, validation score, sentiment, or priority.',
              canDo: 'Open detailed case views, inspect audit timelines and structured JSON payloads.',
              icon: 'Inbox',
            },
            {
              path: '/complaints/:id',
              name: 'Complaint Detail & Audit Views',
              purpose: 'In-depth case investigation across 6 analytical tabs.',
              canSee: 'Overview, Conversation, Comparison, Response, Structured JSON, and History.',
              canDo: 'Run dual analysis, inspect attachment evidence, view immutable audit logs.',
              icon: 'FileText',
            },
            {
              path: '/knowledge',
              name: 'Knowledge Base',
              purpose: 'Reference approved company policies and standard operating procedures.',
              canSee: 'Policy texts, section codes, effective dates, and document chunks.',
              canDo: 'Search policies to verify rule interpretations and cite clauses.',
              icon: 'BookOpen',
            },
          ],
        },
      },
      {
        stepId: 'rev-04',
        stepNumber: '04',
        title: 'Functionalities & Review Actions',
        subtitle: 'Precision Human Oversight Actions',
        category: 'features',
        content: {
          lead: 'Reviewers possess a rich set of oversight controls to validate, adjust, or override AI outputs.',
          crudActions: [
            {
              action: 'Approve Decision',
              target: 'Review Queue Item',
              description: 'Validates the current triage and recommendation; releases the case to front-line agents for customer dispatch.',
              kind: 'review',
            },
            {
              action: 'Modify Decision',
              target: 'Complaint Classification',
              description: 'Adjusts category, subcategory, urgency, priority, or department while keeping original outputs in the audit log.',
              kind: 'update',
            },
            {
              action: 'Refine Customer Response',
              target: 'Approved Response Letter',
              description: 'Edits the AI-drafted reply letter directly in the modify panel before it is presented to the agent.',
              kind: 'update',
            },
            {
              action: 'Reclassify & Reassign',
              target: 'Routing Engine',
              description: 'Reassigns the case to an alternative department or taxonomy category with explicit reasoning.',
              kind: 'update',
            },
            {
              action: 'Escalate to Supervisor',
              target: 'Senior Leadership',
              description: 'Elevates high-risk, legal, or severe safety cases directly into the mandatory escalation channel.',
              kind: 'review',
            },
            {
              action: 'Regenerate Analysis',
              target: 'Dual Pipelines',
              description: 'Triggers fresh execution of GenAI and Python pipelines if new evidence or context has been uploaded.',
              kind: 'create',
            },
          ],
        },
      },
      {
        stepId: 'rev-05',
        stepNumber: '05',
        title: 'End-to-End Reviewer Workflow',
        subtitle: 'The Human-in-the-Loop Audit Cycle',
        category: 'workflow',
        content: {
          lead: 'Reviewers follow a disciplined verification workflow to resolve discrepancies and certify case decisions.',
          workflowNodes: [
            {
              step: 1,
              title: 'Sign In & Check Queue',
              action: 'Open /review',
              detail: 'Selects the highest-priority pending case from the review queue.',
              icon: 'UserRoundCheck',
            },
            {
              step: 2,
              title: 'Inspect Side-by-Side Comparison',
              action: 'Compare AI vs Python',
              detail: 'Examines category, urgency, policy cited, and eligibility checks between Pipeline 1 & Pipeline 2.',
              icon: 'Scale',
            },
            {
              step: 3,
              title: 'Review Evidence & Attachments',
              action: 'Verify Facts',
              detail: 'Checks customer invoices, photo attachments, and prompt injection safety flags.',
              icon: 'FileText',
            },
            {
              step: 4,
              title: 'Execute Review Action',
              action: 'Approve or Modify',
              detail: 'Approves aligned cases, or clicks "Modify" to rectify category, urgency, or response draft.',
              icon: 'PencilLine',
            },
            {
              step: 5,
              title: 'Document Reasoning',
              action: 'Audit Trail Entry',
              detail: 'Submits reviewer note explaining the change; system logs audit record and notifies the assigned agent.',
              icon: 'ShieldCheck',
            },
          ],
        },
      },
      {
        stepId: 'rev-06',
        stepNumber: '06',
        title: 'Role Permissions & Access Boundaries',
        subtitle: 'Reviewer Authority & Deliberate Restrictions',
        category: 'permissions',
        content: {
          lead: 'Reviewers have deep audit and modification powers for complaints, while executive analytics and system settings are fenced.',
          permissions: {
            canAccess: [
              { title: 'Manual Review Queue (/review)', desc: 'Complete authority to approve, reject, modify, and reclassify complaints.' },
              { title: 'All Complaints & Case History', desc: 'Can inspect any complaint, audit log, structured JSON, and customer message.' },
              { title: 'Response Draft Editing', desc: 'Can edit customer-facing resolution letters before front-line agents send them.' },
              { title: 'Knowledge Base Verification', desc: 'Can read and search all policies, SOPs, and document chunks.' },
              { title: 'Re-Analyze Complaints', desc: 'Can trigger dual-pipeline re-analysis with custom tone parameters.' },
            ],
            cannotAccess: [
              { title: 'Workspace Settings (/settings)', reason: 'Cannot modify system threshold rules, API keys, SLA matrices, or user accounts.' },
              { title: 'Operational Analytics (/reports)', reason: 'High-level executive reporting and financial metrics are reserved for Managers and Admins.' },
              { title: 'Batch Evaluation (/evaluation)', reason: 'Hidden test pack import and batch testing suites are limited to Managers and Admins.' },
              { title: 'Knowledge Base Uploads', reason: 'Uploading new regulatory documents or changing policy status is an Administrator privilege.' },
            ],
          },
        },
      },
      {
        stepId: 'rev-07',
        stepNumber: '07',
        title: 'Role Completion & Quality Guarantee',
        subtitle: 'Reviewer Tour Complete',
        category: 'summary',
        content: {
          lead: 'You have explored the Reviewer role — the human-in-the-loop guardian protecting customer trust, policy compliance, and AI accuracy.',
          description: 'Reviewers turn potential AI errors into audited, verified resolutions that agents can execute with total confidence.',
          stats: [
            { label: 'Role Authority', value: 'Tier 3 (Oversight)' },
            { label: 'Key Page', value: '/review' },
            { label: 'Audit Impact', value: '100% Traceable' },
          ],
        },
      },
    ],
  },

  agent: {
    role: 'agent',
    title: 'Agent',
    tagline: 'Customer Resolution Specialist & Front-Line Responder',
    badgeColor: '#10b981',
    themeTone: 'emerald',
    icon: 'Inbox',
    overview: {
      responsibilities: [
        'Triage, manage, and resolve customer complaints efficiently and empathetically',
        'Pick complaints from the unassigned queue and manage personal assignment workload',
        'Execute dual-pipeline AI intelligence analysis on customer submissions',
        'Review AI-generated response drafts, guidance notes, and mandatory rule matrix actions',
        'Communicate directly with customers via real-time messaging threads',
        'Update complaint progress status with customer-visible update notes',
        'Ensure resolution milestones are achieved before SLA windows expire',
      ],
      primaryGoal: 'Deliver fast, empathetic, and policy-compliant complaint resolutions while keeping customers informed at every stage.',
      interactionSummary: 'Interacts directly with Customers via messages, executes recommendations verified by Reviewers, and consults the AI Assistant for policy guidance.',
    },
    steps: [
      {
        stepId: 'agt-01',
        stepNumber: '01',
        title: 'Role Overview & Responsibilities',
        subtitle: 'Front-Line Customer Support & Case Resolution',
        category: 'overview',
        content: {
          lead: 'Support Agents are the primary operators of SupportNova, working directly with customers to resolve grievances, authorize replacements, and issue refunds.',
          description: 'Agents are augmented with dual-pipeline AI intelligence: GenAI writes empathetic, tailored replies while Python enforces strict business policies, eligibility rules, and mandatory actions.',
          highlights: [
            {
              icon: 'Inbox',
              title: 'Personal Case Queue',
              desc: 'Dedicated workspace highlighting cases "Assigned to me", alongside the live unassigned queue.',
              badge: 'Workload',
            },
            {
              icon: 'Sparkles',
              title: 'AI Dual-Pipeline Analysis',
              desc: 'One-click intelligence analysis generating categorized recommendations, sentiment analysis, and response drafts.',
              badge: 'Productivity',
            },
            {
              icon: 'MessageSquareText',
              title: 'Direct Customer Messaging',
              desc: 'Real-time conversation thread with customers, preloaded with policy-grounded drafts.',
              badge: 'Communication',
            },
            {
              icon: 'Clock3',
              title: 'SLA Target Management',
              desc: 'Live countdown meters tracking first response and final resolution deadlines.',
              badge: 'Compliance',
            },
          ],
        },
      },
      {
        stepId: 'agt-02',
        stepNumber: '02',
        title: 'Agent Workspace Dashboard',
        subtitle: 'Personal Case Queues & Priority Workload',
        category: 'dashboard',
        content: {
          lead: 'When an Agent logs in, the dashboard dynamically adapts to prioritize their personal assigned workload and available unassigned cases.',
          description: 'Agents immediately see which cases require urgent follow-up and which cases can be claimed from the queue.',
          stats: [
            { label: 'Assigned to Me', value: 'Live Workload', note: 'Cases owned by the active agent' },
            { label: 'Unassigned Queue', value: 'Open Cases', note: 'Cases awaiting agent assignment' },
            { label: 'SLA Countdown', value: 'Monitored', note: 'Tracking time until next required action' },
            { label: 'Escalation Warnings', value: 'Highlighted', note: 'Mandatory escalations requiring supervisor attention' },
          ],
          highlights: [
            {
              icon: 'CheckCircle2',
              title: 'Assigned to Me Table',
              desc: 'Quick table listing assigned cases with category, priority badge, sentiment, and verification status.',
            },
            {
              icon: 'Inbox',
              title: 'Unassigned Queue Table',
              desc: 'New intake cases ready to be claimed with a single "Assign to me" click.',
            },
            {
              icon: 'ShieldAlert',
              title: 'Escalation Warnings Panel',
              desc: 'Flags cases that must not be left un-escalated due to policy or repeat history.',
            },
          ],
        },
      },
      {
        stepId: 'agt-03',
        stepNumber: '03',
        title: 'Accessible Pages & Modules',
        subtitle: 'Case Resolution & Communication Route Access',
        category: 'pages',
        content: {
          lead: 'Agents have access to everything required to triage, investigate, communicate, and resolve customer complaints.',
          pages: [
            {
              path: '/',
              name: 'Agent Dashboard',
              purpose: 'Workload management and quick triage queues.',
              canSee: 'Assigned cases, unassigned queue, escalation warnings, recent complaints.',
              canDo: 'Click into cases, monitor SLA urgency, pick new cases to resolve.',
              icon: 'LayoutDashboard',
            },
            {
              path: '/complaints',
              name: 'Complaints Directory',
              purpose: 'Global complaint repository scoped to authorized staff visibility.',
              canSee: 'All unassigned complaints and complaints assigned to this agent.',
              canDo: 'Search by complaint ID, customer name, order number; filter by category/priority.',
              icon: 'Inbox',
            },
            {
              path: '/complaints/new',
              name: 'New Complaint Intake',
              purpose: 'File a complaint on behalf of a customer calling in or writing in.',
              canSee: '3-step intake form with customer code lookup and document attachment upload.',
              canDo: 'Fill complaint details, attach evidence, submit for immediate dual-pipeline triage.',
              icon: 'Plus',
            },
            {
              path: '/complaints/:id',
              name: 'Complaint Workstation',
              purpose: 'The central hub for resolving an individual complaint.',
              canSee: '6 tabs: Overview, Conversation, Comparison, Response, Structured JSON, History.',
              canDo: 'Analyze complaint, select response tone, update status, send customer messages.',
              icon: 'FileText',
            },
            {
              path: '/knowledge',
              name: 'Knowledge Base',
              purpose: 'Consult approved policy clauses, refund rules, and warranty terms.',
              canSee: 'All published policy documents, section codes, and traceable text chunks.',
              canDo: 'Search keywords, copy policy citations to justify customer decisions.',
              icon: 'BookOpen',
            },
          ],
        },
      },
      {
        stepId: 'agt-04',
        stepNumber: '04',
        title: 'Functionalities & Resolution Actions',
        subtitle: 'Daily Case Handling & Communication Controls',
        category: 'features',
        content: {
          lead: 'Agents utilize powerful AI-assisted tools to investigate claims, communicate resolutions, and close complaints.',
          crudActions: [
            {
              action: 'Claim Case',
              target: 'Unassigned Queue',
              description: 'Assigns an open case to the current agent with a single click, locking ownership.',
              kind: 'update',
            },
            {
              action: 'Run Dual Analysis',
              target: 'AI & Python Engines',
              description: 'Triggers GenAI response generation with tone selection (professional, empathetic, direct) and Python ground truth.',
              kind: 'create',
            },
            {
              action: 'Update Status & Customer Note',
              target: 'Complaint Lifecycle',
              description: 'Transitions complaint (in_investigation, waiting_on_customer, resolved) and writes a note shown to the customer.',
              kind: 'update',
            },
            {
              action: 'Send Customer Message',
              target: 'Conversation Thread',
              description: 'Sends messages directly into the customer portal, pre-populating AI or Reviewer-approved response letters.',
              kind: 'create',
            },
            {
              action: 'Upload Supporting Evidence',
              target: 'Case Attachments',
              description: 'Uploads repair receipts, courier proofs, or diagnostic logs up to 15 MB each.',
              kind: 'create',
            },
            {
              action: 'Consult Nova AI Assistant',
              target: 'Floating Assistant',
              description: 'Asks contextual questions about "this case" directly to the grounded conversational assistant.',
              kind: 'read',
            },
          ],
        },
      },
      {
        stepId: 'agt-05',
        stepNumber: '05',
        title: 'End-to-End Agent Workflow',
        subtitle: 'The Standard Case Resolution Lifecycle',
        category: 'workflow',
        content: {
          lead: 'The Agent moves complaints from initial intake through AI validation to empathetic resolution.',
          workflowNodes: [
            {
              step: 1,
              title: 'Pick Case from Queue',
              action: 'Claim Ownership',
              detail: 'Selects an unassigned complaint from the dashboard and clicks "Assign to me".',
              icon: 'Inbox',
            },
            {
              step: 2,
              title: 'Review Intelligence & Evidence',
              action: 'Inspect Overview Tab',
              detail: 'Reads customer description, checks Python-verified category and eligibility chips (Refund, Replacement).',
              icon: 'ShieldCheck',
            },
            {
              step: 3,
              title: 'Check Policy & Guidance',
              action: 'Inspect Response Tab',
              detail: 'Reviews GenAI drafted letter, mandatory actions (required by policy matrix), and prohibited actions.',
              icon: 'BookOpen',
            },
            {
              step: 4,
              title: 'Message the Customer',
              action: 'Send Response',
              detail: 'Opens Conversation tab; adapts the approved draft; sends reply to customer portal.',
              icon: 'MessageSquareText',
            },
            {
              step: 5,
              title: 'Update Status to Resolved',
              action: 'Mark Resolved',
              detail: 'Selects status "Resolved", writes customer-visible summary note, and prompts customer confirmation.',
              icon: 'CheckCircle2',
            },
          ],
        },
      },
      {
        stepId: 'agt-06',
        stepNumber: '06',
        title: 'Role Permissions & Access Boundaries',
        subtitle: 'Front-Line Privileges & Clear Scope Limits',
        category: 'permissions',
        content: {
          lead: 'Agents have full capability to resolve cases while system settings and review queue overrides remain safeguarded.',
          permissions: {
            canAccess: [
              { title: 'Triage & Resolve Assigned Cases', desc: 'Full authority to work assigned complaints and claim unassigned tickets.' },
              { title: 'Execute Dual-Pipeline Analysis', desc: 'Can run and re-run AI and Python analysis with custom tone selection.' },
              { title: 'Customer Messaging & Notes', desc: 'Can post messages and update public progress notes on active cases.' },
              { title: 'Knowledge Base Browsing', desc: 'Can search and inspect all published company policies in /knowledge.' },
              { title: 'Attach Evidence Documents', desc: 'Can upload documents and images to case records.' },
            ],
            cannotAccess: [
              { title: 'Manual Review Queue (/review)', reason: 'Review queue sign-offs are restricted to Reviewers, Managers, and Admins.' },
              { title: 'Workspace Settings (/settings)', reason: 'Configuration of prompt templates, rules, and users requires Administrator access.' },
              { title: 'Executive Reports (/reports)', reason: 'Cross-department analytics and bulk financial exports require Manager/Admin privileges.' },
              { title: 'Evaluation Engine (/evaluation)', reason: 'Batch testing of hidden benchmark packs is restricted to Managers and Admins.' },
              { title: 'Cases Assigned to Other Agents', reason: 'Row-level security prevents modifying tickets explicitly assigned to colleagues.' },
            ],
          },
        },
      },
      {
        stepId: 'agt-07',
        stepNumber: '07',
        title: 'Role Completion & Customer Impact',
        subtitle: 'Agent Tour Complete',
        category: 'summary',
        content: {
          lead: 'You have explored the Agent role — turning complex disputes into satisfied customers with the support of AI and ground truth.',
          description: 'Agents provide the human empathy and problem-solving touch that transforms difficult situations into brand loyalty.',
          stats: [
            { label: 'Role Authority', value: 'Tier 4 (Front-Line)' },
            { label: 'Core Mission', value: 'Fast Resolution' },
            { label: 'AI Assistance', value: 'Dual-Pipeline' },
          ],
        },
      },
    ],
  },

  customer: {
    role: 'customer',
    title: 'Customer',
    tagline: 'End-User, Product Consumer & Support Beneficiary',
    badgeColor: '#3b82f6',
    themeTone: 'blue',
    icon: 'Package',
    overview: {
      responsibilities: [
        'Browse certified hardware catalog with quick-support launch capability',
        'Inspect order history, copy verified order references, and download official invoices',
        'Submit verified complaints with order references, incident dates, and evidence files',
        'Track complaint status, assigned department, and latest updates in real time',
        'Communicate directly with the support team through a dedicated message thread',
        'Confirm resolution satisfaction with a 5-star CSAT rating, or reopen unresolved issues',
      ],
      primaryGoal: 'Experience transparent, fast, and verified support with complete visibility into orders, complaints, and official documents.',
      interactionSummary: 'Files complaints linked to verified orders/products, receives updates from Agents, and provides feedback to close the support loop.',
    },
    steps: [
      {
        stepId: 'cust-01',
        stepNumber: '01',
        title: 'Role Overview & Customer Journey',
        subtitle: 'Empowered Self-Service & Transparent Support',
        category: 'overview',
        content: {
          lead: 'Customers experience a clean, modern portal designed for complete transparency across purchases, invoices, and support cases.',
          description: 'SupportNova guarantees that customers always know who is handling their case, what the latest update is, and when their resolution is due.',
          highlights: [
            {
              icon: 'Package',
              title: 'Products Catalog',
              desc: 'Explore 12 certified hardware products with instant "File complaint" actions prefilling verified details.',
              badge: 'Catalog',
            },
            {
              icon: 'History',
              title: 'Order History & Invoices',
              desc: 'Review past orders, view receipts, and download official PDF or PNG image invoices directly.',
              badge: 'Purchases',
            },
            {
              icon: 'Inbox',
              title: 'My Complaints Tracking',
              desc: 'Live tracking of all submitted cases with status badges, assigned departments, and latest update notes.',
              badge: 'Support',
            },
            {
              icon: 'Star',
              title: 'CSAT Rating & Reopen Control',
              desc: 'Confirm case resolution with a 1-to-5 star rating or reopen the complaint if the problem persists.',
              badge: 'Empowerment',
            },
          ],
        },
      },
      {
        stepId: 'cust-02',
        stepNumber: '02',
        title: 'Customer Support Journey Dashboard',
        subtitle: 'Personalized Support Overview & Milestone Tracking',
        category: 'dashboard',
        content: {
          lead: 'The Customer Dashboard greets the user by name and summarizes their active cases with clear metrics.',
          description: 'Designed for ease of use without cluttered internal jargon, keeping customers reassured.',
          stats: [
            { label: 'Total Complaints', value: 'Submitted', note: 'All cases filed by this customer' },
            { label: 'Open Cases', value: 'Active', note: 'Currently being worked on by support' },
            { label: 'Resolved Cases', value: 'Closed', note: 'Successfully resolved or closed' },
          ],
          highlights: [
            {
              icon: 'Plus',
              title: 'New Complaint Quick-Action',
              desc: 'Prominent header action to file a new support case anytime in under 60 seconds.',
            },
            {
              icon: 'Clock3',
              title: 'Latest Update Column',
              desc: 'Shows the exact note left by support staff describing current progress.',
            },
            {
              icon: 'ArrowRight',
              title: 'Direct Case Access',
              desc: 'Click any row to open the complete case timeline, document list, and chat.',
            },
          ],
        },
      },
      {
        stepId: 'cust-03',
        stepNumber: '03',
        title: 'Accessible Customer Pages',
        subtitle: 'Customer-Facing Portal Modules',
        category: 'pages',
        content: {
          lead: 'The customer portal features four purpose-built routes providing full self-service power.',
          pages: [
            {
              path: '/',
              name: 'Support Journey (Overview)',
              purpose: 'Track open and resolved cases at a glance.',
              canSee: 'Total complaint counts, open status, resolved metrics, and recent complaint table.',
              canDo: 'Initiate new complaint, click through to complaint detail.',
              icon: 'LayoutDashboard',
            },
            {
              path: '/products',
              name: 'Certified Products Catalog',
              purpose: 'Browse official hardware and launch prefilled cases.',
              canSee: '12 certified electronic products, prices, reference codes, category tabs, and specs.',
              canDo: 'Filter by category, search by name/SKU, click "File complaint" to prefill order ref.',
              icon: 'Package',
            },
            {
              path: '/orders',
              name: 'Order History & Purchase Receipts',
              purpose: 'Inspect past orders and download official purchase invoices.',
              canSee: 'Verified order cards, items purchased, totals, dates, and order numbers.',
              canDo: 'Copy order number, view modal receipt, download official PDF or Image PNG invoice, file order complaint.',
              icon: 'History',
            },
            {
              path: '/complaints/new',
              name: '3-Step Complaint Submission Wizard',
              purpose: 'Structured intake ensuring the support team has all needed facts.',
              canSee: 'Step 1 (Core details), Step 2 (Preferences & files), Step 3 (Review & confirm).',
              canDo: 'Upload documents/photos up to 15 MB, review summary, submit ticket.',
              icon: 'Plus',
            },
            {
              path: '/complaints/:id',
              name: 'Customer Case Tracker & Chat',
              purpose: 'Follow investigation progress and message the team.',
              canSee: 'Latest update note, target resolution time, attached evidence, support chat thread.',
              canDo: 'Send messages, confirm resolution + submit CSAT rating, or reopen with explanation.',
              icon: 'MessageSquareText',
            },
          ],
        },
      },
      {
        stepId: 'cust-04',
        stepNumber: '04',
        title: 'Functionalities & Customer Actions',
        subtitle: 'Self-Service, Communication & Feedback Controls',
        category: 'features',
        content: {
          lead: 'Customers have intuitive controls to interact with their orders, invoices, and support staff.',
          crudActions: [
            {
              action: 'Submit Support Complaint',
              target: 'New Complaint Wizard',
              description: 'Files a verified complaint with title, description, order reference, requested resolution, and files.',
              kind: 'create',
            },
            {
              action: 'Download Official Invoice',
              target: 'Order Receipts',
              description: 'Generates and downloads official purchase invoices in PDF or high-resolution PNG image format.',
              kind: 'export',
            },
            {
              action: 'Chat with Support Team',
              target: 'Case Conversation',
              description: 'Exchanges real-time messages with assigned support agents regarding the active issue.',
              kind: 'create',
            },
            {
              action: 'Confirm Resolution & Rate CSAT',
              target: 'Satisfaction Rating',
              description: 'Confirms that the issue is resolved and rates satisfaction from 1 to 5 stars to close the ticket.',
              kind: 'update',
            },
            {
              action: 'Reopen Unresolved Complaint',
              target: 'Complaint Reopening',
              description: 'Reopens a closed or resolved complaint with a detailed explanation if the issue reoccurs.',
              kind: 'update',
            },
            {
              action: 'Consult Floating AI Assistant',
              target: 'Nova Assistant',
              description: 'Asks questions about products, returns, or warranty terms through the interactive chatbot.',
              kind: 'read',
            },
          ],
        },
      },
      {
        stepId: 'cust-05',
        stepNumber: '05',
        title: 'End-to-End Customer Workflow',
        subtitle: 'The Customer Experience from Purchase to Resolution',
        category: 'workflow',
        content: {
          lead: 'The Customer workflow connects verified purchases directly to fast, transparent problem resolution.',
          workflowNodes: [
            {
              step: 1,
              title: 'Browse Orders or Products',
              action: 'Locate Purchase',
              detail: 'Opens /orders or /products to find the relevant order reference or hardware item.',
              icon: 'History',
            },
            {
              step: 2,
              title: 'Initiate Support Ticket',
              action: 'Pre-Filled Complaint',
              detail: 'Clicks "File complaint" or "Get help with this order" to prefill order reference numbers automatically.',
              icon: 'Plus',
            },
            {
              step: 3,
              title: 'Complete 3-Step Wizard',
              action: 'Submit with Evidence',
              detail: 'Describes the defect, attaches photos or receipts, reviews summary, and submits.',
              icon: 'Send',
            },
            {
              step: 4,
              title: 'Track Progress & Chat',
              action: 'Real-Time Engagement',
              detail: 'Monitors status updates on the dashboard and communicates with the support agent in the chat thread.',
              icon: 'MessageSquareText',
            },
            {
              step: 5,
              title: 'Close & Rate Satisfaction',
              action: 'CSAT Sign-Off',
              detail: 'When resolved, verifies fix, awards a 1-5 star CSAT rating, or reopens if dissatisfied.',
              icon: 'Star',
            },
          ],
        },
      },
      {
        stepId: 'cust-06',
        stepNumber: '06',
        title: 'Role Permissions & Access Boundaries',
        subtitle: 'Privacy Protection & Strict Isolation Boundaries',
        category: 'permissions',
        content: {
          lead: 'SupportNova enforces strict row-level isolation so Customers can ONLY see their own data and complaints.',
          permissions: {
            canAccess: [
              { title: 'Personal Complaints & Order History', desc: 'Can access and search only complaints and orders linked to their customer ID.' },
              { title: 'Product Catalog & Invoice Downloads', desc: 'Can browse certified products and download personal PDF/PNG invoices.' },
              { title: 'Live Staff Messaging Thread', desc: 'Can exchange messages with support staff on their open complaints.' },
              { title: 'Resolution Acceptance & CSAT', desc: 'Can confirm case closure and submit official customer satisfaction ratings.' },
              { title: 'Complaint Reopening Right', desc: 'Can reopen any resolved complaint if the problem was not adequately solved.' },
            ],
            cannotAccess: [
              { title: 'Other Customers\' Complaints', reason: 'Strict row-level database filtering ensures complete isolation between customers.' },
              { title: 'Internal Staff Tabs (/settings, /reports, etc.)', reason: 'Customer navigation is locked to consumer pages; internal tools return 403 / redirect.' },
              { title: 'Internal AI Prompts & Raw Policy JSON', reason: 'Internal agent guidance, prohibited action matrices, and raw prompts are hidden.' },
              { title: 'Internal Review Queues', reason: 'Human oversight queues and reviewer modification tools are strictly staff-only.' },
            ],
          },
        },
      },
      {
        stepId: 'cust-07',
        stepNumber: '07',
        title: 'Role Completion & End-to-End Synergy',
        subtitle: 'Customer Tour Complete',
        category: 'summary',
        content: {
          lead: 'You have explored the Customer role — the ultimate beneficiary of SupportNova\'s dual-pipeline intelligence architecture.',
          description: 'Every internal rule, SLA threshold, and review check exists to give this customer a fast, fair, and verified resolution.',
          stats: [
            { label: 'Role Authority', value: 'Customer Portal' },
            { label: 'Privacy Isolation', value: '100% Strict RBAC' },
            { label: 'Key Innovation', value: 'Invoice + Complaint Linking' },
          ],
        },
      },
    ],
  },
}

export const SYSTEM_TOUR_SUMMARY = {
  totalRoles: 5,
  totalModules: 10,
  accessibleRoutes: 12,
  corePipelines: 2,
  architecture: 'Dual-Pipeline: GenAI Writer + Deterministic Python Ground Truth',
  keyHighlights: [
    { title: 'No Hallucinations', desc: 'Python deterministic rules and policy chunk citations override and validate AI draft outputs.' },
    { title: 'Human-in-the-Loop', desc: 'Reviewers resolve mismatches, adversarial prompt injections, and ambiguous claims before release.' },
    { title: 'Zero-Downtime Governance', desc: 'Administrators tweak thresholds, rules, SLAs, and prompt versions live from /settings.' },
    { title: 'Customer-Centric Flow', desc: 'Direct linking from certified products and purchase invoices into 3-step complaint triage.' },
  ],
}
