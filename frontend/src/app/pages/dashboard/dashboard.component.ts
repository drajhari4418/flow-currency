import { Component, NgZone, OnDestroy, OnInit, computed, signal } from '@angular/core';
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
          <label for="quickFrom">From</label>
          <select
            id="quickFrom"
            name="quickFrom"
            [(ngModel)]="quickFromCurrency"
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

        <button class="primary quick-convert-button" type="submit" [disabled]="quickConvertLoading() || quickCurrencyLoading() || !quickAmount || !quickFromCurrency || !quickToCurrency">
          {{ quickConvertLoading() ? 'Converting…' : 'Convert' }}
        </button>
      </form>

      <form class="quick-ai-form" (ngSubmit)="submitQuickConvertText()">
        <div class="quick-convert-field quick-ai-field">
          <label for="quickConvertText">Or use AI text</label>
          <div class="speech-input-wrap">
            <input
              id="quickConvertText"
              type="text"
              name="quickConvertText"
              [(ngModel)]="quickConvertText"
              [disabled]="quickConvertLoading()"
              placeholder='e.g. Convert 500 USD to EUR'
              autocomplete="off"
            />
            <button
              type="button"
              class="speech-mic-button"
              [class.listening]="speechListening()"
              [disabled]="quickConvertLoading() || !speechSupported"
              (click)="toggleSpeechRecognition()"
              [title]="speechListening() ? 'Stop listening' : (speechSupported ? 'Speak your conversion request' : 'Speech recognition is not supported in this browser')"
              aria-label="Use microphone for speech recognition"
            >
              {{ speechListening() ? '⏹' : '🎙️' }}
            </button>
          </div>
        </div>
        <button class="secondary quick-ai-button" type="submit" [disabled]="quickConvertLoading() || !quickConvertText.trim()">
          {{ quickConvertLoading() ? 'Reading…' : 'Use text' }}
        </button>
      </form>

      @if (quickConvertError()) {
        <div class="error-msg">{{ quickConvertError() }}</div>
      }
      @if (quickConvertResult()) {
        <div class="error-msg" style="background:var(--success-bg); color:var(--success-text);">
          {{ quickConvertResult() }}
        </div>
      }
      <div class="hint-text">
        Choose Amount + From + To for a direct conversion, or type or speak a natural-language request and let AI fill the conversion fields. Click the microphone to speak your request. The currency lists are loaded from the live currency source.
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
            No conversions yet. Use Quick Convert above to make your first one.
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
export class DashboardComponent implements OnInit, OnDestroy {
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
  quickFromCurrency = 'USD';
  quickToCurrency = 'EUR';
  quickConvertText = '';
  quickConvertError = signal<string | null>(null);
  quickConvertResult = signal<string | null>(null);
  quickConvertLoading = signal(false);
  speechListening = signal(false);
  speechSupported = false;
  private speechRecognition: any = null;
  private speechStopRequested = false;
  private speechTranscript = '';

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
    private router: Router,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.userEmail = this.supabase.currentUserEmail();
    this.fetchTasks();
    this.fetchConversionOverview();
    this.loadQuickCurrencies();
    this.initializeSpeechRecognition();
  }

  private initializeSpeechRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.speechSupported = false;
      return;
    }

    this.speechSupported = true;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      this.zone.run(() => {
        this.speechListening.set(true);
        this.quickConvertError.set(null);
      });
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText.trim()) {
        this.speechTranscript += (this.speechTranscript ? ' ' : '') + finalText.trim();
      }

      const combined = (this.speechTranscript + (interimText ? ' ' + interimText.trim() : '')).trim();
      if (combined) {
        this.zone.run(() => this.quickConvertText = combined);
      }
    };

    recognition.onerror = (event: any) => {
      const error = event?.error || 'unknown';
      console.error('Speech recognition error:', error, event);

      this.zone.run(() => {
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.speechStopRequested = true;
          this.speechListening.set(false);
          this.quickConvertError.set('Microphone access was blocked. Allow microphone access for this site in Chrome, then click the microphone again.');
        } else if (error === 'no-speech') {
          this.quickConvertError.set('No speech detected. Keep speaking or click the microphone again.');
        } else if (error === 'audio-capture') {
          this.speechStopRequested = true;
          this.speechListening.set(false);
          this.quickConvertError.set('No microphone was found or another app is using it. Check your Windows microphone settings.');
        } else if (error === 'network') {
          this.quickConvertError.set('Speech recognition service is unavailable. Check your internet connection and try again.');
        }
      });
    };

    recognition.onend = () => {
      this.zone.run(() => this.speechListening.set(false));

      // Chrome can end recognition by itself after a short pause. Keep the
      // microphone active until the user explicitly clicks Stop.
      if (!this.speechStopRequested && this.speechSupported) {
        window.setTimeout(() => {
          if (this.speechStopRequested || !this.speechRecognition) return;
          try {
            this.speechRecognition.start();
          } catch (err) {
            console.debug('Speech recognition restart skipped:', err);
          }
        }, 150);
      }
    };

    this.speechRecognition = recognition;
  }

  toggleSpeechRecognition() {
    if (!this.speechSupported || !this.speechRecognition) {
      this.quickConvertError.set('Speech recognition is not supported in this browser. Please use Google Chrome or another Chromium-based browser.');
      return;
    }

    this.quickConvertError.set(null);

    if (this.speechListening()) {
      this.speechStopRequested = true;
      this.speechRecognition.stop();
      this.zone.run(() => this.speechListening.set(false));
      return;
    }

    this.speechStopRequested = false;
    this.speechTranscript = '';
    this.quickConvertText = '';

    try {
      this.speechRecognition.start();
    } catch (err: any) {
      console.error('Could not start speech recognition:', err);
      this.speechListening.set(false);
      this.quickConvertError.set('Could not start the microphone. Check browser microphone permission and try again.');
    }
  }

  ngOnDestroy() {
    this.speechStopRequested = true;
    if (this.speechRecognition) {
      try {
        this.speechRecognition.stop();
      } catch {
        // Recognition may already be stopped.
      }
      this.speechRecognition = null;
    }
  }

  private loadQuickCurrencies() {
    this.quickCurrencyLoading.set(true);
    this.quickCurrencyLoadError.set(false);
    this.currencyService.getCurrencies().subscribe({
      next: (list) => {
        this.quickCurrencies.set(list);
        const codes = Object.keys(list).sort();
        this.quickCurrencyCodes.set(codes);
        if (!list[this.quickFromCurrency]) {
          this.quickFromCurrency = codes.includes('USD') ? 'USD' : (codes[0] || '');
        }
        if (!list[this.quickToCurrency] || this.quickToCurrency === this.quickFromCurrency) {
          this.quickToCurrency = codes.find((code) => code !== this.quickFromCurrency) || '';
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
      this.conversionService.getHistory(),
    ]);
    this.stats.set(stats);
    this.recentConversions.set(history);
    this.statsLoading.set(false);
  }

  /**
   * Handles the structured conversion form directly on this dashboard.
   * The separate separate currency route has been removed, so conversion never
   * navigates away from the main UI.
   */
  async submitQuickConvert() {
    this.quickConvertError.set(null);
    this.quickConvertResult.set(null);

    const amount = Number(this.quickAmount);
    const from = this.quickFromCurrency?.trim().toUpperCase();
    const to = this.quickToCurrency?.trim().toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      this.quickConvertError.set('Enter an amount greater than zero.');
      return;
    }
    if (!from || !this.quickCurrencyCodes().includes(from)) {
      this.quickConvertError.set('Please select a valid From currency.');
      return;
    }
    if (!to || !this.quickCurrencyCodes().includes(to)) {
      this.quickConvertError.set('Please select a valid To currency.');
      return;
    }
    if (from === to) {
      this.quickConvertError.set('From and To currencies must be different.');
      return;
    }

    this.quickConvertText = `Convert ${amount} ${from} to ${to}`;
    await this.performQuickConversion(amount, from, to);
  }

  async submitQuickConvertText() {
    this.quickConvertError.set(null);
    this.quickConvertResult.set(null);
    const text = this.quickConvertText.trim();
    if (!text) {
      this.quickConvertError.set('Type a conversion request first.');
      return;
    }

    this.quickConvertLoading.set(true);
    try {
      const ai = await firstValueFrom(this.aiConversionService.parseConversionRequest(text));
      const amount = Number(ai.amount);
      const from = ai.from?.trim().toUpperCase();
      const to = ai.to?.trim().toUpperCase();

      if (!Number.isFinite(amount) || amount <= 0 ||
          !this.quickCurrencyCodes().includes(from) ||
          !this.quickCurrencyCodes().includes(to)) {
        throw new Error('AI returned an unsupported currency or amount.');
      }
      if (from === to) {
        throw new Error('From and To currencies must be different.');
      }

      this.quickAmount = amount;
      this.quickFromCurrency = from;
      this.quickToCurrency = to;
      await this.performQuickConversion(amount, from, to);
      return;
    } catch (err: any) {
      const parsed = parseCurrencyRequest(text);
      if (parsed) {
        const from = this.resolveQuickCurrency(parsed.fromRaw);
        const to = this.resolveQuickCurrency(parsed.toRaw);
        if (from && to && from !== to) {
          this.quickAmount = parsed.amount;
          this.quickFromCurrency = from;
          this.quickToCurrency = to;
          await this.performQuickConversion(parsed.amount, from, to);
          return;
        }
      }
      this.quickConvertError.set('Could not understand that request. Try: Convert 500 USD to EUR');
    } finally {
      this.quickConvertLoading.set(false);
    }
  }

  private async performQuickConversion(amount: number, from: string, to: string) {
    this.quickConvertLoading.set(true);
    try {
      const response = await firstValueFrom(this.currencyService.convert(amount, from, to));
      const result = response.rates[to];

      if (!Number.isFinite(result)) {
        throw new Error('No conversion rate returned.');
      }

      await this.conversionService.logConversion(amount, from, to, result);
      this.quickConvertResult.set(
        `${amount.toLocaleString()} ${from} = ${result.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${to}`
      );

      // Refresh the overview so the new conversion immediately appears in
      // the same dashboard UI.
      await this.fetchConversionOverview();
    } catch (err) {
      console.error('Quick conversion failed:', err);
      this.quickConvertError.set('Conversion failed. The rates API may be temporarily unavailable.');
    } finally {
      this.quickConvertLoading.set(false);
    }
  }

  private resolveQuickCurrency(raw: string): string | null {
    const normalized = raw.trim().toLowerCase();
    const code = normalized.toUpperCase();
    if (/^[A-Z]{3}$/.test(code) && this.quickCurrencies()[code]) return code;

    const exact = Object.entries(this.quickCurrencies()).find(([, name]) => name.toLowerCase() === normalized);
    if (exact) return exact[0];

    const partial = Object.entries(this.quickCurrencies()).find(([, name]) => name.toLowerCase().includes(normalized));
    return partial ? partial[0] : null;
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
