import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { uploadOpsContentImage } from '../opsContentImageApi'
import {
  loadMarketingCampaign,
  markMarketingWithdrawPaid,
  saveMarketingBoard,
  saveMarketingCampaign,
  type MarketingBoardForm,
  type MarketingCampaignForm,
  type MarketingGrantRow,
  type MarketingSurface,
  type MarketingWithdrawRow,
} from '../opsMarketingCampaignApi'

function emptyForm(): MarketingCampaignForm {
  return {
    title: '',
    subtitle: '',
    enabled: false,
    amountYuan: '5.00',
    totalQuota: 0,
    grantedCount: 0,
    remaining: 0,
    posterUrl: '',
    rulesText: '',
    withdrawAfterOrders: 5,
    updatedAt: '',
  }
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="mkt-field-wrap">
      <span className="mkt-label">{props.label}</span>
      {props.children}
    </label>
  )
}

export default function OpsMarketingCenterPage() {
  const [params] = useSearchParams()
  const surface: MarketingSurface = params.get('surface') === 'merchant' ? 'merchant_erp' : 'xingxuan'
  const xingxuan = surface === 'xingxuan'
  const [form, setForm] = useState<MarketingCampaignForm>(emptyForm)
  const [boards, setBoards] = useState<MarketingBoardForm[]>([])
  const [grants, setGrants] = useState<MarketingGrantRow[]>([])
  const [withdraws, setWithdraws] = useState<MarketingWithdrawRow[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingBoard, setSavingBoard] = useState('')
  const [uploading, setUploading] = useState('')
  const [category, setCategory] = useState<'cash' | 'version' | 'open'>('cash')

  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr('')
    setMsg('')
    void loadMarketingCampaign(surface).then((result) => {
      if (stop) return
      setLoading(false)
      if (!result.ok) {
        setErr(result.error)
        return
      }
      setForm(result.data.campaign)
      setBoards(result.data.boards)
      setGrants(result.data.grants)
      setWithdraws(result.data.withdraws)
    })
    return () => {
      stop = true
    }
  }, [surface])

  function patch(partial: Partial<MarketingCampaignForm>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  function patchBoard(id: string, partial: Partial<MarketingBoardForm>) {
    setBoards((prev) => prev.map((item) => (item.id === id ? { ...item, ...partial } : item)))
  }

  async function onUpload(file: File | undefined, apply: (url: string) => void, key: string) {
    if (!file) return
    setUploading(key)
    setErr('')
    const uploaded = await uploadOpsContentImage(file)
    setUploading('')
    if (!uploaded.ok) {
      setErr(uploaded.error || '海报上传失败')
      return
    }
    apply(uploaded.imageUrl)
  }

  async function onSave() {
    setSaving(true)
    setErr('')
    setMsg('')
    const result = await saveMarketingCampaign(surface, form)
    setSaving(false)
    if (!result.ok) {
      setErr(result.error)
      return
    }
    setForm(result.data.campaign)
    setBoards(result.data.boards)
    setGrants(result.data.grants)
    setWithdraws(result.data.withdraws)
    setMsg(form.enabled ? '现金红包已保存并上线' : '现金红包已保存，当前未上线')
  }

  async function onSaveBoard(board: MarketingBoardForm) {
    setSavingBoard(board.id)
    setErr('')
    setMsg('')
    const result = await saveMarketingBoard(surface, board)
    setSavingBoard('')
    if (!result.ok) {
      setErr(result.error)
      return
    }
    setForm(result.data.campaign)
    setBoards(result.data.boards)
    setGrants(result.data.grants)
    setWithdraws(result.data.withdraws)
    setMsg(board.enabled ? `「${board.title}」已保存并上线` : `「${board.title}」已保存，当前未上线`)
  }

  async function onPaid(id: string) {
    setErr('')
    const result = await markMarketingWithdrawPaid(surface, id)
    if (!result.ok) {
      setErr(result.error)
      return
    }
    setWithdraws(result.data.withdraws)
    setMsg('已标记打款')
  }

  return (
    <div className="mkt-page">
      <style>{`
        .mkt-page { max-width: 64rem; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; color: var(--ops-text); }
        .mkt-kicker { margin: 0.35rem 0 0; font-size: 0.875rem; line-height: 1.6; color: var(--ops-muted); }
        .mkt-split { display: grid; grid-template-columns: 12.5rem minmax(0, 1fr); gap: 1rem; align-items: start; }
        @media (max-width: 800px) { .mkt-split { grid-template-columns: 1fr; } }
        .mkt-cats { display: flex; flex-direction: column; gap: 0.45rem; position: sticky; top: 0.75rem; }
        .mkt-cat { text-align: left; border: 1.5px solid color-mix(in srgb, var(--ops-text) 35%, var(--ops-border)); background: var(--ops-panel); color: var(--ops-text); border-radius: 0.8rem; padding: 0.75rem 0.85rem; font-size: 1rem; font-weight: 700; cursor: pointer; }
        .mkt-cat small { display: block; margin-top: 0.15rem; font-size: 0.75rem; font-weight: 600; opacity: 0.75; }
        .mkt-cat.on { background: #5b21b6; color: #fff; border-color: #5b21b6; }
        .mkt-stack { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
        .mkt-card { background: var(--ops-panel); border: 2px solid color-mix(in srgb, var(--ops-text) 32%, var(--ops-border)); border-radius: 1rem; box-shadow: var(--ops-card-shadow); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .mkt-card h2 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--ops-text); }
        .mkt-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
        .mkt-sub { margin: 0.25rem 0 0; font-size: 0.8125rem; line-height: 1.5; color: var(--ops-muted); }
        .mkt-pill { flex: none; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.75rem; font-weight: 700; }
        .mkt-pill.on { background: #047857; color: #fff; }
        .mkt-pill.off { background: transparent; color: var(--ops-text); border: 1.5px solid color-mix(in srgb, var(--ops-text) 45%, var(--ops-border)); }
        .mkt-grid { display: grid; gap: 0.9rem; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .mkt-grid { grid-template-columns: 1fr 1fr; } }
        .mkt-field-wrap { display: block; }
        .mkt-label { display: block; margin-bottom: 0.35rem; font-size: 0.8125rem; font-weight: 700; color: var(--ops-text); }
        .mkt-field, .mkt-page textarea.mkt-field {
          width: 100%; box-sizing: border-box; border-radius: 0.6rem;
          border: 1.5px solid color-mix(in srgb, var(--ops-text) 42%, var(--ops-border));
          background: var(--ops-input-bg); color: var(--ops-input-text);
          padding: 0.55rem 0.75rem; font-size: 0.875rem;
        }
        .mkt-field::placeholder { color: var(--ops-muted); opacity: 1; }
        .mkt-field:focus { outline: 2px solid var(--ops-accent); outline-offset: 1px; }
        html[data-theme='dark'] .mkt-field { color-scheme: dark; }
        html[data-theme='light'] .mkt-field { color-scheme: light; }
        .mkt-check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 700; color: var(--ops-text); }
        .mkt-check input { width: 1rem; height: 1rem; accent-color: var(--ops-accent); }
        .mkt-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
        .mkt-btn { border: 0; border-radius: 0.6rem; background: #5b21b6; color: #fff; padding: 0.55rem 0.95rem; font-size: 0.875rem; font-weight: 700; cursor: pointer; }
        .mkt-btn:disabled { opacity: 0.6; cursor: default; }
        .mkt-file { border: 1.5px solid color-mix(in srgb, var(--ops-text) 42%, var(--ops-border)); border-radius: 0.6rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; font-weight: 650; color: var(--ops-text); background: var(--ops-panel); cursor: pointer; }
        .mkt-meta { font-size: 0.875rem; line-height: 1.6; color: var(--ops-text); }
        .mkt-table-wrap { overflow-x: auto; border: 2px solid color-mix(in srgb, var(--ops-text) 32%, var(--ops-border)); border-radius: 1rem; background: var(--ops-panel); }
        .mkt-table-wrap h2 { margin: 0; padding: 0.85rem 1.1rem; border-bottom: 1.5px solid color-mix(in srgb, var(--ops-text) 24%, var(--ops-border)); font-size: 0.95rem; }
        .mkt-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; color: var(--ops-text); }
        .mkt-table th { padding: 0.75rem; color: var(--ops-muted); font-weight: 700; }
        .mkt-table td { padding: 0.75rem; border-top: 1px solid color-mix(in srgb, var(--ops-text) 18%, var(--ops-border)); }
        .mkt-link { background: none; border: 0; padding: 0; color: var(--ops-accent); font-weight: 700; cursor: pointer; }
        .mkt-empty { margin: 0; padding: 1.25rem; text-align: center; color: var(--ops-muted); font-size: 0.875rem; }
        .mkt-msg { margin: 0; font-size: 0.875rem; font-weight: 700; color: #047857; }
        .mkt-err { margin: 0; font-size: 0.875rem; font-weight: 700; color: var(--ops-danger); }
      `}</style>

      <div>
        <h1 className="ops-page-title text-xl font-semibold">{xingxuan ? '星选平台活动' : '商家ERP活动'}</h1>
        <p className="mkt-kicker">
          {xingxuan
            ? '现金红包仍按 PR 发单自动入账。版本折扣、PR 版本、达人版、会员加赠和限时开通在下面单独填写，打开「上线」后保存即发布。'
            : '商家 ERP 的活动单独保存。现金红包是其中一块，其余活动可手动设置并上线，不影响星选那边的配置。'}
        </p>
      </div>

      {err ? <p className="mkt-err">{err}</p> : null}
      {msg ? <p className="mkt-msg">{msg}</p> : null}
      {loading ? <p className="ops-muted text-sm">加载中…</p> : null}

      {!loading ? (
        <div className="mkt-split">
          <aside className="mkt-cats">
            <button type="button" className={category === 'cash' ? 'mkt-cat on' : 'mkt-cat'} onClick={() => setCategory('cash')}>
              红包活动
              <small>现金红包</small>
            </button>
            <button type="button" className={category === 'version' ? 'mkt-cat on' : 'mkt-cat'} onClick={() => setCategory('version')}>
              版本活动
              <small>折扣 / PR / 达人</small>
            </button>
            <button type="button" className={category === 'open' ? 'mkt-cat on' : 'mkt-cat'} onClick={() => setCategory('open')}>
              开通优惠
              <small>加赠 / 限时开通</small>
            </button>
          </aside>
          <div className="mkt-stack">
      {!loading && category === 'cash' ? (
        <section id="mkt-cash" className="mkt-card">
          <div className="mkt-head">
            <div>
              <h2>现金红包</h2>
              <p className="mkt-sub">
                {xingxuan
                  ? 'PR 完成闭环或开环招募发单后，按单价自动进入钱包。大于设定单数才可提现。'
                  : '商家侧单独的现金红包模版。自动入账目前接在星选 PR 发单。'}
              </p>
            </div>
            <span className={form.enabled ? 'mkt-pill on' : 'mkt-pill off'}>{form.enabled ? '已上线' : '未上线'}</span>
          </div>
          <label className="mkt-check">
            <input type="checkbox" checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            上线此活动
          </label>
          <div className="mkt-grid">
            <Field label="活动名称">
              <input className="mkt-field" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <Field label="副标题">
              <input className="mkt-field" value={form.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
            </Field>
            <Field label="单笔红包（元）">
              <input className="mkt-field" inputMode="decimal" value={form.amountYuan} onChange={(e) => patch({ amountYuan: e.target.value })} />
            </Field>
            <Field label="红包数量">
              <input
                className="mkt-field"
                inputMode="numeric"
                value={String(form.totalQuota)}
                onChange={(e) => patch({ totalQuota: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </Field>
            <Field label="大于几单可提现">
              <input
                className="mkt-field"
                inputMode="numeric"
                value={String(form.withdrawAfterOrders)}
                onChange={(e) => patch({ withdrawAfterOrders: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </Field>
            <div className="mkt-meta">
              <p>已发放 {form.grantedCount} 个</p>
              <p>剩余 {form.remaining} 个</p>
              {form.updatedAt ? <p>最近保存 {form.updatedAt}</p> : null}
            </div>
          </div>
          <Field label="关联海报">
            <input className="mkt-field" placeholder="https://" value={form.posterUrl} onChange={(e) => patch({ posterUrl: e.target.value })} />
          </Field>
          <div className="mkt-actions">
            <label className="mkt-file">
              {uploading === 'cash' ? '上传中…' : '上传海报'}
              <input className="hidden" type="file" accept="image/*" disabled={uploading === 'cash'} onChange={(e) => void onUpload(e.target.files?.[0], (url) => patch({ posterUrl: url }), 'cash')} />
            </label>
            {form.posterUrl ? <img src={form.posterUrl} alt="" className="h-24 rounded-lg object-cover" style={{ border: '1.5px solid var(--ops-border)' }} /> : null}
          </div>
          <Field label="规则说明">
            <textarea className="mkt-field" style={{ minHeight: '7rem' }} value={form.rulesText} onChange={(e) => patch({ rulesText: e.target.value })} />
          </Field>
          <button type="button" className="mkt-btn" disabled={saving} onClick={() => void onSave()}>
            {saving ? '保存中…' : form.enabled ? '保存并上线' : '保存（暂不上线）'}
          </button>
        </section>
      ) : null}

      {!loading
        ? boards
            .filter((board) =>
              (category === 'version'
                ? ['version_discount', 'pr_plan', 'talent_plan']
                : category === 'open'
                  ? ['member_bonus', 'flash_open']
                  : []
              ).includes(board.kind),
            )
            .map((board) => (
            <section key={board.id} id={`mkt-${board.kind}`} className="mkt-card">
              <div className="mkt-head">
                <div>
                  <h2>{board.title || '活动'}</h2>
                  <p className="mkt-sub">{board.subtitle}</p>
                </div>
                <span className={board.enabled ? 'mkt-pill on' : 'mkt-pill off'}>{board.enabled ? '已上线' : '未上线'}</span>
              </div>
              <label className="mkt-check">
                <input type="checkbox" checked={board.enabled} onChange={(e) => patchBoard(board.id, { enabled: e.target.checked })} />
                上线此活动
              </label>
              <div className="mkt-grid">
                <Field label="活动名称">
                  <input className="mkt-field" value={board.title} onChange={(e) => patchBoard(board.id, { title: e.target.value })} />
                </Field>
                <Field label="副标题">
                  <input className="mkt-field" value={board.subtitle} onChange={(e) => patchBoard(board.id, { subtitle: e.target.value })} />
                </Field>
                <Field label="优惠内容">
                  <input className="mkt-field" placeholder="例如 8折 / 立减 200 / 送 30 天" value={board.offerText} onChange={(e) => patchBoard(board.id, { offerText: e.target.value })} />
                </Field>
                <Field label="适用对象">
                  <input className="mkt-field" value={board.audience} onChange={(e) => patchBoard(board.id, { audience: e.target.value })} />
                </Field>
                <Field label="名额（0 表示不限）">
                  <input
                    className="mkt-field"
                    inputMode="numeric"
                    value={String(board.quota)}
                    onChange={(e) => patchBoard(board.id, { quota: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                </Field>
                <Field label="最近保存">
                  <input className="mkt-field" readOnly value={board.updatedAt || '还没有保存'} />
                </Field>
                <Field label="开始日期">
                  <input className="mkt-field" type="date" value={board.startAt} onChange={(e) => patchBoard(board.id, { startAt: e.target.value })} />
                </Field>
                <Field label="结束日期">
                  <input className="mkt-field" type="date" value={board.endAt} onChange={(e) => patchBoard(board.id, { endAt: e.target.value })} />
                </Field>
              </div>
              <Field label="关联海报">
                <input className="mkt-field" placeholder="https://" value={board.posterUrl} onChange={(e) => patchBoard(board.id, { posterUrl: e.target.value })} />
              </Field>
              <div className="mkt-actions">
                <label className="mkt-file">
                  {uploading === board.id ? '上传中…' : '上传海报'}
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    disabled={uploading === board.id}
                    onChange={(e) => void onUpload(e.target.files?.[0], (url) => patchBoard(board.id, { posterUrl: url }), board.id)}
                  />
                </label>
                {board.posterUrl ? <img src={board.posterUrl} alt="" className="h-24 rounded-lg object-cover" style={{ border: '1.5px solid var(--ops-border)' }} /> : null}
              </div>
              <Field label="规则说明">
                <textarea className="mkt-field" style={{ minHeight: '6.5rem' }} value={board.rulesText} onChange={(e) => patchBoard(board.id, { rulesText: e.target.value })} />
              </Field>
              <button type="button" className="mkt-btn" disabled={savingBoard === board.id} onClick={() => void onSaveBoard(board)}>
                {savingBoard === board.id ? '保存中…' : board.enabled ? '保存并上线' : '保存（暂不上线）'}
              </button>
            </section>
          ))
        : null}

      {xingxuan && !loading && category === 'cash' ? (
        <>
          <section className="mkt-table-wrap">
            <h2>发放记录</h2>
            <table className="mkt-table">
              <thead>
                <tr>
                  <th>PR</th>
                  <th>招募单</th>
                  <th>金额</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((row) => (
                  <tr key={row.id}>
                    <td>{row.displayName || row.prKey}</td>
                    <td>{row.orderId}</td>
                    <td>¥{row.amountYuan}</td>
                    <td>{row.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!grants.length ? <p className="mkt-empty">还没有发放</p> : null}
          </section>
          <section className="mkt-table-wrap">
            <h2>提现申请</h2>
            <table className="mkt-table">
              <thead>
                <tr>
                  <th>PR</th>
                  <th>金额</th>
                  <th>达标单数</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {withdraws.map((row) => (
                  <tr key={row.id}>
                    <td>{row.displayName || row.prKey}</td>
                    <td>¥{row.amountYuan}</td>
                    <td>{row.qualifyingOrders}</td>
                    <td>{row.status === 'paid' ? '已打款' : '待打款'}</td>
                    <td>
                      {row.status === 'pending' ? (
                        <button type="button" className="mkt-link" onClick={() => void onPaid(row.id)}>
                          标记已打款
                        </button>
                      ) : (
                        row.paidAt || ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!withdraws.length ? <p className="mkt-empty">还没有提现</p> : null}
          </section>
        </>
      ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
