import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-wrapper">
      <div class="auth-card">
        <h1>Create an account</h1>
        <p class="subtitle">Sign up for TaskFlow</p>

        @if (errorMsg()) {
          <div class="error-msg">{{ errorMsg() }}</div>
        }
        @if (successMsg()) {
          <div class="error-msg" style="background:#ecfdf5;color:#047857;">{{ successMsg() }}</div>
        }

        <form (ngSubmit)="onSubmit()">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" name="password" [(ngModel)]="password" required minlength="6" autocomplete="new-password" />
          </div>
          <button class="primary" type="submit" [disabled]="loading()">
            {{ loading() ? 'Creating account…' : 'Sign up' }}
          </button>
        </form>

        <div class="switch-link">
          Already have an account? <a [routerLink]="['/login']">Log in</a>
        </div>
      </div>
    </div>
  `,
})
export class SignupComponent {
  email = '';
  password = '';
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  constructor(private supabase: SupabaseService, private router: Router) {}

  async onSubmit() {
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.loading.set(true);

    const { data, error } = await this.supabase.signUp(this.email, this.password);

    this.loading.set(false);

    if (error) {
      this.errorMsg.set(error.message);
      return;
    }

    // If email confirmation is enabled in your Supabase project, there'll be
    // no active session yet — the user needs to confirm via email first.
    if (data.session) {
      this.router.navigate(['/dashboard']);
    } else {
      this.successMsg.set('Account created! Check your email to confirm, then log in.');
    }
  }
}
