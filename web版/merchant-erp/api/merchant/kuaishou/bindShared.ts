/**
 * 会话密封 / Map：实现见 `api/kuaishou-bind.ts`。
 */
export type { KuaishouMerchantSession, KuaishouSessionCredentialsPayload } from '../../kuaishou-bind.js'
export {
  kuaishouMerchantDevSessions,
  merchantKuaishouSessionSecret,
  openKuaishouSessionCredentials,
  sealKuaishouSessionCredentials,
} from '../../kuaishou-bind.js'
