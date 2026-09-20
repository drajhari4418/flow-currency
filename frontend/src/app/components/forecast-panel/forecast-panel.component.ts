import { Component, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ForecastService } from '../../services/forecast.service';

// Rendered once in AppComponent. Opens automatically when
// ForecastService.open() is called (the Dashboard's Convert button does this)
// and floats over whichever page is showing until the user closes it.
@Component({
  selector: 'app-forecast-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (svc.isOpen()) {
      <aside class="fc-panel" role="dialog" aria-label="AI exchange rate forecast">
        <div class="fc-header">
          <div>
            <div class="fc-title">✨ AI forecast</div>
            @if (svc.pair(); as p) {
              <div class="fc-pair">{{ p.from }} to {{ p.to }}</div>
            }
          </div>
          <button type="button" class="fc-close" (click)="svc.close()" aria-label="Close forecast" title="Close">✕</button>
        </div>

        @if (svc.loading()) {
          <div class="fc-loading" aria-live="polite">
            <div class="fc-skeleton" style="width: 55%; height: 18px;"></div>
            <div class="fc-skeleton" style="width: 100%; height: 64px;"></div>
            <div class="fc-skeleton" style="width: 100%; height: 44px;"></div>
            <div class="fc-loading-text">Analysing recent exchange rates…</div>
          </div>
        } @else if (svc.error()) {
          <div class="error-msg" style="margin-bottom: 12px;">{{ svc.error() }}</div>
          <button type="button" class="secondary" (click)="svc.retry()">Try again</button>
        } @else {
          @if (svc.data(); as d) {
            <div class="fc-now">1 {{ d.from }} = <strong>{{ d.current | number:'1.4-4' }}</strong> {{ d.to }}</div>

            <div class="fc-chips">
              <span
                class="fc-chip"
                [class.fc-up]="d.forecast.trend === 'up'"
                [class.fc-down]="d.forecast.trend === 'down'"
                [class.fc-flat]="d.forecast.trend === 'sideways'"
              >{{ trendLabel(d.forecast.trend) }}</span>
              <span class="fc-chip fc-neutral">Confidence: {{ d.forecast.confidence }}</span>
            </div>

            @if (sparkline(); as s) {
              <svg class="fc-spark" [attr.viewBox]="'0 0 ' + s.width + ' ' + s.height" preserveAspectRatio="none" role="img" [attr.aria-label]="'Rate over the last ' + d.history.length + ' trading days'">
                <polyline [attr.points]="s.points" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
              </svg>
              <div class="fc-spark-caption">Last {{ d.history.length }} trading days</div>
            }

            <div class="fc-ranges">
              <div class="fc-range">
                <div class="fc-range-label">Next 7 days</div>
                <div class="fc-range-value">{{ d.forecast.next_7_days.low | number:'1.4-4' }} – {{ d.forecast.next_7_days.high | number:'1.4-4' }}</div>
              </div>
              <div class="fc-range">
                <div class="fc-range-label">Next 30 days</div>
                <div class="fc-range-value">{{ d.forecast.next_30_days.low | number:'1.4-4' }} – {{ d.forecast.next_30_days.high | number:'1.4-4' }}</div>
              </div>
            </div>

            <p class="fc-summary">{{ d.forecast.summary }}</p>

            @if (d.forecast.factors.length > 0) {
              <ul class="fc-factors">
                @for (factor of d.forecast.factors; track $index) {
                  <li>{{ factor }}</li>
                }
              </ul>
            }

            <div class="fc-disclaimer">
              AI-generated estimate based on ECB rates up to {{ d.asOf | date:'mediumDate' }}. Not financial advice.
            </div>
          }
        }
      </aside>
    }
  `,
  styles: [`
    .fc-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 1000;
      width: 340px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      padding: 16px;
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 10px 30px var(--shadow);
      animation: fc-in 0.22s ease-out;
    }
    @keyframes fc-in {
      from { opacity: 0; transform: translateX(16px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .fc-panel { animation: none; }
    }

    .fc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .fc-title { font-size: 15px; font-weight: 700; }
    .fc-pair { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
    .fc-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      padding: 4px 6px;
      border-radius: 6px;
    }
    .fc-close:hover { background: var(--table-head-bg); color: var(--text); }
    .fc-close:focus-visible { outline: 2px solid var(--primary); }

    .fc-now { font-size: 14px; margin-bottom: 10px; }

    .fc-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .fc-chip {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .fc-up { color: var(--low); background: var(--low-bg); }
    .fc-down { color: var(--high); background: var(--high-bg); }
    .fc-flat { color: var(--medium); background: var(--medium-bg); }
    .fc-neutral { color: var(--text-muted); background: var(--table-head-bg); font-weight: 500; }

    .fc-spark { width: 100%; height: 64px; display: block; }
    .fc-spark-caption { font-size: 11px; color: var(--text-muted); margin: 4px 0 12px; }

    .fc-ranges {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .fc-range {
      background: var(--table-head-bg);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .fc-range-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
    .fc-range-value { font-size: 13px; font-weight: 700; }

    .fc-summary { font-size: 13px; line-height: 1.5; margin: 0 0 10px; }
    .fc-factors { margin: 0 0 12px; padding-left: 18px; font-size: 13px; line-height: 1.5; color: var(--text-muted); }
    .fc-factors li { margin-bottom: 4px; }
    .fc-disclaimer { font-size: 11.5px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px; }

    .fc-loading { display: flex; flex-direction: column; gap: 12px; }
    .fc-loading-text { font-size: 12px; color: var(--text-muted); }
    .fc-skeleton {
      background: var(--table-head-bg);
      border-radius: 6px;
      animation: fc-pulse 1.2s ease-in-out infinite;
    }
    @keyframes fc-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .fc-skeleton { animation: none; }
    }

    /* On phones the panel becomes a bottom sheet. */
    @media (max-width: 640px) {
      .fc-panel {
        top: auto;
        right: 0;
        left: 0;
        bottom: 0;
        width: 100%;
        max-height: 75vh;
        border-radius: 16px 16px 0 0;
        animation-name: fc-up;
      }
      @keyframes fc-up {
        from { opacity: 0; transform: translateY(24px); }
        to { opacity: 1; transform: translateY(0); }
      }
    }
  `],
})
export class ForecastPanelComponent {
  constructor(public svc: ForecastService) {}

  // Tiny inline chart of the rate history — no chart library needed.
  sparkline = computed(() => {
    const data = this.svc.data();
    if (!data || data.history.length < 2) return null;

    const rates = data.history.map((p) => p.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const span = max - min || 1;
    const width = 320;
    const height = 64;
    const pad = 4;

    const points = rates
      .map((rate, i) => {
        const x = pad + (i / (rates.length - 1)) * (width - pad * 2);
        const y = pad + (1 - (rate - min) / span) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    return { points, width, height };
  });

  trendLabel(trend: 'up' | 'down' | 'sideways'): string {
    if (trend === 'up') return '▲ Likely to rise';
    if (trend === 'down') return '▼ Likely to fall';
    return '▬ Likely to move sideways';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.svc.isOpen()) this.svc.close();
  }
}
