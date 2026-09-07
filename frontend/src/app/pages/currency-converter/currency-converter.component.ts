import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

          <button
            type="button"
            class="secondary"
            style="align-self:flex-end; margin-bottom:0; height:41px;"
            (click)="swap()"
            title="Swap currencies"
          >
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

  constructor(
    private currencyService: CurrencyService,
    private conversionService: ConversionService,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.currencyService.getCurrencies().subscribe({
      next: (list) => {
        this.currencies.set(list);
        this.currencyCodes.set(Object.keys(list).sort());
      },
      error: () => {
        this.errorMsg.set('Could not load the currency list. Check your internet connection.');
      },
    });
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
      },
      error: () => {
        this.errorMsg.set('Conversion failed. The rates API may be temporarily unavailable.');
        this.converting.set(false);
      },
    });
  }
}
