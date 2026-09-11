import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-wrapper">
      <div class="auth-card">
        <h1>Welcome back</h1>
        <p class="subtitle">Log in to Trip Planner</p>

        @if (errorMsg()) {
          <div class="error-msg">{{ errorMsg() }}</div>
        }

        <form (ngSubmit)="onSubmit()">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
          </div>
          <button class="primary" type="submit" [disabled]="loading()">
            {{ loading() ? 'Logging in…' : 'Log in' }}
          </button>
        </form>

        <div class="switch-link">
          Don't have an account? <a [routerLink]="['/signup']">Sign up</a>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  constructor(private supabase: SupabaseService, private router: Router) {}

  async onSubmit() {
    this.errorMsg.set(null);
    this.loading.set(true);

    const { error } = await this.supabase.signIn(this.email, this.password);

    this.loading.set(false);

    if (error) {
      this.errorMsg.set(error.message);
      return;
    }

    this.router.navigate(['/dashboard']);
  }
}
