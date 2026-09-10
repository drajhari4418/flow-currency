# TaskFlow — Apply-to-GitHub & Redeploy Guide (Render + Vercel)

This walks through replacing the contents of your **existing** GitHub repo
with everything in this zip, then getting Render (backend) and Vercel
(frontend) to pick up the changes.

---

## Step 1 — Get an Anthropic API key (needed for Quick Convert's AI parsing)

1. Go to https://console.anthropic.com/ → sign in.
2. Settings → API Keys → **Create Key**.
3. Copy it somewhere safe — you'll paste it into Render in Step 5, and
   into your local `.env` if you also run the backend locally.

---

## Step 2 — Replace your repo's files locally

You have your existing cloned repo (let's call its folder `taskflow/`) and
this new `taskflow-complete/` folder from the zip. On your machine:

```bash
# go into your existing, already-cloned repo
cd path/to/your/taskflow

# make sure you're on the branch you want to update (main, master, etc.)
git checkout main
git pull

# copy every file from the zip's taskflow-complete/ folder over your repo,
# overwriting anything with the same path
cp -r path/to/taskflow-complete/. .
```

`cp -r ... .` copies the full tree (backend/, frontend/, supabase/,
README.md) into your repo root, overwriting matching files and adding new
ones (like `backend/routes/ai.js`, the services, etc.).

> If you'd rather review before overwriting anything, unzip
> `taskflow-complete/` next to your repo and diff the two folders in your
> editor (VS Code's "Compare Selected" is good for this), then copy file
> by file.

---

## Step 3 — Commit and push to GitHub

```bash
git add -A
git status   # sanity check: review what changed before committing
git commit -m "Add AI-powered Quick Convert, task priority/due dates, theme toggle, merged dashboard"
git push origin main
```

Your GitHub repo now has the full, current state of the project.

---

## Step 4 — Update Supabase

1. Supabase dashboard → your project → **SQL Editor** → New query.
2. Paste the contents of `supabase/schema.sql` → **Run**.
3. This is safe even if you already ran earlier partial versions of this
   schema in previous sessions — every `create table`, `add column`, and
   `create policy` statement is written to be idempotent (re-runnable
   without errors).

---

## Step 5 — Update your Render backend

Your backend is already deployed on Render, pointed at this same GitHub
repo. You just need to:

1. Render dashboard → your backend service → **Environment**.
2. Add a new environment variable:
   ```
   ANTHROPIC_API_KEY = sk-ant-...your-key-from-step-1...
   ```
3. Confirm your existing variables are still there: `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`.
4. Save. Render will automatically trigger a new deploy when you save
   environment variable changes. If it doesn't, use **Manual Deploy →
   Deploy latest commit**.
5. Once deployed, confirm the **Root Directory** setting is still `backend`
   (this matters — pointing it at the repo root or at `frontend` will
   break the build, as you found before).
6. Check the deploy logs for `npm install` succeeding (it needs to pull in
   the new `@anthropic-ai/sdk` dependency) and the server starting up with
   `TaskFlow backend running on http://localhost:<PORT>`.
7. Visit `https://<your-render-url>/api/health` — should return
   `{"status":"ok"}`.

---

## Step 6 — Update your Vercel frontend

Since your frontend is on Vercel and pointed at the same repo:

1. Pushing to GitHub in Step 3 should already trigger an automatic Vercel
   deployment. Check the **Deployments** tab in your Vercel project.
2. No new environment variables are needed on the Vercel side — the
   Supabase URL/anon key and the Render API URL already live in
   `frontend/src/environments/environment.ts`, which is committed to the
   repo.
3. If you changed the Render backend's URL at any point, double-check
   `apiUrl` in `environment.ts` still matches it exactly (including
   `/api` at the end) before pushing.

---

## Step 7 — Test the live site end-to-end

1. Open your Vercel URL, log in.
2. **Quick Convert**: type `Convert 500 USD to EUR` → should redirect to
   the converter, show a result, and log it.
3. Try a loosely-worded request: `change 20 bucks into yen` → should still
   work (this is the part that only works because `ANTHROPIC_API_KEY` is
   now set on Render — if it fails silently and falls back, double-check
   Step 5).
4. Back on the dashboard: confirm the conversion appears in **Currency
   Overview**.
5. Add a task with a priority and a past due date → card should show
   "Overdue" in red.
6. Toggle 🌙/☀️ → whole app should switch themes; refresh → should persist.
7. Scroll down → footer should read "Created and Developed by Dushyant
   Kaushik".

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Quick Convert always falls back to regex, never uses AI | `ANTHROPIC_API_KEY` missing/wrong on Render | Re-check Step 5; look at Render logs for `AI parse-conversion error` |
| Backend build fails on Render | Root Directory not set to `backend` | Render → Settings → Root Directory → `backend` |
| Frontend can't reach backend (network errors) | `apiUrl` in `environment.ts` doesn't match your Render URL | Update and push again |
| SQL Editor errors on `schema.sql` | Ran a very old, non-idempotent version before | This version uses `if not exists` / `drop policy if exists` throughout — re-copy it from this package and re-run |
| Tasks/conversions show for the wrong data or empty | RLS policies missing | Re-run `schema.sql` — it recreates all policies |
