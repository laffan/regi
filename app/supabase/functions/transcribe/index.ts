// POST /functions/v1/transcribe   multipart/form-data, field "audio"
//
// Voice logging. Speech in, text out — and that is all: the text goes back to
// the Log's input line, where it is read, corrected if need be, and sent to
// parse-log like anything typed. Nothing reaches a module from here.

import { corsHeaders, json, preflight, requireUser } from '../_shared/http.ts';
import { openAIKey, TRANSCRIBE_MODEL } from '../_shared/openai.ts';

const MAX_BYTES = 10 * 1024 * 1024; // a log line is seconds of speech, not minutes

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { user } = await requireUser(req);
  if (!user) return json({ error: 'not signed in' }, 401);

  const key = openAIKey();
  if (!key) {
    return json({ error: 'Voice logging needs OPENAI_API_KEY set on the server.', code: 'not_configured' }, 501);
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const field = form.get('audio');
    audio = field instanceof File ? field : null;
  } catch {
    return json({ error: 'expected multipart form data with an "audio" file' }, 400);
  }
  if (!audio || audio.size === 0) return json({ error: 'no audio received' }, 400);
  if (audio.size > MAX_BYTES) return json({ error: 'that recording is too long for one log line' }, 413);

  const upstream = new FormData();
  upstream.append('file', audio, audio.name || 'speech.webm');
  upstream.append('model', TRANSCRIBE_MODEL);
  upstream.append('response_format', 'json');
  // Vocabulary the log is full of, so "182.4" and "kcal" come back as written.
  upstream.append(
    'prompt',
    'A habit-tracking log line: foods and portions, a weigh-in in lb or kg, pages read, miles run, words written, hours slept.',
  );

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: upstream,
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    return json({ error: `transcription failed (${res.status})`, detail }, 502);
  }

  const body = await res.json();
  const text = String(body?.text ?? '').trim();
  return new Response(JSON.stringify({ text, model: TRANSCRIBE_MODEL }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
