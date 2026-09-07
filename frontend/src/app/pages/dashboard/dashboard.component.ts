import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { TaskService, Task } from '../../services/task.service';
import { ConversionService, ConversionStats } from '../../services/conversion.service';
import { ThemeService } from '../../services/theme.service';

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

      <!-- ===== Currency conversion overview — pulled onto the main dashboard
           so the todo list's landing page also reflects conversion activity,
           instead of that data living only on the separate /currency page. -->
      <div class="section-title">Currency Overview</div>
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
                <tr><th>Date</th><th>Amount</th><th>From</th><th>To</th><th>Result</th></tr>
              </thead>
              <tbody>
                @for (row of recentConversions(); track row.id) {
                  <tr>
                    <td>{{ row.created_at | date:'medium' }}</td>
                    <td>{{ row.amount | number:'1.2-2' }}</td>
                    <td>{{ row.from_currency }}</td>
                    <td>{{ row.to_currency }}</td>
                    <td>{{ row.result | number:'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state">
            No conversions yet. Head to the <a [routerLink]="['/currency']">currency converter</a> to make your first one.
          </div>
        }
      }

      <!-- ===== Tasks (todo list) ===== -->
      <div class="section-title" style="margin-top:32px;">Tasks</div>

      <form class="task-form" (ngSubmit)="addTask()">
        <input
          type="text"
          name="newTitle"
          placeholder="What needs doing?"
          [(ngModel)]="newTitle"
          required
        />
        <button class="primary" style="width:auto;" type="submit" [disabled]="adding()">
          {{ adding() ? 'Adding…' : 'Add' }}
        </button>
      </form>

      @if (loading()) {
        <div class="empty-state">Loading tasks…</div>
      } @else if (tasks().length === 0) {
        <div class="empty-state">No tasks yet — add your first one above.</div>
      } @else {
        <ul class="task-list">
          @for (task of tasks(); track task.id) {
            <li class="task-item" [class.done]="task.is_complete">
              <input type="checkbox" [checked]="task.is_complete" (change)="toggle(task)" />
              <span class="task-title">{{ task.title }}</span>
              <button class="delete" (click)="remove(task)">Delete</button>
            </li>
          }
        </ul>
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
  userEmail: string | null = null;

  stats = signal<ConversionStats>({
    total: 0,
    favoritePair: '—',
    favoriteCurrency: '—',
    lastConversion: '—',
  });
  recentConversions = signal<import('../../services/conversion.service').ConversionRow[]>([]);
  statsLoading = signal(true);

  constructor(
    private taskService: TaskService,
    private supabase: SupabaseService,
    private conversionService: ConversionService,
    public theme: ThemeService,
    private router: Router
  ) {}

  ngOnInit() {
    this.userEmail = this.supabase.currentUserEmail();
    this.fetchTasks();
    this.fetchConversionOverview();
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

  addTask() {
    if (!this.newTitle.trim()) return;
    this.adding.set(true);

    this.taskService.create(this.newTitle.trim()).subscribe({
      next: (task) => {
        this.tasks.update((list) => [task, ...list]);
        this.newTitle = '';
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

  remove(task: Task) {
    this.taskService.delete(task.id).subscribe({
      next: () => {
        this.tasks.update((list) => list.filter((t) => t.id !== task.id));
      },
    });
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
