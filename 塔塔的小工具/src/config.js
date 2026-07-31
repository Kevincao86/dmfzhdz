import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(ROOT, '.env') })

function envBool(name, defaultValue) {
  const raw = process.env[name]
  if (raw == null || raw === '') return defaultValue
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase())
}

function envStr(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim()
}

const schemaPath = path.join(ROOT, 'config', 'sheets.schema.json')
export const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))

export const config = {
  dryRun: envBool('DRY_RUN', true),
  tz: envStr('TZ', 'Asia/Shanghai'),
  wecom: {
    corpId: envStr('WECOM_CORPID'),
    corpSecret: envStr('WECOM_CORPSECRET'),
    webhookUrl: envStr('WECOM_WEBHOOK_URL'),
    webhookKey: envStr('WECOM_WEBHOOK_KEY'),
    docs: {
      followup: {
        docid: envStr('WECOM_DOC_FOLLOWUP'),
        sheetId: envStr('WECOM_SHEET_FOLLOWUP'),
      },
      rank: {
        docid: envStr('WECOM_DOC_RANK'),
        sheetId: envStr('WECOM_SHEET_RANK'),
      },
      files: {
        docid: envStr('WECOM_DOC_FILES'),
        sheetId: envStr('WECOM_SHEET_FILES'),
      },
    },
  },
}

export function hasWecomAuth() {
  return Boolean(config.wecom.corpId && config.wecom.corpSecret)
}

export function hasSheetCreds(kind) {
  const d = config.wecom.docs[kind]
  return Boolean(d?.docid && d?.sheetId)
}

export function demoPath(name) {
  return path.join(ROOT, 'data', 'demo', name)
}
