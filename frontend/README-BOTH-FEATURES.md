# Dashboard features included

This frontend includes both requested Dashboard features:

1. **Currency list inside Quick Convert**
   - Uses the same live Frankfurter currency list as the full Currency Converter.
   - Click/focus the Quick Convert box to open the list.
   - Type to filter by currency code or name.
   - Clicking a currency inserts its 3-letter code into the natural-language request.
   - The AI conversion flow remains unchanged.

2. **Delete conversion entries from Dashboard**
   - Each Dashboard conversion-history row has a Delete button.
   - The frontend verifies the row belongs to the logged-in user.
   - It verifies that Supabase actually deleted the row before removing it from the UI.
   - After deletion, Dashboard stats/history are refreshed.

## Important Supabase step for real deletion

Supabase Row Level Security must allow authenticated users to delete their own conversion rows.

Run `supabase-delete-conversion-policy.sql` once in **Supabase Dashboard -> SQL Editor**.

The policy is restricted to:

```sql
auth.uid() = user_id
```

so a user can only delete their own conversion history.

## Run

```bash
npm install
npm start
```

Then open the Dashboard while signed in.
