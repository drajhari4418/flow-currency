import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { TaskService, Task, TaskPriority } from '../../services/task.service';
import { ConversionService, ConversionStats, ConversionRow } from '../../services/conversion.service';
import { ThemeService } from '../../services/theme.service';
import { AiConversionService } from '../../services/ai-conversion.service';
import { CurrencyService, CurrencyList } from '../../services/currency.service';
import { parseCurrencyRequest } from '../../utils/currency-request-parser';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>TaskFlow</h1>
          <div class="email">{{ userEmail }}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="theme-toggle" (click)="theme.toggle()" [title]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
            {{ theme.isDark() ? '☀️' : '🌙' }}
          </button>
          <a class="secondary" style="text-decoration:none;padding:8px 14px;" [routerLink]="['/currency']">
            Currency converter
          </a>
          <button class="secondary" (click)="logout()">Log out</button>
        </div>
      </div>

      @if (errorMsg()) {
        <div class="error-msg">{{ errorMsg() }}</div>
      }

      <!-- ===== Quick Convert — parsed by Claude (Anthropic API) on the
           backend, with a plain-regex parser as an offline/error fallback. -->
      <div class="section-title" style="display:flex; align-items:center; gap:8px;">
        Quick Convert
        <span class="ai-badge">✨ AI-powered</span>
      </div>
      <form class="quick-convert-form" (ngSubmit)="submitQuickConvert()">
        <div class="quick-convert-field">
          <label for="quickAmount">Amount</label>
          <input
            id="quickAmount"
            type="number"
            name="quickAmount"
            min="0"
            step="any"
            [(ngModel)]="quickAmount"
            [disabled]="quickConvertLoading()"
            placeholder="Enter amount"
            autocomplete="off"
          />
        </div>

        <div class="quick-convert-field">
          <label for="quickTo">To</label>
          <select
            id="quickTo"
            name="quickTo"
            [(ngModel)]="quickToCurrency"
            [disabled]="quickConvertLoading() || quickCurrencyLoading()"
          >
            @if (quickCurrencyLoading()) {
              <option value="">Loading currencies…</option>
            }
            @for (code of quickCurrencyCodes(); track code) {
              <option [value]="code">{{ code }} — {{ quickCurrencies()[code] }}</option>
            }
          </select>
        </div>

        <button class="primary quick-convert-button" type="submit" [disabled]="quickConvertLoading() || quickCurrencyLoading() || !quickAmount || !quickToCurrency">
          {{ quickConvertLoading() ? 'Converting…' : 'Convert' }}
        </button>
      </form>
      @if (quickConvertError()) {
        <div class="error-msg">{{ quickConvertError() }}</div>
      }
      // <div class="hint-text">
      //   Enter the amount and choose the destination currency. Dashboard Quick Convert uses USD as the source currency and keeps the same live currency list as the full converter.
      // </div>

      <!-- ===== Currency conversion overview ===== -->
      <div class="section-title" style="margin-top:28px;">Currency Overview</div>
      @if (statsLoading()) {
        <div class="empty-state" style="padding:16px 0;">Loading conversion stats…</div>
      } @else {
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ stats().total }}</div>
            <div class="stat-label">Total Conversions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats().favoritePair }}</div>
            <div class="stat-label">Most Used Pair</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats().favoriteCurrency }}</div>
            <div class="stat-label">Most Used Currency</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ stats().lastConversion }}</div>
            <div class="stat-label">Last Conversion</div>
          </div>
        </div>

        @if (recentConversions().length > 0) {
          <div class="history-table-wrap">
            <table class="history-table">
              <thead>
                <tr><th>Date</th><th>Amount</th><th>From</th><th>To</th><th>Result</th><th>Action</th></tr>
              </thead>
              <tbody>
                @for (row of recentConversions(); track row.id) {
                  <tr>
                    <td>{{ row.created_at | date:'medium' }}</td>
                    <td>{{ row.amount | number:'1.2-2' }}</td>
                    <td>{{ row.from_currency }}</td>
                    <td>{{ row.to_currency }}</td>
                    <td>{{ row.result | number:'1.2-2' }}</td>
                    <td>
                      <button
                        type="button"
                        class="delete"
                        (click)="removeConversion(row)"
                        [disabled]="deletingConversionId() === row.id"
                        title="Delete conversion"
                        aria-label="Delete conversion"
                      >
                        {{ deletingConversionId() === row.id ? '…' : '✕' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            No conversions yet. Use Quick Convert above or head to the
            <a [routerLink]="['/currency']">currency converter</a> to make your first one.
          </div>
        }
      }

      <!-- ===== Tasks ===== -->
      <div class="section-title" style="margin-top:32px;">Tasks</div>

      @if (!loading() && tasks().length > 0) {
        <div class="progress-wrap">
          <div class="progress-label">
            <span>{{ completedCount() }} of {{ tasks().length }} tasks completed</span>
            <span>{{ progressPercent() }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" [style.width.%]="progressPercent()"></div>
          </div>
        </div>
      }

      <form class="task-form" (ngSubmit)="addTask()">
        <input
          type="text"
          name="newTitle"
          placeholder="What needs doing?"
          [(ngModel)]="newTitle"
          required
        />
        <select name="newPriority" [(ngModel)]="newPriority" class="priority-select">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input type="date" name="newDueDate" [(ngModel)]="newDueDate" class="due-date-input" />
        <button class="primary" style="width:auto;" type="submit" [disabled]="adding()">
          {{ adding() ? 'Adding…' : 'Add' }}
        </button>
      </form>

      @if (loading()) {
        <div class="empty-state">Loading tasks…</div>
      } @else if (tasks().length === 0) {
        <div class="empty-state">No tasks yet — add your first one above.</div>
      } @else {
        <div class="task-card-grid">
          @for (task of tasks(); track task.id) {
            <div class="task-card" [class.done]="task.is_complete" [class.priority-low]="task.priority === 'low'" [class.priority-medium]="task.priority === 'medium'" [class.priority-high]="task.priority === 'high'">
              <div class="task-card-top">
                <input type="checkbox" [checked]="task.is_complete" (change)="toggle(task)" />
                <span class="task-title">{{ task.title }}</span>
                <button class="delete" (click)="remove(task)" title="Delete task">✕</button>
              </div>
              <div class="task-card-meta">
                <span class="badge" [class.badge-low]="task.priority === 'low'" [class.badge-medium]="task.priority === 'medium'" [class.badge-high]="task.priority === 'high'">
                  {{ task.priority }}
                </span>
                @if (task.due_date) {
                  <span class="badge badge-due" [class.badge-overdue]="isOverdue(task)">
                    {{ isOverdue(task) ? 'Overdue · ' : '' }}{{ task.due_date | date:'MMM d' }}
                  </span>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <footer class="app-footer">Created and Developed by <strong>Dushyant Kaushik</strong></footer>
  `,
})
export class DashboardComponent implements OnInit {
  tasks = signal<Task[]>([]);
  loading = signal(true);
  adding = signal(false);
  errorMsg = signal<string | null>(null);

  newTitle = '';
  newPriority: TaskPriority = 'medium';
  newDueDate: string | null = null;

  // Dashboard Quick Convert has two fixed fields: Amount and To.
  // The source currency remains USD by default, matching the converter page's
  // initial From selection. The To field is populated from the live currency API.
  quickAmount: number | null = null;
  quickToCurrency = 'EUR';
  quickConvertText = '';
  quickConvertError = signal<string | null>(null);
  quickConvertLoading = signal(false);

  quickCurrencies = signal<CurrencyList>({});
  quickCurrencyCodes = signal<string[]>([]);
  quickCurrencyLoading = signal(false);
  quickCurrencyLoadError = signal(false);

  userEmail: string | null = null;

  completedCount = computed(() => this.tasks().filter((t) => t.is_complete).length);
  progressPercent = computed(() => {
    const total = this.tasks().length;
    return total === 0 ? 0 : Math.round((this.completedCount() / total) * 100);
  });

  stats = signal<ConversionStats>({
    total: 0,
    favoritePair: '—',
    favoriteCurrency: '—',
    lastConversion: '—',
  });
  recentConversions = signal<ConversionRow[]>([]);
  deletingConversionId = signal<number | null>(null);
  statsLoading = signal(true);

  constructor(
    private taskService: TaskService,
    private supabase: SupabaseService,
    private conversionService: ConversionService,
    private aiConversionService: AiConversionService,
    private currencyService: CurrencyService,
    public theme: ThemeService,
    private router: Router
  ) {}

  ngOnInit() {
    this.userEmail = this.supabase.currentUserEmail();
    this.fetchTasks();
    this.fetchConversionOverview();
    this.loadQuickCurrencies();
  }

  private loadQuickCurrencies() {
    this.quickCurrencyLoading.set(true);
    this.quickCurrencyLoadError.set(false);
    this.currencyService.getCurrencies().subscribe({
      next: (list) => {
        this.quickCurrencies.set(list);
        const codes = Object.keys(list).sort();
        this.quickCurrencyCodes.set(codes);
        if (!list[this.quickToCurrency]) {
          this.quickToCurrency = codes.includes('EUR') ? 'EUR' : (codes[0] || '');
        }
        this.quickCurrencyLoading.set(false);
      },
      error: () => {
        this.quickCurrencies.set({});
        this.quickCurrencyCodes.set([]);
        this.quickCurrencyLoading.set(false);
        this.quickCurrencyLoadError.set(true);
      },
    });
  }

  fetchTasks() {
    this.loading.set(true);
    this.taskService.list().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Could not load tasks. Is the backend running?');
        this.loading.set(false);
      },
    });
  }

  async fetchConversionOverview() {
    this.statsLoading.set(true);
    const [stats, history] = await Promise.all([
      this.conversionService.getStats(),
      this.conversionService.getHistory(5),
    ]);
    this.stats.set(stats);
    this.recentConversions.set(history);
    this.statsLoading.set(false);
  }

  /**
   * Understands the free-text request with Claude first (handles loose
   * phrasing like "change 20 bucks into yen"). If the AI call fails for any
   * reason (network issue, missing API key, etc.) it falls back to the
   * plain regex parser, so Quick Convert still works without AI configured.
   * Either way, once amount/from/to are known, it redirects to /currency
   * with those values attached, exactly as before.
   */
  async submitQuickConvert() {
    this.quickConvertError.set(null);

    const amount = Number(this.quickAmount);
    const to = this.quickToCurrency?.trim().toUpperCase();
    const from = 'USD';

    if (!Number.isFinite(amount) || amount <= 0) {
      this.quickConvertError.set('Enter an amount greater than zero.');
      return;
    }

    if (!to || !this.quickCurrencyCodes().includes(to)) {
      this.quickConvertError.set('Please select a currency in the To field.');
      return;
    }

    if (from === to) {
      this.quickConvertError.set('Choose a To currency different from USD.');
      return;
    }

    // Keep the AI path: the structured fields are converted into a precise
    // natural-language request, so Claude can still resolve/validate it.
    const text = `Convert ${amount} USD to ${to}`;
    this.quickConvertText = text;
    this.quickConvertLoading.set(true);

    try {
      const ai = await firstValueFrom(this.aiConversionService.parseConversionRequest(text));
      this.goToConverter(ai.amount, ai.from, ai.to);
      return;
    } catch (err: any) {
      console.warn('AI parsing failed, using the structured dashboard values:', err?.error?.error || err);
    } finally {
      this.quickConvertLoading.set(false);
    }

    // Reliable local fallback: no AI/network dependency is required here.
    this.goToConverter(amount, from, to);
  }

  private goToConverter(amount: number, from: string, to: string) {
    this.router.navigate(['/currency'], {
      queryParams: { amount, from, to, auto: '1' },
    });
  }

  addTask() {
    if (!this.newTitle.trim()) return;
    this.adding.set(true);

    this.taskService.create(this.newTitle.trim(), this.newPriority, this.newDueDate).subscribe({
      next: (task) => {
        this.tasks.update((list) => [task, ...list]);
        this.newTitle = '';
        this.newPriority = 'medium';
        this.newDueDate = null;
        this.adding.set(false);
      },
      error: () => {
        this.errorMsg.set('Could not add task.');
        this.adding.set(false);
      },
    });
  }

  toggle(task: Task) {
    this.taskService.toggleComplete(task).subscribe({
      next: (updated) => {
        this.tasks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      },
    });
  }

  removeConversion(row: ConversionRow) {
    if (!confirm('Delete this conversion entry?')) return;

    this.deletingConversionId.set(row.id);
    this.conversionService.deleteConversion(row.id).then((success) => {
      if (success) {
        this.recentConversions.update((list) => list.filter((item) => item.id !== row.id));
        this.fetchConversionOverview();
      } else {
        this.errorMsg.set('Could not delete the conversion entry.');
      }
      this.deletingConversionId.set(null);
    });
  }

  remove(task: Task) {
    this.taskService.delete(task.id).subscribe({
      next: () => {
        this.tasks.update((list) => list.filter((t) => t.id !== task.id));
      },
    });
  }

  isOverdue(task: Task): boolean {
    if (!task.due_date || task.is_complete) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(task.due_date) < today;
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
