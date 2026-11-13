import { useParams } from 'react-router-dom'
import OrderGroupChatPanel from '../components/chat/OrderGroupChatPanel'

export default function OrderGroupChatPage() {
  const { id: mpOrderId = '' } = useParams()
  return (
    <div className="page-content-shell page-content-shell--wide messages-page">
      <div className="messages-hub messages-hub--single">
        <main className="messages-hub__main">
          <OrderGroupChatPanel
            mpOrderId={mpOrderId}
            orderDetailHref={mpOrderId ? `/recruitment/${encodeURIComponent(mpOrderId)}` : undefined}
          />
        </main>
      </div>
    </div>
  )
}
