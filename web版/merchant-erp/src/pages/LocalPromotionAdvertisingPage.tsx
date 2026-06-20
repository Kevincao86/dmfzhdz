import { useState } from 'react'
import { cn } from '../cn'
import ModulePage from './ModulePage'
import OceanEngineAdvertisingInner from './advertising/OceanEngineAdvertisingInner'
import XhsAdvertisingFourPanePanel from './advertising/XhsAdvertisingFourPanePanel'

type AdChannel = 'local_promotion' | 'qianchuan' | 'xhs_juguang'

export default function LocalPromotionAdvertisingPage() {
  const [channel, setChannel] = useState<AdChannel>('local_promotion')

  return (
    <ModulePage
      title="投流"
      subtitle="巨量工作台（本地推 / 千川）与小红书聚光：直播间、短视频、线索分析与 AI 诊断"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChannel('local_promotion')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'local_promotion' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          本地推 <span className="text-[10px] opacity-80">(抖音)</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('qianchuan')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'qianchuan' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          巨量千川 <span className="text-[10px] opacity-80">(电商/直播)</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('xhs_juguang')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium',
            channel === 'xhs_juguang' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          聚光 <span className="text-[10px] opacity-80">(小红书)</span>
        </button>
      </div>

      {channel === 'xhs_juguang' ? (
        <XhsAdvertisingFourPanePanel />
      ) : (
        <OceanEngineAdvertisingInner platform={channel} />
      )}
    </ModulePage>
  )
}
