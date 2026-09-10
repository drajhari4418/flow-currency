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
        <div class="quick-convert-input-wrap">
          <input
            type="text"
            name="quickConvertText"
            placeholder='e.g. "Convert 500 dollars to euros"'
            [(ngModel)]="quickConvertText"
            [disabled]="quickConvertLoading()"
            autocomplete="off"
            (focus)="openCurrencyPicker()"
            (blur)="closeCurrencyPicker()"
          />

          @if (quickCurrencyLoading()) {
            <div class="quick-currency-status">Loading currencies…</div>
          }

          @if (quickCurrencyLoadError() && quickCurrencyPickerOpen()) {
            <div class="quick-currency-status">Currency list could not be loaded. You can still type a currency name or code.</div>
          }

          @if (quickCurrencyPickerOpen() && filteredQuickCurrencies().length > 0) {
            <div class="quick-currency-dropdown">
              <div class="quick-currency-dropdown-title">Choose a currency</div>
              @for (code of filteredQuickCurrencies(); track code) {
                <button
                  type="button"
                  class="quick-currency-option"
                  (mousedown)="selectQuickCurrency(code); $event.preventDefault()"
                >
                  <strong>{{ code }}</strong>
                  <span>{{ quickCurrencies()[code] }}</span>
                </button>
              }
            </div>
          }

          @if (quickCurrencyPickerOpen() && !quickCurrencyLoading() && filteredQuickCurrencies().length === 0 && quickCurrencyCodes().length > 0) {
            <div class="quick-currency-status">No matching currency</div>
          }
        </div>
        <button class="primary" style="width:auto;" type="submit" [disabled]="quickConvertLoading()">
          {{ quickConvertLoading() ? 'Asking AI…' : 'Convert' }}
        </button>
      </form>
      @if (quickConvertError()) {
        <div class="error-msg">{{ quickConvertError() }}</div>
      }
      <div class="hint-text">
        Your request is sent to Claude to understand the amount and currencies —
        even loosely-worded requests like "change 20 bucks into yen" should work.
      </div>

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

  quickConvertText = '';
  quickConvertError = signal<string | null>(null);
  quickConvertLoading = signal(false);

  // The same live currency list used by the full converter is exposed here
  // as an autocomplete picker inside the Dashboard's natural-language box.
  quickCurrencies = signal<CurrencyList>({});
  quickCurrencyCodes = signal<string[]>([]);
  quickCurrencyPickerOpen = signal(false);
  quickCurrencyLoading = signal(false);
  quickCurrencyLoadError = signal(false);
  filteredQuickCurrencies = computed(() => {
    const text = this.quickConvertText.trim().toLowerCase();
    const connectorMatch = text.match(/(?:\bto\b|\binto\b|\bfor\b)\s*([^\s.!?]*)$/i);
    const amountMatch = text.match(/(?:^|\s)([\d,]+(?:\.\d+)?)\s+([^\s.!?]*)$/i);
    const search = connectorMatch?.[1] || amountMatch?.[2] || '';
    const q = search.trim();

    return this.quickCurrencyCodes().filter((code) => {
      if (!q) return true;
      const name = this.quickCurrencies()[code]?.toLowerCase() || '';
      return code.toLowerCase().includes(q) || name.includes(q);
    }).slice(0, 12);
  });

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
        this.quickCurrencyCodes.set(Object.keys(list).sort());
        this.quickCurrencyLoading.set(false);
      },
      error: () => {
        // The picker is only an enhancement. Quick Convert still works via
        // Claude and the existing offline parser if the list API is down.
        this.quickCurrencies.set({});
        this.quickCurrencyCodes.set([]);
        this.quickCurrencyLoading.set(false);
        this.quickCurrencyLoadError.set(true);
      },
    });
  }

  openCurrencyPicker() {
    if (this.quickCurrencyCodes().length > 0) {
      this.quickCurrencyPickerOpen.set(true);
    }
  }

  closeCurrencyPicker() {
    // Delay closing so the option's mousedown event can select the currency.
    setTimeout(() => this.quickCurrencyPickerOpen.set(false), 120);
  }

  selectQuickCurrency(code: string) {
    const text = this.quickConvertText.trim();
    const connector = text.match(/^(.*?\b(?:to|into|for)\b)\s*([^\s.!?]*)$/i);

    if (connector) {
      this.quickConvertText = `${connector[1].trim()} ${code}`;
    } else {
      const amount = text.match(/^(.*?\b[\d,]+(?:\.\d+)?\b)\s*([^\s.!?]*)$/i);
      this.quickConvertText = amount ? `${amount[1].trim()} ${code}` : `${text} ${code}`.trim();
    }

    this.quickCurrencyPickerOpen.set(false);
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
    const text = this.quickConvertText.trim();
    if (!text) {
      this.quickConvertError.set('Type a request first, e.g. "Convert 500 USD to EUR".');
      return;
    }

    this.quickConvertLoading.set(true);

    try {
      const ai = await firstValueFrom(this.aiConversionService.parseConversionRequest(text));
      this.goToConverter(ai.amount, ai.from, ai.to);
      return;
    } catch (err: any) {
      console.warn('AI parsing failed, falling back to regex parser:', err?.error?.error || err);
    } finally {
      this.quickConvertLoading.set(false);
    }

    // Fallback: local regex extraction (no AI, no network round trip).
    const parsed = parseCurrencyRequest(text);
    if (!parsed) {
      this.quickConvertError.set(
        'Couldn\'t understand that request. Try something like "Convert 500 USD to EUR".'
      );
      return;
    }
    this.goToConverter(parsed.amount, parsed.fromRaw, parsed.toRaw);
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
