/**
 * 会话密封 / Map：实现见 `api/douyin-bind.ts`。
 */
export type { DouyinMerchantSession, DouyinSessionCredentialsPayload } from '../../douyin-bind'
export {
  douyinMerchantDevSessions,
  merchantDouyinSessionSecret,
  openDouyinSessionCredentials,
  sealDouyinSessionCredentials,
} from '../../douyin-bind'
