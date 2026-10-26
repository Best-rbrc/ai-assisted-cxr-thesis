# Frontend — Study Application

React + TypeScript + Vite + Tailwind + Supabase web app used to run the four-condition within-subject user study (37 participants, 557 trials, eight countries).

## Stack

- **React 18** with TypeScript and Vite for build/dev.
- **Tailwind CSS** + shadcn/ui (Radix primitives) for the interface.
- **Supabase** (PostgreSQL) for session persistence — schema is four tables: `study_sessions`, `study_trials`, `study_block_surveys`, `study_email_subscriptions`.
- **Vitest** for the small test suite (Latin-square assignment, seeded shuffles, condition routing).

## Setup

```bash
npm install
cp .env.example .env       # then add SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev                # local dev server at http://localhost:5173
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` |
| `npm run test` | Vitest run |

## Study protocol implemented here

- **Cohort prefix:** first character of the session code marks how the participant arrived (`F` = friends/organic, `R` = reddit, fully random for direct-link entry). Configured in [`src/screens/LandingScreen.tsx`](src/screens/LandingScreen.tsx).
- **Latin square:** 4 × 4 cyclic Latin square assigns each participant to one of four condition orders, balanced across blocks.
- **Four conditions:** A (AI Immediate, single-phase), B (AI Deferred), C (AI + heatmaps + bias warnings), E (XAI only, no numeric AI). Wired in [`src/screens/TrialScreen.tsx`](src/screens/TrialScreen.tsx).
- **Bilingual:** German + English, switchable per session.
- **Persistence:** session-resume by code is supported; storage uses Supabase plus a localStorage cache keyed by `chexstudy_<sessionCode>`.

## Deployment

Production build runs on Vercel; the `dist/` output is served statically. Supabase RLS policies allow public anonymous inserts on the four study tables and no reads. Schema migrations live in the Supabase project, not in this repo.

## Backend / database

The Supabase project is separate from this repo. The data export used for thesis analysis is committed at the project root in [`data/`](../data/).
