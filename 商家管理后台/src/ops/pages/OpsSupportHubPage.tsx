import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import OpsPageHeader from '../OpsPageHeader'
import OpsSegmentTabs from '../OpsSegmentTabs'
import OpsSupportWorkbenchPage, { type OpsSupportChannel } from './OpsSupportWorkbenchPage'

const CHANNEL_TABS = [
  { id: 'erp' as const, label: '商家 ERP' },
  { id: 'mp' as const, label: '星选小程序' },
]

function parseChannel(raw: string | null): OpsSupportChannel {
  return raw === 'mp' ? 'mp' : 'erp'
}

export default function OpsSupportHubPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const channel = useMemo(() => parseChannel(searchParams.get('channel')), [searchParams])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <OpsPageHeader
        title="在线客服"
        description={
          channel === 'mp'
            ? '承接达人招募小程序「小灵同学」等入口的会话；会话 ID 以 lq-mp- 或 mp- 开头。'
            : '承接商家 ERP 右下角在线客服的商户会话；支持 WebSocket 开发调试与云端 HTTP 轮询同步。'
        }
        badge={channel === 'mp' ? '星选小程序' : '商家 ERP'}
      />

      <OpsSegmentTabs
        tabs={CHANNEL_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeId={channel}
        onChange={(id) => setSearchParams({ channel: id })}
      />

      <OpsSupportWorkbenchPage channel={channel} embedded />
    </div>
  )
}
