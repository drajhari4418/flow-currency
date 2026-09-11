import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiParsedConversion {
  amount: number;
  from: string;
  to: string;
}

// All AI work stays server-side. The Angular app sends text/audio only to
// our Express backend; Anthropic and OpenAI keys are never exposed here.
@Injectable({ providedIn: 'root' })
export class AiConversionService {
  private baseUrl = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  parseConversionRequest(text: string): Observable<AiParsedConversion> {
    return this.http.post<AiParsedConversion>(`${this.baseUrl}/parse-conversion`, { text });
  }

  transcribeConversionAudio(audio: Blob): Observable<{ text: string }> {
    const contentType = audio.type || 'audio/webm';

    return this.http.post<{ text: string }>(
      `${this.baseUrl}/transcribe-conversion`,
      audio,
      {
        headers: {
          'Content-Type': contentType,
          Accept: 'application/json',
        },
      }
    );
  }
}
