# SwiftTrak - Crisis Management System

A comprehensive crisis management tool designed for handling complex incidents like petrochemical plant emergencies. Built with Next.js 14, Supabase, and TypeScript.

## Features

### Core Functionality
- **Dashboard** - Real-time overview with workstream progress, action statistics, and threat summaries
- **Actions Management** - Track tasks with owners, status, priority levels, due dates, status updates, and full audit trail
- **Threats Register** - Monitor risks with mitigation plans, risk levels (unmitigated/current/mitigated), and expected delays
- **Technical Queries** - Submit and resolve technical questions with priority-based response times
- **Decision Log** - Document key decisions with rationale and stakeholders
- **Key Milestones** - Track critical project milestones
- **Interactive Gantt Chart** - Visual project timeline with critical path, dependencies, and PERT uncertainty visualization

### User Management
- Role-based access control (Admin, Edit, View)
- Per-workstream permissions
- Admin dashboard for user management
- Stakeholder read-only view with shareable links

### Real-time Collaboration
- Live updates across all entities via Supabase Realtime
- @mentions in comments and updates
- Email notifications via Resend
- In-app notification system

### Export & Reporting
- Excel export with conditional formatting
- PDF export for executive dashboards
- Executive summary dashboard

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **File Storage**: Supabase Storage
- **Email**: Resend
- **Styling**: Tailwind CSS
- **UI Components**: Headless UI
- **State Management**: Zustand
- **Export**: ExcelJS, jsPDF, html2canvas

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase account
- Resend account (for emails)

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database Setup

1. Create a new Supabase project
2. Run the schema file in the Supabase SQL editor:
   ```bash
   # Copy contents of supabase/schema.sql and execute in Supabase dashboard
   ```
3. Enable Realtime for tables that need live updates

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Build for Production

```bash
npm run build
npm start
```

## Deployment on Vercel

1. Connect your repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

The `vercel.json` configuration is included for optimal deployment settings.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── actions/           # Actions management
│   ├── admin/             # Admin dashboard
│   ├── api/               # API routes
│   ├── dashboard/         # Main dashboard
│   ├── decisions/         # Decision log
│   ├── executive/         # Executive dashboard
│   ├── gantt/             # Gantt chart
│   ├── milestones/        # Key milestones
│   ├── queries/           # Technical queries
│   ├── stakeholder/       # Public stakeholder view
│   └── threats/           # Threats register
├── components/            # React components
│   ├── layout/           # Layout components
│   └── ui/               # Reusable UI components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
│   └── supabase/         # Supabase clients
├── stores/                # Zustand stores
└── types/                 # TypeScript types
```

## Database Schema

Key tables:
- `users` - User accounts and roles
- `workstreams` - Organizational workstreams
- `actions` - Action items with status tracking
- `action_updates` - Status update comments
- `action_audit` - Automatic audit trail
- `threats` - Risk register
- `technical_queries` - Technical Q&A
- `decisions` - Decision log
- `milestones` - Key milestones
- `gantt_tasks` - Gantt chart tasks
- `gantt_dependencies` - Task dependencies
- `notifications` - In-app notifications
- `attachments` - File attachments
- `mentions` - @mention tracking

## Priority Response Times

For Technical Queries:
- **Urgent**: Immediate response required
- **High**: Response within hours
- **Medium**: Response within 1 day
- **Low**: Response within 2-3 days

## License

Private - All rights reserved
