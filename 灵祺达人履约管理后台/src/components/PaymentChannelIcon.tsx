import type { MpMembershipPayChannel } from '../lib/mpMembershipApi'

type Props = { channel: MpMembershipPayChannel; className?: string }

export function PaymentChannelIcon({ channel, className }: Props) {
  const cls = className || 'xx-membership-pay-channel-icon'
  if (channel === 'wechat') {
    return (
      <svg className={cls} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#07C160" />
        <path
          fill="#fff"
          d="M26.2 24.5c-6.8 0-12.3 4.4-12.3 9.8 0 3.2 1.9 6 4.8 7.8l-1.2 4.4 5.1-2.7c1.4.4 2.9.6 4.4.6 6.8 0 12.3-4.4 12.3-9.8s-5.5-9.9-12.3-9.9zm-3.8 8.8c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6 1.6.7 1.6 1.6-.7 1.6-1.6 1.6zm7.6 0c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6 1.6.7 1.6 1.6-.7 1.6-1.6 1.6z"
        />
        <path
          fill="#fff"
          d="M44.8 28.8c-5.4 0-9.8 3.5-9.8 7.8 0 2.5 1.5 4.8 3.8 6.2l-.9 3.5 4-2.1c1.1.3 2.3.5 3.5.5 5.4 0 9.8-3.5 9.8-7.8s-4.4-7.9-9.8-7.9zm-3 7c-.7 0-1.3-.6-1.3-1.3s.6-1.3 1.3-1.3 1.3.6 1.3 1.3-.6 1.3-1.3 1.3zm6 0c-.7 0-1.3-.6-1.3-1.3s.6-1.3 1.3-1.3 1.3.6 1.3 1.3-.6 1.3-1.3 1.3z"
        />
      </svg>
    )
  }
  if (channel === 'alipay') {
    return (
      <svg className={cls} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#1677FF" />
        <path
          fill="#fff"
          d="M44.5 20.5H19.5c-1.5 0-2.7 1.2-2.7 2.7v17.6c0 1.5 1.2 2.7 2.7 2.7h25c1.5 0 2.7-1.2 2.7-2.7V23.2c0-1.5-1.2-2.7-2.7-2.7zm-2.2 15.8c-3.4 2.5-7.9 3.8-13.4 3.8h-.1c-.4 0-.8-.3-.8-.8v-2.1c0-.4.3-.8.8-.8h.1c4 0 7.5-1 10.3-2.9-2.8-2.2-4.6-5.5-4.6-9.1 0-6.6 5.8-12 13-12s13 5.4 13 12c0 4.2-2.4 7.9-6 10.3l2.5 4.6-5.2-1.9z"
        />
      </svg>
    )
  }
  return (
    <svg className={cls} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#111" />
      <path
        fill="#25F4EE"
        d="M36 18v17.8c0 4.2-3.4 7.6-7.6 7.6S20.8 40 20.8 35.8 24.2 28.2 28.4 28.2c.9 0 1.8.2 2.6.5V22.4a9.8 9.8 0 0 0-2.6-.4C22.1 22 18 26.1 18 31.2S22.1 40.4 28.4 40.4 38.6 36.3 38.6 31.2V26c2.2 1.6 4.9 2.5 7.8 2.5V22.3c-3.4 0-6.2-1.9-7.8-4.9z"
      />
      <path
        fill="#FE2C55"
        d="M46.4 22.3v6.2c-2.9 0-5.6-.9-7.8-2.5v5c0 5.1-4.1 9.2-9.4 9.2-1.8 0-3.5-.5-4.9-1.4 1.8 2.2 4.5 3.6 7.5 3.6 5.3 0 9.4-4.1 9.4-9.2V18h-4.8c1.6 3 4.4 4.9 7.8 4.9z"
      />
    </svg>
  )
}
