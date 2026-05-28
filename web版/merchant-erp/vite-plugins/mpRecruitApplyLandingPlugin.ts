import type { Plugin } from 'vite'
import { mpRecruitApplyLandingHtml } from '../src/lib/mpRecruitApplyLanding.js'

/** dev：/api/mp-recruit-apply 与 /mp-recruit/apply 报名落地页 */
export function mpRecruitApplyLandingPlugin(): Plugin {
  return {
    name: 'mp-recruit-apply-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url ?? ''
        const pathOnly = raw.split('?')[0]
        if (pathOnly !== '/api/mp-recruit-apply' && pathOnly !== '/mp-recruit/apply') {
          return next()
        }
        const q = new URL(raw, 'http://local')
        const mpId = q.searchParams.get('mpId') || ''
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(mpRecruitApplyLandingHtml(mpId))
      })
    },
  }
}
