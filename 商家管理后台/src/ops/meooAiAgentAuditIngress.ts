/**
 * 预留：商户 ERP AI 网关 → 运营台审计接入点。
 *
 * - HTTP：`POST ${运营台根}/api/meoo-ai-agent-audit`
 * - 鉴权：请求头 `x-meoo-ai-audit-secret`（与 ERP `MEOO_AI_AGENT_AUDIT_SECRET`、本仓库 Vercel `MEOO_AI_AGENT_AUDIT_SECRET` 一致）
 * - 实现：`api/meoo-ai-agent-audit.ts`（当前写结构化日志；可扩展入库）
 */
export const MEOO_AI_AGENT_AUDIT_PATH = '/api/meoo-ai-agent-audit' as const
