# Microphone speech-to-text flow

The dashboard microphone no longer uses the browser `SpeechRecognition` / `webkitSpeechRecognition` API.

The flow is now:

1. Browser asks for microphone permission.
2. `MediaRecorder` records the user's request as audio.
3. Angular uploads the audio to `POST /api/ai/transcribe-conversion`.
4. Express sends the audio to OpenAI's Audio Transcriptions API using `gpt-4o-mini-transcribe` by default.
5. The backend returns the transcript to Angular.
6. Angular sends that transcript to the existing `/api/ai/parse-conversion` endpoint.
7. The existing AI currency parser extracts amount/from/to and performs the normal currency conversion.

## Backend environment

Add these to the backend environment (Render environment variables for production):

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Keep `OPENAI_API_KEY` server-side only. Do not put it in Angular environment files or frontend code.

The existing natural-language currency parser still requires the project's configured `ANTHROPIC_API_KEY`.

## Local development

Start the backend and frontend normally. Open the frontend over `http://localhost` or HTTPS so the browser can grant microphone permission.

Click the microphone, speak a request such as:

`Convert 500 dollars to euros`

Click the microphone again to stop. The recording is uploaded, transcribed, parsed, and converted automatically.
