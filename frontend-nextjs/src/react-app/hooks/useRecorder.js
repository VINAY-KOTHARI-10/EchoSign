import { useCallback, useEffect, useRef, useState } from 'react';

// Records microphone audio locally with MediaRecorder. Nothing is uploaded: the recording is offered as
// a download, together with captions whose timestamps start at the moment recording began (`startedAt`).
export default function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null); // { url, startedAt, mime }
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const chunks = useRef([]);
  const streamRef = useRef(null);
  const startedRef = useRef(0);

  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window;

  const start = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const mime = rec.mimeType || 'audio/webm';
        setResult((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(new Blob(chunks.current, { type: mime })), startedAt: startedRef.current, mime }; });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      recRef.current = rec;
      startedRef.current = Date.now();
      rec.start(1000);
      setRecording(true);
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Microphone access was blocked.' : err.message);
    }
  }, []);

  const stop = useCallback(() => { if (recRef.current?.state === 'recording') recRef.current.stop(); }, []);

  useEffect(() => () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { supported, recording, result, error, start, stop };
}
