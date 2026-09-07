import { NavLink } from 'react-router-dom';

// NavLink marks the active route with aria-current="page", which is exactly what
// the stylesheet keys the accent off.
const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/log', label: 'Log' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/settings', label: 'Settings' },
];

export function Nav() {
  return (
    <nav className="wnav">
      <NavLink to="/" className="wnav-brand">
        Track&#8209;a&#8209;Lack
      </NavLink>
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.to === '/'}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
