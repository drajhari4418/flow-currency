import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyService, CurrencyList } from '../../services/currency.service';
import { ConversionService } from '../../services/conversion.service';
import { ThemeService } from '../../services/theme.service';

interface ConversionEntry {
  amount: number;
  from: string;
  to: string;
  result: number;
  date: string;
}

// Common natural-language names/aliases for the currencies Frankfurter (ECB)
// supports, so a Quick Convert request like "500 dollars to euros" resolves
// to USD -> EUR even though the user never typed a currency code. This is
// the offline fallback path; the AI path on the dashboard already resolves
// names via Claude before ever reaching this page.
const CURRENCY_ALIASES: Record<string, string> = {
  dollar: 'USD', dollars: 'USD', usd: 'USD', 'us dollar': 'USD', 'us dollars': 'USD',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', sterling: 'GBP', gbp: 'GBP',
  yen: 'JPY', jpy: 'JPY',
  rupee: 'INR', rupees: 'INR', inr: 'INR',
  yuan: 'CNY', rmb: 'CNY', cny: 'CNY',
  franc: 'CHF', francs: 'CHF', chf: 'CHF',
  real: 'BRL', reais: 'BRL', brl: 'BRL',
  won: 'KRW', krw: 'KRW',
  rand: 'ZAR', zar: 'ZAR',
  peso: 'MXN', pesos: 'MXN', mxn: 'MXN',
  ringgit: 'MYR', myr: 'MYR',
  baht: 'THB', thb: 'THB',
  krone: 'NOK', kroner: 'NOK', nok: 'NOK',
  krona: 'SEK', kronor: 'SEK', sek: 'SEK',
  zloty: 'PLN', pln: 'PLN',
  lira: 'TRY', try: 'TRY',
  shekel: 'ILS', shekels: 'ILS', ils: 'ILS',
  'hong kong dollar': 'HKD', hkd: 'HKD',
  'singapore dollar': 'SGD', sgd: 'SGD',
  'new zealand dollar': 'NZD', nzd: 'NZD',
  'australian dollar': 'AUD', aud: 'AUD',
  'canadian dollar': 'CAD', cad: 'CAD',
};

