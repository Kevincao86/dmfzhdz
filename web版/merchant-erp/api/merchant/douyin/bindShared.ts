/**
 * 会话密封 / Map：实现见 `api/douyin-bind.ts`。
 */
export type { DouyinMerchantSession, DouyinSessionCredentialsPayload } from '../../douyin-bind.ts'
export {
  douyinMerchantDevSessions,
  merchantDouyinSessionSecret,
  openDouyinSessionCredentials,
  sealDouyinSessionCredentials,
} from '../../douyin-bind.ts'
