import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiParsedConversion {
  amount: number;
  from: string;
  to: string;
}

// Calls our own Express backend (never the Anthropic/OpenAI APIs directly
// from the browser, so API keys remain server-side).
@Injectable({ providedIn: 'root' })
export class AiConversionService {
  private baseUrl = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  parseConversionRequest(text: string): Observable<AiParsedConversion> {
    return this.http.post<AiParsedConversion>(`${this.baseUrl}/parse-conversion`, { text });
  }
}
