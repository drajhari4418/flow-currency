import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import { environment } from '../../environments/environment';

// Attaches the Supabase access token only to requests going to OUR OWN
// backend (environment.apiUrl), so Express can verify who's calling.
// Third-party APIs (like the currency service) never see this token —
// sending it elsewhere would be unnecessary and can break CORS preflight.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isOwnBackend = req.url.startsWith(environment.apiUrl);

  if (isOwnBackend) {
    const supabase = inject(SupabaseService);
    const token = supabase.getAccessToken();

    if (token) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
  }

  return next(req);
};
