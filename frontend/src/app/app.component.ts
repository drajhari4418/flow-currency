import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';
import { ForecastPanelComponent } from './components/forecast-panel/forecast-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ForecastPanelComponent],
  // The forecast panel lives here (not inside a page) so it stays open when
  // the Dashboard's Convert button navigates to /currency.
  template: `
    <router-outlet></router-outlet>
    <app-forecast-panel></app-forecast-panel>
  `,
})
export class AppComponent {
  // Injecting ThemeService here (even unused directly) ensures it's
  // instantiated on app boot, so the saved/system theme preference is
  // applied to <body> before any page renders.
  constructor(private theme: ThemeService) {}
}
