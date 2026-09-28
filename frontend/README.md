# SupportNova — Frontend Intelligence Workspace

A high-performance, responsive React 19 web application engineered for the **SupportNova** Generative AI Complaint Intelligence platform. Built with Vite, TypeScript, Zustand, and Tailwind-free modern Vanilla CSS design systems with glassmorphic aesthetics.

---

## 🌟 Key Highlights & Features

### 1. 🔐 Premium Authentication & Self-Registration
- **Dual-Mode Login & Signup**:
  - Secure login supporting 5 enterprise roles (Customer, Agent, Reviewer, Manager, Administrator) plus Quick-Demo Profile selection.
  - **Glassmorphic Signup Modal**: Dedicated modal dialog with backdrop blur, smooth entrance animations, real-time client-side validation (email format, 8+ character password, confirmation match), password visibility toggles, and duplicate email error handling.
  - **Seamless Flow**: Post-signup automatic pre-fill on login card with feedback toast and direct redirection to the customer's isolated panel.
- **Account & Data Isolation**:
  - Each customer sees exclusively their own complaints, timeline tracking, and messages.

### 2. 👥 Role-Based Workspaces & Dashboards
- **Customer Portal**:
  - 4-step interactive complaint submission wizard with drag-and-drop attachments.
  - Case tracking timeline, real-time status updates, SLA indicators, and messaging thread.
  - Post-resolution CSAT 5-star rating and case reopening capabilities.
- **Support Agent Panel**:
  - Real-time complaint triage queue with advanced multi-facet filters (category, priority, urgency, SLA risk, department).
  - Side-by-side Dual Pipeline inspector: GenAI draft vs. Deterministic Python Rule Matrix ground truth.
  - Guarded customer messaging with automated policy & promise compliance blocker.
- **Reviewer Queue**:
  - 8 SRS review actions: Approve, Reject, Modify, Reclassify, Reassign, Escalate, Regenerate, and Comment.
  - Batch re-analysis workbench when company policies are modified.
- **Manager Intelligence**:
  - Multi-dimensional analytics dashboards with interactive Recharts visualizations (Volume Trends, Category Distributions, SLA Adherence, CSAT Ratings).
  - Multi-format report exports (CSV, XLSX, PDF).
- **Administrator Console**:
  - Dynamic rule matrix manager (create, toggle, edit keywords and criteria).
  - Department taxonomy, SLA policy configuration, and live threshold tuners.
  - Knowledge Base document ingestion with change-impact diffing.

### 3. 🤖 Nova AI Floating Copilot
- Context-aware floating assistant accessible across all pages.
- Grounded policy QA with numbered document citations.
- Staff capabilities: case summarization, similar complaint search, and policy-safe reply drafting.
- Multi-layer guardrails preventing prompt injection and leaking private customer data.

### 4. 🎨 Design System & Theme Engine
- **Obsidian Dark Mode**: Deep black and indigo glassmorphism with high-contrast accent highlights.
- **Clean Light Mode**: Crisp mint and teal interface tailored for daytime productivity.
- **Responsive Layout**: Designed for seamless usage across smartphones, tablets, and 4K desktop monitors.
- **System Tour Modal & Interactive Guide**: Built-in interactive walkthrough explaining system architecture and role responsibilities.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | Modern UI framework with hooks and functional components |
| **TypeScript** | Strict compile-time type safety across API schemas and components |
| **Vite 8** | Ultra-fast HMR and optimized production bundling |
| **Zustand** | Centralized client state management (Auth, Session, Theme, Navigation) |
| **React Router v6** | Declarative client-side SPA routing and route guards |
| **Recharts** | Interactive charts (Area, Bar, Pie, Scatter, Cartesian plots) |
| **Lucide React** | Clean, accessible iconography |
| **Sonner** | Modern customizable toast notification system |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm** / **yarn**

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the `frontend` root:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000
   ```
   *(For production deployments, point this to your hosted backend API URL).*

4. Start Development Server:
   ```bash
   npm run dev
   ```
   The application will be live at `http://localhost:5173`.

---

## 📦 Build & Deployment

### Production Build
To type-check and generate an optimized production bundle in `dist/`:
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Deploying to Vercel
The frontend is pre-configured with `vercel.json` for single-page application (SPA) routing rewrites:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```
Simply connect your repository to Vercel, set the build command to `npm run build` and output directory to `dist`.

---

## 📁 Project Structure

```
frontend/
├── public/                 # Static assets and icons
├── src/
│   ├── api.ts              # Typed API client, endpoints, and error handling
│   ├── types.ts            # Domain TypeScript interfaces (Complaints, Users, Policies)
│   ├── store.ts            # Zustand global state (Auth, Theme, Session, Notifications)
│   ├── ui.tsx              # Reusable UI primitives (Buttons, Badges, Metrics, Panels)
│   ├── SupportNovaApp.tsx  # Main application routing, AppShell, and core page views
│   ├── SignupModal.tsx     # Self-contained glassmorphic Customer Registration modal
│   ├── signup-modal.css    # Dedicated styling and animations for Signup Modal
│   ├── Assistant.tsx       # Nova floating AI assistant drawer
│   ├── Engagement.tsx      # Customer messaging, timeline, and CSAT rating widgets
│   ├── TeamPage.tsx        # System engineering team overview
│   ├── SystemTourModal.tsx # Role-based project tour and architecture explainer
│   ├── CategoryOverviewStats.tsx # Analytics widget
│   ├── index.css           # Global CSS variables, reset, and base styles
│   ├── supportnova-ai-theme.css    # Obsidian Dark mode tokens and glass styles
│   └── supportnova-light-theme.css # Clean Mint/Teal Light mode tokens
├── vercel.json             # Vercel SPA deployment configuration
├── vite.config.ts          # Vite configuration
└── package.json            # Project dependencies and build scripts
```

---

## 🔐 Demo Credentials

Quickly test different role perspectives using the built-in demo profiles on the login page:

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@supportnova.example` | `ChangeMeNow!23` |
| **Support Agent** | `agent@supportnova.example` | `AgentPass!23` |
| **Reviewer** | `reviewer@supportnova.example` | `ReviewPass!23` |
| **Manager** | `manager@supportnova.example` | `ManagerPass!23` |
| **Customer** | `customer@supportnova.example` | `CustomerPass!23` |

*Or click **"Sign Up"** to create a fresh customer account with instant multi-tenant data isolation.*
