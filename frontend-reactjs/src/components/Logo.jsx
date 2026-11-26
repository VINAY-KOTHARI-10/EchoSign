import { useId } from 'react';
import { Link } from 'react-router-dom';

export function LogoMark({ size = 36 }) {
  const gid = `lw-grad-${useId().replace(/:/g, '')}`; // unique per instance: a hidden duplicate would break the gradient
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4b2cd6" /><stop offset="1" stopColor="#7a5cff" /></linearGradient></defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
      <path d="M10 34c6-14 10-14 16 0s10 14 16 0 8-10 12-4" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ to = '/', subtitle }) {
  return (
    <Link to={to} className="logo">
      <LogoMark />
      <span className="logo-wrap">
        <span>Echo<b>Sign</b></span>
        {subtitle && <small className="brand-sub">{subtitle}</small>}
      </span>
    </Link>
  );
}
