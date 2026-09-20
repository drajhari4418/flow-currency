import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  // Injecting ThemeService here (even unused directly) ensures it's
  // instantiated on app boot, so the saved/system theme preference is
  // applied to <body> before any page renders.
  constructor(private theme: ThemeService) {}
}
