/** Vercel Serverless 与 ECS auth-api 共用路由时的运行环境区分 */
export function isVercelServerless(): boolean {
  return process.env.VERCEL === '1'
}
