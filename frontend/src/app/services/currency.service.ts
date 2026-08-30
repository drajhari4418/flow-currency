import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CurrencyList {
  [code: string]: string; // e.g. { USD: "United States Dollar", EUR: "Euro" }
}

export interface ConversionResult {
  amount: number;
  base: string;
  date: string;
  rates: { [code: string]: number };
}

// Frankfurter (https://frankfurter.dev) is a free, no-API-key currency API
// backed by daily European Central Bank reference rates. No auth needed,
// and it allows browser CORS requests, so we can call it directly from
// Angular without routing it through our own backend.
const BASE_URL = 'https://api.frankfurter.dev/v1';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  constructor(private http: HttpClient) {}

  getCurrencies(): Observable<CurrencyList> {
    return this.http.get<CurrencyList>(`${BASE_URL}/currencies`);
  }

  convert(amount: number, from: string, to: string): Observable<ConversionResult> {
    const params = new URLSearchParams({
  amount: amount.toString(),
  base: from,
  symbols: to,
});
    return this.http.get<ConversionResult>(`${BASE_URL}/latest?${params.toString()}`);
  }
}
