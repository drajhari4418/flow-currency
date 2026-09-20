import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ForecastRange {
  low: number;
  high: number;
}

export interface AiForecast {
  from: string;
  to: string;
  current: number;
  asOf: string; // ISO date, e.g. "2026-09-18"
  history: { date: string; rate: number }[];
  forecast: {
    trend: 'up' | 'down' | 'sideways';
    confidence: 'low' | 'medium' | 'high';
    next_7_days: ForecastRange;
    next_30_days: ForecastRange;
    summary: string;
    factors: string[];
  };
}

// Holds the state of the AI forecast panel. It's a root-level singleton, so
// the Dashboard can call open() right before navigating to /currency and the
// panel (rendered once in AppComponent) simply stays open across the route
// change. Calls our own Express backend, so the auth interceptor attaches the
// user's Supabase JWT automatically (URL starts with environment.apiUrl).
@Injectable({ providedIn: 'root' })
export class ForecastService {
  isOpen = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<AiForecast | null>(null);
  pair = signal<{ from: string; to: string } | null>(null);

  // Guards against an older, slower response overwriting a newer one.
  private requestId = 0;

  constructor(private http: HttpClient) {}

  async open(from: string, to: string): Promise<void> {
    const id = ++this.requestId;

    this.pair.set({ from, to });
    this.isOpen.set(true);
    this.loading.set(true);
    this.error.set(null);
    this.data.set(null);

    try {
      const result = await firstValueFrom(
        this.http.get<AiForecast>(`${environment.apiUrl}/ai/forecast`, { params: { from, to } })
      );
      if (id !== this.requestId) return;
      this.data.set(result);
    } catch (err: any) {
      if (id !== this.requestId) return;
      this.error.set(err?.error?.error || 'The forecast could not be loaded. Please try again.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  retry(): void {
    const p = this.pair();
    if (p) this.open(p.from, p.to);
  }

  close(): void {
    this.requestId++; // ignore any response still in flight
    this.isOpen.set(false);
    this.loading.set(false);
  }
}
