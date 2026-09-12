import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { SignupComponent } from './pages/signup/signup.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CurrencyConvertorComponent } from './pages/currency-convertor/currency-convertor.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'currency-convertor', component: CurrencyConvertorComponent, canActivate: [authGuard] },
  { path: 'currency-converter', component: CurrencyConvertorComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' },
];
