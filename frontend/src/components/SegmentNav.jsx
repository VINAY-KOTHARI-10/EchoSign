import { NavLink } from 'react-router-dom';

// History and Leaderboard share one header, like two tabs of the same area.
export default function SegmentNav() {
  return (
    <nav className="segment" aria-label="History and leaderboard">
      <NavLink to="/history">History</NavLink>
      <NavLink to="/leaderboard">Leaderboard</NavLink>
    </nav>
  );
}
