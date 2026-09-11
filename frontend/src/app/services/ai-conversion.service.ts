import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AiParsedConversion {
  amount: number;
  from: string;
  to: string;
}

type SpeechPipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text?: string }>;

// Text parsing remains server-side through Claude. Speech-to-text runs locally
// in the user's browser with Whisper via Transformers.js, so there is no
// OpenAI API key, paid speech API, or audio upload required.
@Injectable({ providedIn: 'root' })
export class AiConversionService {
  private baseUrl = `${environment.apiUrl}/ai`;
  private speechPipelinePromise: Promise<SpeechPipeline> | null = null;

  constructor(private http: HttpClient) {}

  parseConversionRequest(text: string): Observable<AiParsedConversion> {
    return this.http.post<AiParsedConversion>(`${this.baseUrl}/parse-conversion`, { text });
  }

  transcribeConversionAudio(audio: Blob): Observable<{ text: string }> {
    return from(this.transcribeLocally(audio));
  }

  private async transcribeLocally(audio: Blob): Promise<{ text: string }> {
    const transcriber = await this.getSpeechPipeline();
    const audioData = await this.decodeAndResampleAudio(audio, 16000);

    const result = await transcriber(audioData, {
      task: 'transcribe',
    });

    const text = String(result?.text || '').trim();
    if (!text) {
      throw new Error('No speech was detected in the recording.');
    }

    return { text };
  }

  private getSpeechPipeline(): Promise<SpeechPipeline> {
    if (!this.speechPipelinePromise) {
      this.speechPipelinePromise = import('@huggingface/transformers')
        .then(async ({ pipeline }) => {
          const transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny',
            {
              dtype: 'q8',
            }
          );
          return transcriber as unknown as SpeechPipeline;
        })
        .catch((error) => {
          this.speechPipelinePromise = null;
          console.error('Local Whisper initialization failed:', error);
          throw new Error('Could not load the local speech model. Check your internet connection and try again.');
        });
    }

    return this.speechPipelinePromise;
  }

  private async decodeAndResampleAudio(audio: Blob, targetSampleRate: number): Promise<Float32Array> {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('This browser does not support audio processing.');
    }

    const context = new AudioContextClass();
    try {
      const buffer = await context.decodeAudioData(await audio.arrayBuffer());
      const mono = this.toMono(buffer);

      if (buffer.sampleRate === targetSampleRate) {
        return mono;
      }

      const targetLength = Math.max(1, Math.round(mono.length * targetSampleRate / buffer.sampleRate));
      const resampled = new Float32Array(targetLength);
      const ratio = buffer.sampleRate / targetSampleRate;

      for (let i = 0; i < targetLength; i += 1) {
        const sourcePosition = i * ratio;
        const left = Math.min(Math.floor(sourcePosition), mono.length - 1);
        const right = Math.min(left + 1, mono.length - 1);
        const weight = sourcePosition - left;
        resampled[i] = mono[left] * (1 - weight) + mono[right] * weight;
      }

      return resampled;
    } finally {
      await context.close();
    }
  }

  private toMono(buffer: AudioBuffer): Float32Array {
    if (buffer.numberOfChannels === 1) {
      return buffer.getChannelData(0).slice();
    }

    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / buffer.numberOfChannels;
      }
    }
    return mono;
  }
}
