import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TaskService, Task, TaskPriority } from '../../services/task.service';
import { ThemeService } from '../../services/theme.service';

// How long a completed task stays visible (checked, struck through) before
// it's auto-deleted. Not specified by the user — chosen as a reasonable
// "a few seconds" default; adjust COMPLETE_REMOVE_DELAY_MS to change it.
const COMPLETE_REMOVE_DELAY_MS = 3000;

// How many days past its due date an incomplete task is allowed to sit
// before being auto-deleted. Not specified by the user — chosen as a
// reasonable default so a task isn't deleted the moment it's overdue;
// adjust OVERDUE_DELETE_GRACE_DAYS to change it.
const OVERDUE_DELETE_GRACE_DAYS = 3;

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>Tasks</h1>
          <div class="email">
            <a [routerLink]="['/dashboard']" style="color:inherit;">&larr; Back to dashboard</a>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="theme-toggle" (click)="theme.toggle()" [title]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
            {{ theme.isDark() ? '☀️' : '🌙' }}
          </button>
        </div>
      </div>

      @if (errorMsg()) {
        <div class="error-msg">{{ errorMsg() }}</div>
      }

      <!-- ===== Reminder banners (in-app half of the reminder feature —
           the backend's daily job covers the email half). Two independent
           groups: due today and due tomorrow. ===== -->
      @if (!loading() && (dueTodayTasks().length > 0 || dueTomorrowTasks().length > 0)) {
        <div class="reminder-banner-group">
          @if (dueTodayTasks().length > 0) {
            <div class="reminder-banner reminder-banner-today" role="status">
              <div class="reminder-banner-title">🔥 Due today ({{ dueTodayTasks().length }})</div>
              <ul class="reminder-banner-list">
                @for (t of dueTodayTasks(); track t.id) {
                  <li>
                    {{ t.title }}
                    <span class="badge" [class.badge-low]="t.priority === 'low'" [class.badge-medium]="t.priority === 'medium'" [class.badge-high]="t.priority === 'high'">
                      {{ t.priority }}
                    </span>
                  </li>
                }
              </ul>
            </div>
          }
          @if (dueTomorrowTasks().length > 0) {
            <div class="reminder-banner" role="status">
              <div class="reminder-banner-title">⏰ Due tomorrow ({{ dueTomorrowTasks().length }})</div>
              <ul class="reminder-banner-list">
                @for (t of dueTomorrowTasks(); track t.id) {
                  <li>
                    {{ t.title }}
                    <span class="badge" [class.badge-low]="t.priority === 'low'" [class.badge-medium]="t.priority === 'medium'" [class.badge-high]="t.priority === 'high'">
                      {{ t.priority }}
                    </span>
                  </li>
                }
              </ul>
            </div>
          }
        </div>
      }

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

      <div class="hint-text" style="margin-bottom:16px;">
        Checked-off tasks fade out and are removed automatically a few seconds
        later. Tasks left overdue for more than {{ overdueGraceDays }} days are
        cleaned up automatically too — there's no undo, so use due dates you
        actually mean.
      </div>

      @if (loading()) {
        <div class="empty-state">Loading tasks…</div>
      } @else if (tasks().length === 0) {
        <div class="empty-state">No tasks yet — add your first one above.</div>
      } @else {
        <div class="task-card-grid">
          @for (task of tasks(); track task.id) {
            <div
              class="task-card"
              [class.done]="task.is_complete"
              [class.pending-removal]="pendingRemovalIds().has(task.id)"
              [class.priority-low]="task.priority === 'low'"
              [class.priority-medium]="task.priority === 'medium'"
              [class.priority-high]="task.priority === 'high'"
            >
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
export class TasksComponent implements OnInit, OnDestroy {
  tasks = signal<Task[]>([]);
  loading = signal(true);
  adding = signal(false);
  errorMsg = signal<string | null>(null);

  newTitle = '';
  newPriority: TaskPriority = 'medium';
  newDueDate: string | null = null;

  overdueGraceDays = OVERDUE_DELETE_GRACE_DAYS;

  // Tasks currently mid fade-out, about to be auto-deleted once their timer
  // fires. Tracked separately from `tasks()` so the CSS transition has
  // something to animate before the task actually disappears from the list.
  pendingRemovalIds = signal<Set<string>>(new Set());
  private pendingRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  completedCount = computed(() => this.tasks().filter((t) => t.is_complete).length);
  progressPercent = computed(() => {
    const total = this.tasks().length;
    return total === 0 ? 0 : Math.round((this.completedCount() / total) * 100);
  });

  // Compared against due_date (a plain YYYY-MM-DD string from Postgres) —
  // built from local Y/M/D parts rather than toISOString() to avoid
  // timezone drift shifting which calendar day "today"/"tomorrow" means.
  dueTodayTasks = computed(() => {
    const todayStr = this.formatLocalDate(new Date());
    return this.tasks().filter((t) => !t.is_complete && t.due_date === todayStr);
  });

  dueTomorrowTasks = computed(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.formatLocalDate(tomorrow);
    return this.tasks().filter((t) => !t.is_complete && t.due_date === tomorrowStr);
  });

  constructor(private taskService: TaskService, public theme: ThemeService) {}

  ngOnInit() {
    this.fetchTasks();
  }

  ngOnDestroy() {
    // Cancel any pending auto-deletions rather than let them fire after
    // the component (and its list) is gone.
    this.pendingRemovalTimers.forEach((timer) => clearTimeout(timer));
    this.pendingRemovalTimers.clear();
  }

  fetchTasks() {
    this.loading.set(true);
    this.taskService.list().subscribe({
      next: (tasks) => this.sweepOverdueTasks(tasks),
      error: () => {
        this.errorMsg.set('Could not load tasks. Is the backend running?');
        this.loading.set(false);
      },
    });
  }

  /**
   * Removes (from the visible list, then from the database) any incomplete
   * task whose due date is more than OVERDUE_DELETE_GRACE_DAYS in the past.
   * Runs once per page load — a task sitting overdue only gets swept the
   * next time someone actually opens this page.
   */
  private sweepOverdueTasks(tasks: Task[]) {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - OVERDUE_DELETE_GRACE_DAYS);

    const toDelete = tasks.filter(
      (t) => !t.is_complete && t.due_date && new Date(t.due_date) < cutoff
    );
    const keep = tasks.filter((t) => !toDelete.includes(t));

    this.tasks.set(keep);
    this.loading.set(false);

    // Fire-and-forget: already excluded from the UI above, so a slow or
    // failed delete here doesn't block or flicker anything visible.
    toDelete.forEach((t) => {
      this.taskService.delete(t.id).subscribe({
        error: () => console.warn(`Could not auto-delete overdue task ${t.id}`),
      });
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

        if (updated.is_complete) {
          this.scheduleAutoRemoval(updated.id);
        } else {
          this.cancelAutoRemoval(updated.id);
        }
      },
    });
  }

  private scheduleAutoRemoval(id: string) {
    this.cancelAutoRemoval(id); // avoid stacking duplicate timers

    this.pendingRemovalIds.update((set) => new Set(set).add(id));

    const timer = setTimeout(() => {
      this.taskService.delete(id).subscribe({
        next: () => {
          this.tasks.update((list) => list.filter((t) => t.id !== id));
          this.clearPendingState(id);
        },
        error: () => {
          // Deletion failed — undo the fade so the card isn't stuck
          // looking half-removed while still actually existing.
          this.clearPendingState(id);
        },
      });
    }, COMPLETE_REMOVE_DELAY_MS);

    this.pendingRemovalTimers.set(id, timer);
  }

  private cancelAutoRemoval(id: string) {
    const timer = this.pendingRemovalTimers.get(id);
    if (timer) clearTimeout(timer);
    this.clearPendingState(id);
  }

  private clearPendingState(id: string) {
    this.pendingRemovalTimers.delete(id);
    if (this.pendingRemovalIds().has(id)) {
      this.pendingRemovalIds.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }
  }

  remove(task: Task) {
    this.cancelAutoRemoval(task.id);
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

  private formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
