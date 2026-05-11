/**
 * 抖音绑定：会话 Map + AES-GCM 封装 token。
 * 实现位于 api 根目录 `douyinMerchantBindCore.ts`，便于 Vercel 单函数打包。
 */
export type { DouyinMerchantSession, DouyinSessionCredentialsPayload } from '../../douyinMerchantBindCore'
export {
  douyinMerchantDevSessions,
  merchantDouyinSessionSecret,
  openDouyinSessionCredentials,
  sealDouyinSessionCredentials,
} from '../../douyinMerchantBindCore'
