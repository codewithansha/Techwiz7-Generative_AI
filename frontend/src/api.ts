import type {
  Complaint,
  ComplaintDraft,
  Department,
  KnowledgeDocument,
  Metrics,
  User,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('supportnova_token')
  const isForm = options.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      detail = Array.isArray(payload.detail) ? payload.detail.join(' ') : payload.detail || detail
    } catch {
      // Keep the status-based message when the response has no JSON body.
    }
    if (response.status === 401) {
      localStorage.removeItem('supportnova_token')
      localStorage.removeItem('supportnova_role')
    }
    throw new ApiError(response.status, detail)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return response as unknown as T
  return response.json() as Promise<T>
}

export const api = {
  async login(email: string, password: string) {
    const payload = await request<{ access_token: string; role: string }>('/api/v1/auth/login-json', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('supportnova_token', payload.access_token)
    localStorage.setItem('supportnova_role', payload.role)
    return payload
  },
  me: () => request<User>('/api/v1/auth/me'),
  complaints: (query = '') => request<Complaint[]>(`/api/v1/complaints${query}`),
  complaint: (id: number) => request<Complaint>(`/api/v1/complaints/${id}`),
  submitComplaint: (draft: ComplaintDraft) =>
    request<{ complaint: Complaint; near_duplicate: boolean; near_duplicate_of?: string }>('/api/v1/complaints', {
      method: 'POST',
      body: JSON.stringify(draft),
    }),
  analyze: (id: number, tone = 'professional', skipGenAI = false) =>
    request<Record<string, unknown>>(`/api/v1/complaints/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ tone, skip_genai: skipGenAI }),
    }),
  updateStatus: (id: number, status: string, note = '') =>
    request<Complaint>(`/api/v1/complaints/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),
  review: (id: number, action: string, comments: string, finalDecision = {}) =>
    request<Complaint>(`/api/v1/complaints/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, comments, final_decision: finalDecision }),
    }),
  manualReview: () => request<Complaint[]>('/api/v1/complaints/queue/manual-review'),
  adminMetrics: () => request<Metrics>('/api/v1/dashboards/admin'),
  analytics: () => request<Metrics>('/api/v1/analytics'),
  agentDashboard: () =>
    request<{ assigned: Complaint[]; queue: Complaint[]; escalation_warnings: Complaint[] }>(
      '/api/v1/dashboards/agent',
    ),
  customerDashboard: () =>
    request<Array<Record<string, unknown>>>('/api/v1/dashboards/customer'),
  departments: () => request<Department[]>('/api/v1/config/departments'),
  documents: () => request<KnowledgeDocument[]>('/api/v1/knowledge-base/documents'),
  uploadDocument: (form: FormData) =>
    request<{ id: number; document_code: string; chunks: number; affected_open_complaints: number }>(
      '/api/v1/knowledge-base/documents',
      { method: 'POST', body: form },
    ),
  downloadReport: async (format: 'csv' | 'xlsx' | 'pdf') => {
    const token = localStorage.getItem('supportnova_token')
    const response = await fetch(`${API_URL}/api/v1/reports/export?fmt=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new ApiError(response.status, 'Could not export report')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `supportnova-report.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  },
}

export { ApiError, API_URL }
