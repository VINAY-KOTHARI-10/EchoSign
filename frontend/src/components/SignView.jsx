import { Camera, CameraOff } from 'lucide-react';
import { StatusBadge } from './ui';
import { signStatus } from './classroom/SignPanel';

// Camera preview with every state spelled out: off, starting, running (with the held gesture), error.
// Used by the Sign Lab so permission problems are explained rather than showing a blank box.
export default function SignView({ sign }) {
  const running = sign.status === 'running' || sign.status === 'loading';
  const st = signStatus(sign, false);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="field-label">Camera</span>
        <span aria-live="polite"><StatusBadge status={st.status}>{st.text}</StatusBadge></span>
      </div>
      <div className="sign-stage">
        <div className="sign-video" hidden={sign.status === 'idle' || sign.status === 'error'}>
          <video ref={sign.videoRef} playsInline muted aria-label="Your camera preview (mirrored)" />
          <canvas ref={sign.canvasRef} aria-hidden="true" />
          {sign.status === 'loading' && <div className="sign-overlay">Loading hand tracking…</div>}
          {sign.current && (
            <div className="sign-overlay sign-current" aria-hidden="true">
              {sign.current.letter
                ? <span className="sign-big">{sign.current.letter}</span>
                : <><span style={{ fontSize: 28 }}>{sign.current.emoji}</span> {sign.current.phrase}</>}
              <div className="bar"><i style={{ width: `${sign.progress * 100}%` }} /></div>
            </div>
          )}
        </div>
        {sign.status === 'idle' && (
          <div className="sign-placeholder"><CameraOff size={28} aria-hidden="true" /><b>Camera is off</b>
            <span>Your video stays on this device and is never uploaded.</span></div>
        )}
        {sign.status === 'error' && (
          <div className="sign-placeholder error" role="alert"><CameraOff size={28} aria-hidden="true" /><b>{sign.error || 'Could not start the camera'}</b>
            <span>Allow camera access using the icon in your browser’s address bar, then try again.</span></div>
        )}
      </div>
      <button className={`btn btn-block ${running ? 'btn-outline' : 'btn-primary'}`} style={{ marginTop: 12 }} onClick={running ? sign.stop : sign.start}>
        {running ? <><CameraOff size={18} aria-hidden="true" /> Stop camera</> : <><Camera size={18} aria-hidden="true" /> {sign.status === 'error' ? 'Try again' : 'Start camera'}</>}
      </button>
    </div>
  );
}
