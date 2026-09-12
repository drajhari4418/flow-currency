import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CurrencyList, CurrencyService } from '../../services/currency.service';
import { ConversionRow, ConversionService } from '../../services/conversion.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-currency-convertor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="converter-page">
      <header class="page-header">
        <div>
          <a routerLink="/dashboard" class="back-link">← Dashboard</a>
          <h1>Currency Converter</h1>
          <p>Convert currencies using the latest available ECB reference rates.</p>
        </div>
        <button class="theme-button" type="button" (click)="theme.toggle()">
          {{ theme.isDark() ? '☀️ Light' : '🌙 Dark' }}
        </button>
      </header>

      <section class="converter-card">
        <div class="amount-field">
          <label for="amount">Amount</label>
          <input id="amount" name="amount" type="number" min="0" step="any" [(ngModel)]="amount" placeholder="Enter amount" />
        </div>

        <div class="currency-field">
          <label for="from">From</label>
          <select id="from" name="from" [(ngModel)]="fromCurrency" [disabled]="loadingCurrencies()">
            <option *ngFor="let code of currencyCodes" [value]="code">{{ code }} — {{ currencies[code] }}</option>
          </select>
        </div>

        <button class="swap-button" type="button" (click)="swapCurrencies()" title="Swap currencies">⇄</button>

        <div class="currency-field">
          <label for="to">To</label>
          <select id="to" name="to" [(ngModel)]="toCurrency" [disabled]="loadingCurrencies()">
            <option *ngFor="let code of currencyCodes" [value]="code">{{ code }} — {{ currencies[code] }}</option>
          </select>
        </div>

        <button class="convert-button" type="button" (click)="convert()" [disabled]="loading() || loadingCurrencies()">
          {{ loading() ? 'Converting…' : 'Convert' }}
        </button>
      </section>

      <p class="error" *ngIf="errorMessage()">{{ errorMessage() }}</p>

      <section class="result-card" *ngIf="result() as conversion">
        <div class="result-label">Converted amount</div>
        <div class="result-value">{{ conversion.result | number:'1.2-6' }} {{ conversion.to }}</div>
        <div class="result-meta">{{ conversion.amount | number:'1.0-6' }} {{ conversion.from }} = {{ conversion.result | number:'1.2-6' }} {{ conversion.to }}</div>
        <div class="result-meta">Rate date: {{ conversion.date }}</div>
      </section>

      <section class="history-section">
        <div class="section-heading">
          <div>
            <h2>Conversion History</h2>
            <p>Your recent conversions are saved to your account.</p>
          </div>
          <button class="secondary-button" type="button" (click)="loadHistory()" [disabled]="historyLoading()">Refresh</button>
        </div>

        <div class="history-empty" *ngIf="!historyLoading() && history.length === 0">No conversions recorded yet.</div>
        <div class="history-table-wrap" *ngIf="history.length > 0">
          <table>
            <thead><tr><th>Date</th><th>Amount</th><th>Result</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let row of history">
                <td>{{ row.created_at | date:'medium' }}</td>
                <td>{{ row.amount | number:'1.0-6' }} {{ row.from_currency }}</td>
                <td>{{ row.result | number:'1.2-6' }} {{ row.to_currency }}</td>
                <td><button class="delete-button" type="button" (click)="deleteHistory(row)" title="Delete conversion">×</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; }
    .converter-page { max-width:1100px; margin:0 auto; padding:32px 22px 60px; font-family:inherit; }
    .page-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:28px; }
    .back-link { text-decoration:none; font-size:14px; opacity:.75; }
    h1 { margin:8px 0 5px; font-size:32px; }
    .page-header p,.section-heading p { margin:0; opacity:.68; }
    .theme-button,.secondary-button { border:1px solid rgba(127,127,127,.28); background:transparent; border-radius:9px; padding:9px 13px; cursor:pointer; }
    .converter-card { display:grid; grid-template-columns:1.2fr 1fr auto 1fr auto; gap:14px; align-items:end; padding:22px; border:1px solid rgba(127,127,127,.22); border-radius:16px; box-shadow:0 8px 28px rgba(0,0,0,.06); }
    label { display:block; font-size:13px; font-weight:600; margin-bottom:7px; }
    input,select { width:100%; box-sizing:border-box; padding:12px 13px; border:1px solid rgba(127,127,127,.28); border-radius:9px; background:transparent; color:inherit; }
    .swap-button { width:42px; height:42px; border:1px solid rgba(127,127,127,.28); border-radius:50%; background:transparent; cursor:pointer; font-size:20px; }
    .convert-button { height:43px; border:0; border-radius:9px; padding:0 20px; cursor:pointer; font-weight:700; background:currentColor; color:Canvas; }
    .convert-button:disabled,.secondary-button:disabled { opacity:.5; cursor:not-allowed; }
    .error { margin:14px 0; padding:12px 14px; border-radius:9px; background:rgba(220,38,38,.1); color:#b91c1c; }
    .result-card { margin-top:18px; padding:24px; border-radius:16px; background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.18); }
    .result-label { font-size:13px; opacity:.7; }
    .result-value { font-size:34px; font-weight:800; margin:5px 0 8px; }
    .result-meta { font-size:13px; opacity:.7; margin-top:4px; }
    .history-section { margin-top:34px; }
    .section-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    h2 { margin:0 0 5px; font-size:22px; }
    .history-table-wrap { overflow:auto; border:1px solid rgba(127,127,127,.22); border-radius:13px; }
    table { width:100%; border-collapse:collapse; min-width:650px; }
    th,td { padding:13px 15px; text-align:left; border-bottom:1px solid rgba(127,127,127,.15); }
    th { font-size:12px; text-transform:uppercase; letter-spacing:.04em; opacity:.65; }
    tr:last-child td { border-bottom:0; }
    .delete-button { border:0; background:transparent; cursor:pointer; font-size:20px; opacity:.6; }
    .history-empty { padding:28px; text-align:center; opacity:.65; border:1px dashed rgba(127,127,127,.3); border-radius:12px; }
    @media (max-width:800px) { .converter-card { grid-template-columns:1fr 1fr; } .swap-button { margin:auto; } .convert-button { grid-column:1/-1; } }
    @media (max-width:560px) { .page-header,.section-heading { flex-direction:column; } .converter-card { grid-template-columns:1fr; } .swap-button { justify-self:center; } }
  `]
})
export class CurrencyConvertorComponent implements OnInit {
  amount = 1;
  fromCurrency = 'USD';
  toCurrency = 'EUR';
  currencies: CurrencyList = {};
  currencyCodes: string[] = [];
  history: ConversionRow[] = [];
  loadingCurrencies = signal(true);
  loading = signal(false);
  historyLoading = signal(false);
  errorMessage = signal('');
  result = signal<{ amount:number; from:string; to:string; result:number; date:string } | null>(null);

  constructor(
    private currencyService: CurrencyService,
    private conversionService: ConversionService,
    public theme: ThemeService
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCurrencies(), this.loadHistory()]);
  }

  async loadCurrencies(): Promise<void> {
    this.loadingCurrencies.set(true);
    try {
      this.currencies = await firstValueFrom(this.currencyService.getCurrencies());
      this.currencyCodes = Object.keys(this.currencies).sort();
      if (!this.currencyCodes.includes(this.fromCurrency)) this.fromCurrency = this.currencyCodes[0] || 'USD';
      if (!this.currencyCodes.includes(this.toCurrency)) this.toCurrency = this.currencyCodes[1] || this.fromCurrency;
    } catch {
      this.errorMessage.set('Could not load currencies. Please check your internet connection and try again.');
    } finally {
      this.loadingCurrencies.set(false);
    }
  }

  swapCurrencies(): void {
    const current = this.fromCurrency;
    this.fromCurrency = this.toCurrency;
    this.toCurrency = current;
    this.result.set(null);
  }

  async convert(): Promise<void> {
    this.errorMessage.set('');
    const value = Number(this.amount);
    if (!Number.isFinite(value) || value < 0) {
      this.errorMessage.set('Enter a valid amount greater than or equal to 0.');
      return;
    }
    if (this.fromCurrency === this.toCurrency) {
      const same = { amount:value, from:this.fromCurrency, to:this.toCurrency, result:value, date:new Date().toISOString().slice(0,10) };
      this.result.set(same);
      await this.conversionService.logConversion(value, this.fromCurrency, this.toCurrency, value);
      await this.loadHistory();
      return;
    }

    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.currencyService.convert(value, this.fromCurrency, this.toCurrency));
      const converted = Number(response.rates[this.toCurrency]);
      if (!Number.isFinite(converted)) throw new Error('No rate returned');
      this.result.set({ amount:value, from:this.fromCurrency, to:this.toCurrency, result:converted, date:response.date });
      await this.conversionService.logConversion(value, this.fromCurrency, this.toCurrency, converted);
      await this.loadHistory();
    } catch {
      this.errorMessage.set('Conversion failed. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    try { this.history = await this.conversionService.getHistory(50); }
    finally { this.historyLoading.set(false); }
  }

  async deleteHistory(row: ConversionRow): Promise<void> {
    if (!confirm('Delete this conversion from your history?')) return;
    const deleted = await this.conversionService.deleteConversion(row.id);
    if (deleted) this.history = this.history.filter(item => item.id !== row.id);
    else this.errorMessage.set('Could not delete that history entry.');
  }
}
