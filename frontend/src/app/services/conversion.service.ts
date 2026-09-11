import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ConversionRow {
  id: number;
  amount: number;
  from_currency: string;
  to_currency: string;
  result: number;
  created_at: string;
}

export interface ConversionStats {
  total: number;
  favoritePair: string;
  favoriteCurrency: string;
  lastConversion: string;
}

const EMPTY_STATS: ConversionStats = {
  total: 0,
  favoritePair: '—',
  favoriteCurrency: '—',
  lastConversion: '—',
};

// Reads/writes the "conversions" table directly via the Supabase client
// (anon key + the user's own session), the same way the currency-rate
// lookups already bypass the Node backend — RLS keeps this safe.
@Injectable({ providedIn: 'root' })
export class ConversionService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Best-effort logging: a failed write here should never break the
   * conversion UI itself, so errors are swallowed (and logged) rather
   * than surfaced to the user.
   */
  async logConversion(amount: number, from: string, to: string, result: number): Promise<void> {
    const userId = this.supabase.currentUserId();
    if (!userId) return;

    const { error } = await this.supabase.getClient().from('conversions').insert({
      user_id: userId,
      amount,
      from_currency: from.toUpperCase(),
      to_currency: to.toUpperCase(),
      result,
    });

    if (error) {
      console.warn('Could not log conversion to history:', error.message);
    }
  }

  /** Most recent conversions for the logged-in user, newest first. */
  /** Delete one conversion history entry owned by the logged-in user. */
  async deleteConversion(id: number): Promise<boolean> {
    const userId = this.supabase.currentUserId();
    if (!userId) return false;

    const client = this.supabase.getClient();

    // First verify that this row is visible to the signed-in user. This also
    // prevents reporting success when RLS silently filters out a row.
    const { data: existing, error: readError } = await client
      .from('conversions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (readError || !existing) {
      console.warn('Conversion entry is not available for deletion:', readError?.message);
      return false;
    }

    // Ask Supabase to return the deleted row. If the DELETE RLS policy is
    // missing, Supabase will not return the row and we correctly report
    // failure instead of pretending the UI deletion was persistent.
    const { data: deleted, error: deleteError } = await client
      .from('conversions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (deleteError || !deleted || deleted.length !== 1) {
      console.warn(
        'Could not delete conversion history entry:',
        deleteError?.message || 'No row was deleted. Check the conversions DELETE RLS policy.'
      );
      return false;
    }

    return true;
  }

  /**
   * Load conversion history for the signed-in user.
   *
   * When a limit is supplied, only that many newest rows are returned.
   * When no limit is supplied, every row is loaded in pages. Paging is
   * important because Supabase/PostgREST can cap a single response (commonly
   * at 1,000 rows), so simply removing .limit() would not reliably show all
   * conversions for users with a large history.
   */
  async getHistory(limit?: number): Promise<ConversionRow[]> {
    const userId = this.supabase.currentUserId();
    if (!userId) return [];

    const client = this.supabase.getClient();
    const pageSize = 1000;

    if (limit !== undefined) {
      const safeLimit = Math.max(0, Math.floor(limit));
      if (safeLimit === 0) return [];

      const { data, error } = await client
        .from('conversions')
        .select('id, amount, from_currency, to_currency, result, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(0, safeLimit - 1);

      if (error) {
        console.warn('Could not load conversion history:', error.message);
        return [];
      }
      return data ?? [];
    }

    // No limit means ALL conversion entries. Fetch them page-by-page so the
    // dashboard does not silently stop at Supabase's per-request row limit.
    const allRows: ConversionRow[] = [];
    let from = 0;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await client
        .from('conversions')
        .select('id, amount, from_currency, to_currency, result, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.warn('Could not load conversion history:', error.message);
        return allRows;
      }

      const page = data ?? [];
      allRows.push(...page);

      if (page.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  }

  /** Summary stats for the dashboard cards, derived from the full history. */
  async getStats(): Promise<ConversionStats> {
    const rows = await this.getHistory();
    if (rows.length === 0) return EMPTY_STATS;

    const pairCounts: Record<string, number> = {};
    const currencyCounts: Record<string, number> = {};

    for (const row of rows) {
      const pairKey = `${row.from_currency} → ${row.to_currency}`;
      pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      currencyCounts[row.from_currency] = (currencyCounts[row.from_currency] || 0) + 1;
      currencyCounts[row.to_currency] = (currencyCounts[row.to_currency] || 0) + 1;
    }

    const favoritePair = Object.entries(pairCounts).sort((a, b) => b[1] - a[1])[0][0];
    const favoriteCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0][0];

    // rows are already sorted newest-first
    const lastConversion = new Date(rows[0].created_at).toLocaleString();

    return { total: rows.length, favoritePair, favoriteCurrency, lastConversion };
  }
}
