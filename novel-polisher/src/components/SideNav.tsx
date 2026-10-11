import type { ReactNode } from 'react'
import type { Page } from '../types'
import { useApp } from '../store/useApp'

interface NavEntry {
  key: Page
  label: string
  icon: ReactNode
}

const ENTRIES: NavEntry[] = [
  {
    key: 'import',
    label: '导入',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3.5v10" />
        <path d="m8.5 10 3.5 3.5L15.5 10" />
        <path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
      </svg>
    ),
  },
  {
    key: 'compare',
    label: '对照',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="3.5" y="4" width="7" height="16" rx="1.8" />
        <rect x="13.5" y="4" width="7" height="16" rx="1.8" />
        <path d="M12 4v16" />
      </svg>
    ),
  },
  {
    key: 'review',
    label: '审核',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="8.6" />
        <path d="m8.3 12.4 2.5 2.5 5-5.6" />
      </svg>
    ),
  },
  {
    key: 'export',
    label: '导出',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 13.5v-10" />
        <path d="m8.5 7 3.5-3.5L15.5 7" />
        <path d="M4.5 15.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
      </svg>
    ),
  },
]

const SETTINGS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9" />
  </svg>
)

export function SideNav() {
  const { page, setPage, sources } = useApp()

  return (
    <aside className="sidenav">
      <div className="brand">
        <span className="brand-seal" aria-hidden>
          修
        </span>
        <span className="brand-text">
          <span className="brand-name">小说精修</span>
          <span className="brand-sub">NOVEL POLISHER</span>
        </span>
      </div>

      <nav className="nav" aria-label="主导航">
        {ENTRIES.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            className={`nav-item${page === key ? ' active' : ''}`}
            onClick={() => setPage(key)}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
            {key === 'compare' && sources.length > 0 && (
              <span className="nav-badge">{sources.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidenav-foot">
        <button
          type="button"
          className={`nav-item${page === 'settings' ? ' active' : ''}`}
          onClick={() => setPage('settings')}
        >
          <span className="nav-icon">{SETTINGS_ICON}</span>
          <span className="nav-label">设置</span>
        </button>
        <p className="sidenav-note">多源对照 · 朱笔校雠</p>
      </div>
    </aside>
  )
}
