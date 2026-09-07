import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY = 'taskflow-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // true = dark theme, false = light theme
  isDark = signal<boolean>(this.readInitialPreference());

  constructor() {
    // Keep <body class="dark-theme"> and localStorage in sync whenever the
    // signal changes (including the very first run).
    effect(() => {
      const dark = this.isDark();
      document.body.classList.toggle('dark-theme', dark);
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.isDark.update((v) => !v);
  }

  private readInitialPreference(): boolean {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    // No saved preference yet — fall back to the OS/browser preference.
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
