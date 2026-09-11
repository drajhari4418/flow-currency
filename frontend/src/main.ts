import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { createClient } from '@supabase/supabase-js';
import { environment } from './environments/environment';

// Replace Chrome's unreliable browser SpeechRecognition network service with
// MediaRecorder -> authenticated backend -> OpenAI speech-to-text.
(function installBackendSpeechRecognition() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return;

  const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
  const mimeType = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';

  class BackendSpeechRecognition {
    grammars = {};
    lang = 'en-IN';
    continuous = true;
    interimResults = true;
    maxAlternatives = 1;
    onstart: ((event: Event) => void) | null = null;
    onresult: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onend: ((event: Event) => void) | null = null;
    private recorder: MediaRecorder | null = null;
    private stream: MediaStream | null = null;
    private chunks: Blob[] = [];
    private active = false;

    start() {
      if (this.active) return;
      this.active = true;
      this.chunks = [];
      const type = mimeType();
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        this.stream = stream;
        this.recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
        this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
        this.recorder.onerror = () => this.fail('audio-capture', 'The browser could not record audio.');
        this.recorder.onstop = () => {
          const audio = new Blob(this.chunks, { type: this.recorder?.mimeType || type || 'audio/webm' });
          this.releaseStream();
          void this.transcribe(audio);
        };
        this.recorder.start();
        this.onstart?.(new Event('start'));
      }).catch((error) => {
        this.active = false;
        this.onerror?.({ error: error?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture', message: error?.message || '' });
        this.onend?.(new Event('end'));
      });
    }

    stop() {
      if (!this.active) return;
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
      else { this.releaseStream(); this.active = false; this.onend?.(new Event('end')); }
    }

    abort() { this.stop(); }

    private async transcribe(audio: Blob) {
      if (!audio.size) { this.fail('audio-capture', 'No audio was recorded.'); return; }
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) { this.fail('not-allowed', 'No authenticated session was found. Please sign in again.'); return; }
        const response = await fetch(`${environment.apiUrl}/speech/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': audio.type || 'audio/webm', Authorization: `Bearer ${token}` },
          body: audio,
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Speech-to-text request failed.');
        const text = String(body.text || '').trim();
        this.active = false;
        if (!text) { this.fail('no-speech', 'No speech was detected in the recording.'); return; }
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text, confidence: 1 } }] });
        this.onend?.(new Event('end'));
      } catch (error: any) {
        this.fail('network', error?.message || 'Speech-to-text request failed.');
      }
    }

    private fail(error: string, message: string) {
      this.active = false;
      this.releaseStream();
      this.onerror?.({ error, message });
      this.onend?.(new Event('end'));
    }

    private releaseStream() {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;
    }
  }

  (window as any).SpeechRecognition = BackendSpeechRecognition;
  (window as any).webkitSpeechRecognition = BackendSpeechRecognition;
})();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
