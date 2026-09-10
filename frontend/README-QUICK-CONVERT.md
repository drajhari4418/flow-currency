# Dashboard Quick Convert — final layout

The Dashboard Quick Convert now has three fixed currency fields:

- **Amount** — numeric amount input
- **From** — full live currency dropdown
- **To** — full live currency dropdown
- **Convert** — opens the full converter and performs the conversion

There is also an **Or use AI text** field for requests such as `Convert 500 USD to EUR`.
The AI field calls the existing Express `/ai/parse-conversion` endpoint and falls back to the local parser when that endpoint is unavailable.

The Dashboard conversion history still includes the real Supabase-backed Delete action.

## Supabase delete policy

Run `supabase-delete-conversion-policy.sql` once in the Supabase SQL Editor if the Delete action reports that no row was deleted. The frontend intentionally does not fake deletion when Supabase RLS blocks it.

## Run

```bash
npm install
npm start
```

## Build verification

A full Angular build could not be executed in the packaging environment because `npm install` timed out. The source changes were checked for the expected Angular/TypeScript structure.