@Component({
  selector: 'app-currency-converter',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Currency Converter</h1>
          <div class="email">Live rates via Frankfurter (ECB)</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="theme-toggle" (click)="theme.toggle()" [title]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
            {{ theme.isDark() ? '☀️' : '🌙' }}
          </button>
          <a class="secondary" style="text-decoration:none;padding:8px 14px;" [routerLink]="['/dashboard']">
            &larr; Back to dashboard
          </a>
        </div>
      </div>

      @if (autoConvertNotice()) {
        <div class="error-msg" style="background:var(--success-bg); color:var(--success-text);">
          {{ autoConvertNotice() }}
        </div>
      }
      @if (errorMsg()) {
        <div class="error-msg">{{ errorMsg() }}</div>
      }

      <div class="auth-card" style="max-width:none;margin-bottom:24px;">
        <div class="field">
          <label for="amount">Amount</label>
          <input
            id="amount"
            type="number"
            name="amount"
            min="0"
            step="any"
            [(ngModel)]="amount"
            placeholder="Enter an amount"
          />
        </div>

        <div style="display:flex; gap:12px; margin-bottom:16px;">
          <div class="field" style="flex:1; margin-bottom:0;">
            <label for="from">From</label>
            <select id="from" name="from" [(ngModel)]="fromCurrency" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px;">
              @for (code of currencyCodes(); track code) {
                <option [value]="code">{{ code }} — {{ currencies()[code] }}</option>
              }
            </select>
          </div>

          <button type="button" class="secondary" style="align-self:flex-end; margin-bottom:0; height:41px;" (click)="swap()" title="Swap currencies">
            ⇄
          </button>

          <div class="field" style="flex:1; margin-bottom:0;">
            <label for="to">To</label>
            <select id="to" name="to" [(ngModel)]="toCurrency" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px;">
              @for (code of currencyCodes(); track code) {
                <option [value]="code">{{ code }} — {{ currencies()[code] }}</option>
              }
            </select>
          </div>
        </div>

        <button class="primary" type="button" (click)="convertAndAdd()" [disabled]="converting() || !amount">
          {{ converting() ? 'Converting…' : 'Convert & Add' }}
        </button>
      </div>

      @if (history().length > 0) {
        <ul class="task-list">
          @for (entry of history(); track entry.date + entry.from + entry.to + entry.amount) {
            <li class="task-item">
              <span class="task-title">
                {{ entry.amount | number:'1.2-2' }} {{ entry.from }} = <strong>{{ entry.result | number:'1.2-2' }} {{ entry.to }}</strong>
              </span>
              <span style="font-size:12px; color:var(--text-muted);">{{ entry.date }}</span>
            </li>
          }
        </ul>
      } @else {
        <div class="empty-state">No conversions yet — enter an amount above and hit Convert & Add.</div>
      }
    </div>

    <footer class="app-footer">Created and Developed by <strong>Dushyant Kaushik</strong></footer>
  `,
})
export class CurrencyConverterComponent implements OnInit {
  currencies = signal<CurrencyList>({});
  currencyCodes = signal<string[]>([]);
  history = signal<ConversionEntry[]>([]);

  amount: number | null = 100;
  fromCurrency = 'USD';
  toCurrency = 'EUR';

  converting = signal(false);
  errorMsg = signal<string | null>(null);
  autoConvertNotice = signal<string | null>(null);

  constructor(
    private currencyService: CurrencyService,
    private conversionService: ConversionService,
    private route: ActivatedRoute,
    private router: Router,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.currencyService.getCurrencies().subscribe({
      next: (list) => {
        this.currencies.set(list);
        this.currencyCodes.set(Object.keys(list).sort());

        // If we arrived here from the dashboard's Quick Convert box, the
        // amount/from/to arrive as raw query params — resolve and run them
        // now that the full currency list is loaded.
        this.handleIncomingQuickConvert();
      },
      error: () => {
        this.errorMsg.set('Could not load the currency list. Check your internet connection.');
      },
    });
  }

  private handleIncomingQuickConvert() {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('auto') !== '1') return;

    const rawAmount = params.get('amount');
    const rawFrom = params.get('from');
    const rawTo = params.get('to');

    const amount = rawAmount ? parseFloat(rawAmount) : NaN;
    const fromCode = rawFrom ? this.resolveCurrencyCode(rawFrom) : null;
    const toCode = rawTo ? this.resolveCurrencyCode(rawTo) : null;

    // Clear the query params from the URL either way, so a page refresh
    // doesn't silently re-trigger the same conversion.
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });

    if (!amount || amount <= 0 || !fromCode || !toCode) {
      const unresolved = [
        !fromCode ? `"${rawFrom}"` : null,
        !toCode ? `"${rawTo}"` : null,
      ].filter(Boolean).join(' and ');

      this.errorMsg.set(
        unresolved
          ? `Couldn't recognize ${unresolved} as a currency. Please pick manually below.`
          : "That request wasn't quite complete — please fill in the fields below."
      );
      return;
    }

    this.amount = amount;
    this.fromCurrency = fromCode;
    this.toCurrency = toCode;
    this.autoConvertNotice.set(
      `Reflecting your request: converting ${amount} ${fromCode} to ${toCode}…`
    );
    this.convertAndAdd();
  }

  /** Resolves a code ("usd"), an alias ("dollars"), or a full name into a
   * currency code that's actually in the loaded currency list. */
  private resolveCurrencyCode(raw: string): string | null {
    const normalized = raw.trim().toLowerCase();
    const asCode = normalized.toUpperCase();

    if (/^[A-Z]{3}$/.test(asCode) && this.currencies()[asCode]) {
      return asCode;
    }

    const aliasCode = CURRENCY_ALIASES[normalized];
    if (aliasCode && this.currencies()[aliasCode]) {
      return aliasCode;
    }

    const match = Object.entries(this.currencies()).find(([, name]) =>
      name.toLowerCase().includes(normalized)
    );
    return match ? match[0] : null;
  }

  swap() {
    const temp = this.fromCurrency;
    this.fromCurrency = this.toCurrency;
    this.toCurrency = temp;
  }

  convertAndAdd() {
    if (!this.amount || this.amount <= 0) {
      this.errorMsg.set('Enter an amount greater than zero.');
      return;
    }
    if (this.fromCurrency === this.toCurrency) {
      this.errorMsg.set('Pick two different currencies.');
      return;
    }

    this.errorMsg.set(null);
    this.converting.set(true);

    this.currencyService.convert(this.amount, this.fromCurrency, this.toCurrency).subscribe({
      next: (res) => {
        const result = res.rates[this.toCurrency];

        this.history.update((list) => [
          {
            amount: this.amount!,
            from: this.fromCurrency,
            to: this.toCurrency,
            result,
            date: new Date().toLocaleString(),
          },
          ...list,
        ]);

        // Persist to Supabase (best-effort, non-blocking) so the dashboard's
        // "Currency Overview" reflects this conversion too.
        this.conversionService.logConversion(this.amount!, this.fromCurrency, this.toCurrency, result);

        this.converting.set(false);
        this.autoConvertNotice.set(null);
      },
      error: () => {
        this.errorMsg.set('Conversion failed. The rates API may be temporarily unavailable.');
        this.converting.set(false);
        this.autoConvertNotice.set(null);
      },
    });
  }
}
