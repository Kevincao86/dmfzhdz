import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/* —— 状态 Tab 条（我的发单 / 我的报名） —— */
export type StatusTab = { id: string; label: string; count?: number }

export function StatusTabBar({
  tabs,
  active,
  onChange,
  sub = false,
}: {
  tabs: StatusTab[]
  active: string
  onChange: (id: string) => void
  /** 拍剪任务等二级 Tab */
  sub?: boolean
}) {
  return (
    <div className={`status-tab-bar${sub ? ' status-tab-bar--sub' : ''}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`status-tab ${active === t.id ? 'status-tab--active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && t.count > 0 ? (
            <span className="status-tab__count">({t.count})</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

/* —— 筛选工具栏 —— */
export function FilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  children,
  actions,
}: {
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="filter-toolbar surface-card">
      <div className="filter-toolbar__row">
        {onSearchChange != null ? (
          <div className="filter-toolbar__search">
            <span className="filter-toolbar__search-icon" aria-hidden>
              ⌕
            </span>
            <input
              className="filter-toolbar__input"
              placeholder={searchPlaceholder || '搜索…'}
              value={search || ''}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : null}
        {actions ? <div className="filter-toolbar__actions">{actions}</div> : null}
      </div>
      {children ? <div className="filter-toolbar__filters">{children}</div> : null}
    </div>
  )
}

/* —— 双栏布局（发布招募：表单 + 小贴士） —— */
export function TwoColumnLayout({
  main,
  aside,
  className = '',
}: {
  main: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={`mockup-two-col ${className}`.trim()}>
      <div className="mockup-two-col__main">{main}</div>
      {aside ? <aside className="mockup-two-col__aside">{aside}</aside> : null}
    </div>
  )
}

export function TipsCard({ title, items }: { title: string; items: { title: string; desc: string }[] }) {
  return (
    <div className="mockup-tips-card">
      <h3 className="mockup-tips-card__title">💡 {title}</h3>
      <ul className="mockup-tips-card__list">
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* —— 底部操作栏 —— */
export function StickyActionBar({
  left,
  right,
}: {
  left?: ReactNode
  right: ReactNode
}) {
  return (
    <div className="mockup-sticky-actions">
      <div className="mockup-sticky-actions__inner">
        <div className="mockup-sticky-actions__left">{left}</div>
        <div className="mockup-sticky-actions__right">{right}</div>
      </div>
    </div>
  )
}

export function BtnPrimary({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className="btn-mockup btn-mockup--primary" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function BtnSecondary({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="btn-mockup btn-mockup--secondary" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function BtnOutline({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={`btn-mockup btn-mockup--outline${danger ? ' btn-mockup--danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/* —— 横向列表卡（我的发单） —— */
export function HorizontalListCard({
  cover,
  title,
  badges,
  meta,
  stats,
  tags,
  actions,
  className = '',
}: {
  cover?: string | null
  title: string
  badges?: ReactNode
  meta?: ReactNode
  stats?: ReactNode
  tags?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <article className={`list-card-horizontal surface-card hover-panel ${className}`.trim()}>
      <div className="list-card-horizontal__cover">
        {cover ? (
          <img src={cover} alt="" className="list-card-horizontal__img" />
        ) : (
          <div className="list-card-horizontal__placeholder">📋</div>
        )}
      </div>
      <div className="list-card-horizontal__body">
        <div className="list-card-horizontal__head">
          <div className="list-card-horizontal__title-row">
            <h3 className="list-card-horizontal__title">{title}</h3>
            {badges}
          </div>
          {meta ? <div className="list-card-horizontal__meta">{meta}</div> : null}
          {tags ? <div className="list-card-horizontal__tags">{tags}</div> : null}
        </div>
        {stats ? <div className="list-card-horizontal__stats">{stats}</div> : null}
        {actions ? <div className="list-card-horizontal__actions">{actions}</div> : null}
      </div>
    </article>
  )
}

/* —— 我的页：头像卡 + 统计 + 菜单 —— */
export function ProfileMineHeader({
  avatar,
  name,
  roleBadge,
  stats,
  upgradeHref = '/profile/membership',
}: {
  avatar?: string
  name: string
  roleBadge: string
  stats: { label: string; value: string | number }[]
  upgradeHref?: string
}) {
  return (
    <div className="profile-mine-header surface-card hover-panel">
      <div className="profile-mine-header__top">
        {avatar ? (
          <img src={avatar} alt="" className="profile-mine-header__avatar" />
        ) : (
          <div className="profile-mine-header__avatar profile-mine-header__avatar--placeholder">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="profile-mine-header__identity">
          <div className="profile-mine-header__name-row">
            <h2 className="profile-mine-header__name">{name}</h2>
            <Link to={upgradeHref} className="profile-mine-header__upgrade">
              升级会员
            </Link>
          </div>
          <span className="profile-mine-header__badge">{roleBadge}</span>
        </div>
      </div>
      <div className="profile-mine-header__stats">
        {stats.map((s) => (
          <div key={s.label} className="profile-mine-header__stat">
            <span className="profile-mine-header__stat-value">{s.value}</span>
            <span className="profile-mine-header__stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProfileMenuList({ items }: { items: { to: string; label: string; desc?: string }[] }) {
  return (
    <nav className="profile-menu-list surface-card">
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="profile-menu-list__item">
          <span className="profile-menu-list__label">{item.label}</span>
          {item.desc ? <span className="profile-menu-list__desc">{item.desc}</span> : null}
          <span className="profile-menu-list__arrow" aria-hidden>
            ›
          </span>
        </Link>
      ))}
    </nav>
  )
}

/* —— 空状态 —— */
export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state surface-card">
      <p className="empty-state__title">{title}</p>
      {desc ? <p className="empty-state__desc">{desc}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  )
}

/* —— 表单区块标题 —— */
export function FormSection({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <header className="form-section__head">
        <h3 className="form-section__title">{title}</h3>
        {desc ? <p className="form-section__desc">{desc}</p> : null}
      </header>
      <div className="form-section__body">{children}</div>
    </section>
  )
}

export function FormFieldLabel({ children, required, hint }: { children: ReactNode; required?: boolean; hint?: string }) {
  return (
    <label className="form-field-label">
      <span>
        {children}
        {required ? <span className="form-field-label__req">*</span> : null}
      </span>
      {hint ? <span className="form-field-label__hint">{hint}</span> : null}
    </label>
  )
}

/* —— 模版网格卡 —— */
export function TemplateGridCard({
  title,
  meta,
  cover,
  onUse,
  onEdit,
  onDelete,
}: {
  title: string
  meta?: string
  cover?: string
  onUse: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="template-grid-card surface-card hover-panel">
      <div className="template-grid-card__cover">
        {cover ? <img src={cover} alt="" /> : <div className="template-grid-card__placeholder">📄</div>}
      </div>
      <div className="template-grid-card__body">
        <h3 className="template-grid-card__title">{title}</h3>
        {meta ? <p className="template-grid-card__meta">{meta}</p> : null}
        <div className="template-grid-card__actions">
          <button type="button" className="btn-mockup btn-mockup--primary btn-mockup--sm" onClick={onUse}>
            使用模版
          </button>
          <button type="button" className="btn-mockup btn-mockup--outline btn-mockup--sm" onClick={onEdit}>
            编辑
          </button>
          <button type="button" className="btn-mockup btn-mockup--outline btn-mockup--sm btn-mockup--danger" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
    </article>
  )
}

/* —— 增值服务卡 —— */
export function AddonServiceCard({
  title,
  desc,
  price,
  onAction,
}: {
  title: string
  desc: string
  price?: string
  onAction?: () => void
}) {
  return (
    <article className="addon-service-card surface-card hover-panel">
      <h3 className="addon-service-card__title">{title}</h3>
      <p className="addon-service-card__desc">{desc}</p>
      {price ? <p className="addon-service-card__price">{price}</p> : null}
      <button type="button" className="btn-mockup btn-mockup--primary btn-mockup--sm" onClick={onAction}>
        立即购买
      </button>
    </article>
  )
}
