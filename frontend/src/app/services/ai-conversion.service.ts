import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiParsedConversion {
  amount: number;
  from: string;
  to: string;
}

// Calls our own Express backend (never the Anthropic API directly from the
// browser — that would expose the API key). The existing auth interceptor
// automatically attaches the user's Supabase JWT to this request, since the
// URL matches environment.apiUrl.
@Injectable({ providedIn: 'root' })
export class AiConversionService {
  private baseUrl = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  parseConversionRequest(text: string): Observable<AiParsedConversion> {
    return this.http.post<AiParsedConversion>(`${this.baseUrl}/parse-conversion`, { text });
  }

  transcribeConversionAudio(audio: Blob): Observable<{ text: string }> {
    return this.http.post<{ text: string }>(`${this.baseUrl}/transcribe-conversion`, audio, {
      headers: { 'Content-Type': audio.type || 'audio/webm' },
    });
  }
}
