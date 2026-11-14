import { NavLink } from 'react-router'
import type { ReactNode } from 'react'

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const tabs: { to: string; label: string; icon: ReactNode; end?: boolean; log?: boolean }[] = [
  { to: '/', label: 'Home', end: true, icon: icon(<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />) },
  { to: '/dogdex', label: 'Dogdex', icon: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  { to: '/log', label: 'Log a dog', log: true, icon: icon(<path d="M12 5v14M5 12h14" strokeWidth="3" />) },
  { to: '/badges', label: 'Badges', icon: icon(<><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 22l5-3 5 3-1.5-8" /></>) },
  { to: '/you', label: 'You', icon: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>) },
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={t.log ? 'tab tab--log' : 'tab'} aria-label={t.log ? t.label : undefined}>
          {t.icon}
          {t.log ? null : <span>{t.label}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
