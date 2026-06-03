import type { ReactNode } from 'react'
import { MembershipProvider } from '@merchant/context/MembershipContext'
import { PartnerClientProvider } from '@merchant/context/PartnerClientContext'

/** 嵌入商家 ERP 页面所需的 Context（与商家版 App 一致，无 MeooLayout） */
export default function MerchantEmbedProviders({ children }: { children: ReactNode }) {
  return (
    <MembershipProvider>
      <PartnerClientProvider>{children}</PartnerClientProvider>
    </MembershipProvider>
  )
}
