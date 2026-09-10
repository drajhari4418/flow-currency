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

    const { error } = await this.supabase
      .getClient()
      .from('conversions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.warn('Could not delete conversion history entry:', error.message);
      return false;
    }
    return true;
  }

  async getHistory(limit = 20): Promise<ConversionRow[]> {
    const userId = this.supabase.currentUserId();
    if (!userId) return [];

    const { data, error } = await this.supabase
      .getClient()
      .from('conversions')
      .select('id, amount, from_currency, to_currency, result, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('Could not load conversion history:', error.message);
      return [];
    }
    return data ?? [];
  }

  /** Summary stats for the dashboard cards, derived from full history. */
  async getStats(): Promise<ConversionStats> {
    const rows = await this.getHistory(500); // enough to compute meaningful favorites
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
