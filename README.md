# GitHubSync AI

A production-grade Chrome Extension that syncs LeetCode solutions to GitHub with AI-powered intelligence.

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** with **@crxjs/vite-plugin** for Chrome Extension MV3
- **TailwindCSS** + **Shadcn UI** components
- **Zustand** for state management
- **Framer Motion** for animations
- **React Router** for navigation
- **Recharts** for analytics visualizations
- **Lucide React** for icons

## Getting Started

```bash
# Install dependencies
npm install

# Start development server with HMR
npm run dev

# Build for production
npm run build
```

## Loading the Extension

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `dist` folder

## Project Structure

```
src/
├── background/          # Service worker
├── popup/               # Extension popup (380px)
├── dashboard/           # Full dashboard app
├── pages/               # Route pages
│   ├── DashboardPage
│   ├── AnalyticsPage
│   ├── SettingsPage
│   └── SyncHistoryPage
├── components/
│   ├── ui/              # Shadcn UI primitives
│   ├── layout/          # Sidebar, Header, Layout
│   └── shared/          # Reusable components
├── store/               # Zustand store
├── data/mock/           # Mock data
├── types/               # TypeScript types
├── lib/                 # Utilities
└── styles/              # Global CSS
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Popup | Extension icon click | Quick sync overview |
| Dashboard | `/dashboard` | Main overview with stats |
| Analytics | `/analytics` | Charts and breakdowns |
| Sync History | `/history` | Filterable sync log |
| Settings | `/settings` | Preferences and account |

## Features (Frontend Only)

- Dark theme with system persistence
- Animated page transitions (Framer Motion)
- Collapsible sidebar navigation
- Search with keyboard shortcut hint
- Filterable sync history
- Interactive analytics charts
- Responsive popup and dashboard layouts

> **Note:** This is the frontend-only phase. No GitHub or LeetCode API integration is implemented yet. All data is mock.
