export type Role = 'customer' | 'agent' | 'reviewer' | 'manager' | 'administrator'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  is_active: boolean
}

export interface ComplaintIntelligence {
  complaint_id?: string
  primary_issue?: string
  secondary_issues?: string[]
  issue_category?: string
  subcategory?: string
  sentiment?: string
  emotion_indicators?: string[]
  urgency?: string
  priority?: string
  department?: string
  supporting_departments?: string[]
  policy_id?: string
  policy_section?: string
  resolution_steps?: string[]
  escalation_required?: boolean
  escalation_level?: string
  escalation_reason?: string
  customer_response?: string
  complaint_summary?: string
  agent_guidance?: string[]
  missing_information?: string[]
  prompt_injection?: { detected: boolean; patterns?: string[] }
}

export interface Complaint {
  id: number
  complaint_code: string
  title: string
  description: string
  status: string
  product_or_service: string
  order_reference: string
  customer_type: string
  channel?: string
  latest_update: string
  sla_risk: boolean
  sla_resolution_due?: string
  follow_up_at?: string
  is_repeat: boolean
  is_adversarial?: boolean
  assigned_department_id?: number
  assigned_to_id?: number
  created_at: string
  genai?: ComplaintIntelligence | null
  python?: ComplaintIntelligence | null
  flags?: Array<Record<string, unknown>>
  verification_score?: number | null
  requires_manual_review?: boolean | null
  comparison?: {
    fields?: Record<string, { genai: unknown; python: unknown; match: boolean }>
    status?: string
    explanation?: string
  } | null
  genai_meta?: {
    provider: string
    model: string
    prompt_version: string
    attempt: number
    error: string
  } | null
}

export interface Metrics {
  total: number
  statuses: Record<string, number>
  categories: Record<string, number>
  departments: Record<string, number>
  priorities: Record<string, number>
  sentiments: Record<string, number>
  escalations: number
  sla_risks: number
  genai_python_mismatches: number
  manual_review_cases: number
  repeat_complaints: number
}

export interface Department {
  id: number
  code: string
  name: string
}

export interface KnowledgeDocument {
  id: number
  document_code: string
  title: string
  version: string
  category: string
  status: string
  effective_date?: string
  expiry_date?: string
  chunk_count: number
}

export interface ComplaintDraft {
  title: string
  description: string
  product_or_service: string
  order_reference: string
  previous_complaint_reference: string
  customer_type: string
  preferred_contact_channel: string
  requested_resolution: string
}
