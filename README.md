# TaskFlow — Angular 18 + Node/Express + Supabase + Claude AI

A full-stack task manager with:
- **Auth**: Supabase email/password, JWT verified server-side.
- **Tasks**: CRUD with priority (Low/Medium/High), due dates, progress bar,
  card-based UI.
- **Currency converter**: live rates via Frankfurter (ECB), with conversion
  history persisted to Supabase and summarized on the dashboard.
- **Quick Convert**: type a plain-English request ("Convert 500 USD to
  EUR") on the dashboard — Claude (Anthropic API) parses it, redirects to
  the converter, and the conversion runs automatically. Falls back to a
  local regex parser if the AI call fails.
- **Light/dark theme toggle**, persisted per-browser.
- Static footer: "Created and Developed by Dushyant Kaushik".

## How it fits together

```
┌─────────────┐   HTTP + JWT    ┌──────────────┐              ┌───────────────┐
│   Angular    │ ─────────────▶ │  Node/Express │ ───────────▶ │   Supabase     │
│  (frontend)  │ ◀───────────── │   (backend)   │              │ Postgres + Auth│
└──────┬───────┘                └──────┬───────┘              └───────────────┘
       │                                │
       │ direct (anon key + session)    │ Anthropic API (Claude)
       ▼                                ▼
  Supabase "conversions" table     backend/routes/ai.js
  Frankfurter rates API            (parses Quick Convert text)
```

- **Tasks** go through Express (`requireAuth` middleware verifies the JWT,
  then `supabaseAdmin` — the service-role client — reads/writes, always
  scoped to `user_id`). Postgres Row Level Security is also enabled as a
  second line of defense.
- **Conversions** and **currency rates** are written/read directly from
  Angular using the anon key + the user's own session — RLS alone protects
  this data, since it doesn't need backend business logic.
- **Quick Convert** text is sent to the backend (never straight to
  Anthropic from the browser, since that would expose the API key), which
  calls Claude and returns clean `{ amount, from, to }` JSON.

## Project structure

```
taskflow/
├── backend/                          Node.js + Express REST API
│   ├── config/supabaseClient.js      Admin + auth Supabase clients
│   ├── middleware/auth.js            Verifies Supabase JWT
│   ├── routes/
│   │   ├── tasks.js                  CRUD for /api/tasks
│   │   └── ai.js                     Claude-powered /api/ai/parse-conversion
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/                         Angular 18 (standalone components)
│   └── src/
│       ├── app/
│       │   ├── pages/{login,signup,dashboard,currency-converter}/
│       │   ├── services/
│       │   │   ├── supabase.service.ts
│       │   │   ├── task.service.ts
│       │   │   ├── currency.service.ts
│       │   │   ├── conversion.service.ts
│       │   │   ├── theme.service.ts
│       │   │   └── ai-conversion.service.ts
│       │   ├── utils(separate currency page removed)-request-parser.ts
│       │   ├── interceptors/auth.interceptor.ts
│       │   ├── guards/auth.guard.ts
│       │   ├── app.routes.ts / app.config.ts / app.component.ts
│       ├── environments/environment.ts
│       └── styles.css
└── supabase/
    └── schema.sql                    tasks + conversions tables, RLS
```

## Local setup

### 1. Supabase

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste the contents of `supabase/schema.sql` → Run. (Safe to re-run —
   every statement is idempotent.)
3. **Authentication → Providers**: confirm Email is enabled.

### 2. Backend

```bash
cd backend
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# and ANTHROPIC_API_KEY (get one at https://console.anthropic.com/)
npm install
npm run dev
```
Runs on `http://localhost:3000` — check `http://localhost:3000/api/health`.

### 3. Frontend

```bash
cd frontend
npm install
npm start
```
Visit `http://localhost:4200`.

> `frontend/src/environments/environment.ts` already points `apiUrl` at
> the deployed Render backend by default. For fully local testing, change
> it to `http://localhost:3000/api` temporarily.

## What to point to in interviews / evaluation

- **Auth**: Supabase JWT → Angular interceptor attaches it → Express
  middleware verifies it before touching the database.
- **Authorization**: every query scoped to the requesting user, both in
  application code and via Postgres RLS.
- **AI integration**: a real LLM call (Claude, via `@anthropic-ai/sdk`)
  server-side, with strict JSON-output prompting, response validation
  against the app's actual supported-currency list, and a graceful
  non-AI fallback.
- **Modern Angular**: standalone components, signals, `computed()`,
  route guards, HTTP interceptors.
