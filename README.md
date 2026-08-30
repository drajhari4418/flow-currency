# TaskFlow — Angular + Node.js + Supabase

A small full-stack task manager showing off the MEAN-adjacent stack from your
internship (Angular + Node/Express) plus **Supabase** for the database and
**authentication** (email + password, JWT-based).

## How it fits together

```
┌─────────────┐        HTTP + JWT        ┌──────────────┐        ┌───────────────┐
│   Angular    │  ───────────────────▶   │  Node/Express │  ───▶  │   Supabase     │
│  (frontend)  │  ◀───────────────────   │   (backend)   │        │ Postgres + Auth│
└─────────────┘                          └──────────────┘        └───────────────┘
```

- **Supabase Auth** handles signup/login directly from Angular (via
  `@supabase/supabase-js`) and issues a JWT access token.
- Angular attaches that JWT to every API call to the Node backend
  (`Authorization: Bearer <token>`), via an HTTP interceptor.
- The Node/Express backend verifies the JWT with Supabase on every request,
  then uses the **service role** key to read/write the `tasks` table —
  always scoped to `user_id = <the verified user>`.
- Postgres Row Level Security (RLS) policies are also enabled as a second
  line of defense.

This is the standard pattern for "Supabase Auth + your own backend" instead
of calling Supabase directly from the frontend for everything — it keeps
your Node/Express skills front and center, which is presumably the point
for your portfolio.

## 1. Create your Supabase project

1. Go to https://supabase.com, create a free project.
2. In the dashboard, open **SQL Editor → New query**, paste the contents of
   `supabase/schema.sql`, and run it. This creates the `tasks` table and its
   RLS policies.
3. Go to **Project Settings → API** and copy three values:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep this secret — backend only!)
4. Go to **Authentication → Providers** and confirm **Email** is enabled
   (it is by default). Optionally, under **Authentication → Settings**, turn
   off "Confirm email" while developing so you can log in immediately after
   signup.

## 2. Run the backend

```bash
cd backend
cp .env.example .env
# edit .env and paste in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

The API runs on `http://localhost:3000`. Check `http://localhost:3000/api/health`.

## 3. Run the frontend

```bash
cd frontend
npm install
```

Edit `src/environments/environment.ts` and fill in:
```ts
supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY',
```

Then:
```bash
npm start
```

Visit `http://localhost:4200`, sign up with an email + password, and you'll
land on the dashboard where you can add, complete, and delete tasks.

## Project structure

```
taskflow/
├── backend/                  Node.js + Express REST API
│   ├── config/supabaseClient.js
│   ├── middleware/auth.js    Verifies Supabase JWT on every request
│   ├── routes/tasks.js       CRUD endpoints, scoped to req.user.id
│   ├── server.js
│   └── .env.example
├── frontend/                 Angular 18 (standalone components)
│   └── src/app/
│       ├── services/supabase.service.ts   Signup/login/logout, session signal
│       ├── services/task.service.ts       Calls the Node API
│       ├── interceptors/auth.interceptor.ts  Attaches JWT to requests
│       ├── guards/auth.guard.ts           Protects /dashboard
│       └── pages/{login,signup,dashboard}/
└── supabase/schema.sql       tasks table + Row Level Security policies
```

## What to point to in interviews

- **Auth**: Supabase issues a JWT on login; the Angular interceptor attaches
  it to every backend call; the Express middleware verifies it server-side
  before touching the database.
- **Authorization**: every query is scoped to the requesting user's ID —
  both in application code (`routes/tasks.js`) and defense-in-depth at the
  database level (Postgres RLS policies in `schema.sql`).
- **Angular**: standalone components, signals for reactive state, route
  guards, and an HTTP interceptor — all current (v17+) Angular patterns
  rather than older NgModule-based ones.

## Extending it

- Add password reset (`supabase.auth.resetPasswordForEmail`).
- Add task due dates / priorities — just extend the `tasks` table and the
  `Task` interface + form.
- Deploy: backend to Render/Railway, frontend to Vercel/Netlify, both use
  the same Supabase project.
