import type { ServerResponse } from 'node:http'
import type { VercelResponse } from '@vercel/node'

export function createMockVercelResponse(res: ServerResponse) {
  let statusCode = 200
  const mockRes = {
    setHeader(k: string, v: string | number) {
      res.setHeader(k, String(v))
    },
    status(code: number) {
      statusCode = code
      return mockRes
    },
    send(payload: string) {
      res.statusCode = statusCode
      res.end(payload)
    },
    json(payload: unknown) {
      res.statusCode = statusCode
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
    },
    end(payload?: string) {
      res.statusCode = statusCode
      if (payload !== undefined) res.end(payload)
      else res.end()
    },
  } as unknown as VercelResponse
  return {
    mockRes,
    setStatus: (code: number) => {
      statusCode = code
    },
  }
}
