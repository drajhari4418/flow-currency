import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  );

  // Reactive signal so components/guards can read the current session synchronously.
  session = signal<Session | null>(null);

  constructor() {
    // Load whatever session exists on startup (Supabase persists it in localStorage).
    this.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });

    // Keep the signal in sync whenever auth state changes (login, logout, refresh).
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  signUp(email: string, password: string) {
    return this.client.auth.signUp({ email, password });
  }

  signIn(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  signOut() {
    return this.client.auth.signOut();
  }

  getAccessToken(): string | null {
    return this.session()?.access_token ?? null;
  }

  currentUserEmail(): string | null {
    return this.session()?.user?.email ?? null;
  }

  currentUserId(): string | null {
    return this.session()?.user?.id ?? null;
  }

  /**
   * Exposes the underlying Supabase client so other services (e.g.
   * ConversionService) can query tables directly with the user's own
   * session — respecting Row Level Security — without going through
   * the Node backend. Only use this for data that doesn't need the
   * backend's business logic (the "tasks" table still goes through
   * TaskService -> Express -> supabaseAdmin).
   */
  getClient(): SupabaseClient {
    return this.client;
  }
}
