// Voice logging. Press to speak, press again to stop; the words are
// transcribed on the server and handed back to the input line, where they can
// be read and corrected before anything is parsed. Speaking is just another
// way of typing — it never skips review.

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { transcribe } from '@/data/api';

const MAX_SECONDS = 60;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
}

export function VoiceButton({
  onText,
  disabled,
  attached,
}: {
  onText: (text: string) => void;
  disabled?: boolean;
  /** Sitting inside a dashboard input line: matched to its height, no gap. */
  attached?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stop();
  };

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access was refused.');
      return;
    }

    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (!blob.size) {
        setState('idle');
        return;
      }
      setState('transcribing');
      try {
        const text = await transcribe(blob);
        if (text) onText(text);
        else setError('Nothing was heard — try again a little closer.');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setState('idle');
      }
    };

    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState('recording');
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
  };

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        className={state === 'recording' ? 'btn btn-secondary log-voice recording' : 'btn btn-secondary log-voice'}
        style={attached ? { minHeight: 40, minWidth: 40, padding: '0 10px', borderRight: 0 } : { minHeight: 44, minWidth: 44 }}
        disabled={disabled || state === 'transcribing'}
        aria-pressed={state === 'recording'}
        aria-label={state === 'recording' ? 'Stop recording' : 'Log by voice'}
        title={state === 'recording' ? 'Stop and transcribe' : 'Log by voice'}
        onClick={() => (state === 'recording' ? stop() : void start())}
      >
        <Icon name={state === 'recording' ? 'stop' : 'mic'} />
        {state === 'recording' ? `0:${String(seconds).padStart(2, '0')}` : state === 'transcribing' ? 'Listening…' : null}
      </button>
      {error ? (
        <div className="error" role="status" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 8, zIndex: 2 }}>
          {error}
        </div>
      ) : null}
    </>
  );
}
