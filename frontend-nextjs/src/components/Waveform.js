// Animated sound bars (decorative), same as the React app.
export default function Waveform({ active = true, bars = 9, className = '' }) {
  return (
    <span className={`waveform ${active ? 'on' : ''} ${className}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} style={{ '--i': i, '--h': `${30 + ((i * 37) % 60)}%` }} />)}
    </span>
  );
}
