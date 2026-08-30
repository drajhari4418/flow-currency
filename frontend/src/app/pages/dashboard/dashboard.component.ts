import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { TaskService, Task } from '../../services/task.service';

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
        <div style="display:flex; gap:8px;">
          <a class="secondary" style="text-decoration:none;padding:8px 14px;" [routerLink]="['/currency']">
            Currency converter
          </a>
          <button class="secondary" (click)="logout()">Log out</button>
        </div>
      </div>

      @if (errorMsg()) {
        <div class="error-msg">{{ errorMsg() }}</div>
      }

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
  `,
})
export class DashboardComponent implements OnInit {
  tasks = signal<Task[]>([]);
  loading = signal(true);
  adding = signal(false);
  errorMsg = signal<string | null>(null);
  newTitle = '';
  userEmail: string | null = null;

  constructor(
    private taskService: TaskService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    this.userEmail = this.supabase.currentUserEmail();
    this.fetchTasks();
  }

  fetchTasks() {
    this.loading.set(true);
    this.taskService.list().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set('Could not load tasks. Is the backend running?');
        this.loading.set(false);
      },
    });
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
