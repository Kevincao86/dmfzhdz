import path from 'node:path'
import { cpSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import type { Plugin } from 'vite'
import { MERCHANT_ERP_PUBLIC } from './vite.merchantErpRoot'

function isFile(p: string) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function isDir(p: string) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 将商家 ERP public（数字人头像、ai-vendors 等）合并进履约 dist */
export function copyMerchantPublicInto(outDir: string) {
  if (!existsSync(MERCHANT_ERP_PUBLIC)) return
  for (const name of readdirSync(MERCHANT_ERP_PUBLIC)) {
    const src = path.join(MERCHANT_ERP_PUBLIC, name)
    const dest = path.join(outDir, name)
    if (isDir(src)) {
      cpSync(src, dest, { recursive: true, force: true })
    } else if (isFile(src)) {
      cpSync(src, dest, { force: true })
    }
  }
}

function contentTypeFor(filePath: string): string | undefined {
  if (/\.jpe?g$/i.test(filePath)) return 'image/jpeg'
  if (/\.png$/i.test(filePath)) return 'image/png'
  if (/\.svg$/i.test(filePath)) return 'image/svg+xml'
  if (/\.gif$/i.test(filePath)) return 'image/gif'
  if (/\.webp$/i.test(filePath)) return 'image/webp'
  if (/\.ico$/i.test(filePath)) return 'image/x-icon'
  if (/\.css$/i.test(filePath)) return 'text/css'
  if (/\.js$/i.test(filePath)) return 'application/javascript'
  return undefined
}

/** dev/preview：从商家 public 提供 /digital-human、/ai-vendors 等静态资源 */
export function merchantPublicAssetsPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'merchant-public-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? ''
        if (!raw || raw.startsWith('/api') || raw.startsWith('/@') || raw.startsWith('/src')) return next()
        const rel = decodeURIComponent(raw.replace(/^\//, ''))
        const filePath = path.join(MERCHANT_ERP_PUBLIC, rel)
        if (!filePath.startsWith(MERCHANT_ERP_PUBLIC) || !isFile(filePath)) return next()
        try {
          const type = contentTypeFor(filePath)
          if (type) res.setHeader('Content-Type', type)
          res.end(readFileSync(filePath))
        } catch {
          next()
        }
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? ''
        if (!raw || raw.startsWith('/api')) return next()
        const rel = decodeURIComponent(raw.replace(/^\//, ''))
        const filePath = path.join(MERCHANT_ERP_PUBLIC, rel)
        if (!filePath.startsWith(MERCHANT_ERP_PUBLIC) || !isFile(filePath)) return next()
        try {
          const type = contentTypeFor(filePath)
          if (type) res.setHeader('Content-Type', type)
          res.end(readFileSync(filePath))
        } catch {
          next()
        }
      })
    },
    closeBundle() {
      copyMerchantPublicInto(outDir)
    },
  }
}
