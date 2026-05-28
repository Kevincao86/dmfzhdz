/**
 * GET /api/mp-recruit-apply?mpId=MP-RO-xxx — 招募分享报名落地页（复制文案中的链接）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { mpRecruitApplyLandingHtml } from '../src/lib/mpRecruitApplyLanding.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(204).end()
    return
  }
  const mpId = String(req.query?.mpId ?? '').trim()
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(mpRecruitApplyLandingHtml(mpId))
}
