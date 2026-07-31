#!/usr/bin/env node
import cron from 'node-cron'
import { config } from './config.js'
import { runDailyReminder } from './jobs/dailyReminder.js'
import { runCustomerRank } from './jobs/customerRank.js'
import { runFileShareDigest } from './jobs/fileShareDigest.js'

const tz = config.tz || 'Asia/Shanghai'

async function safe(name, fn) {
  try {
    console.log(`[schedule] 开始 ${name} @ ${new Date().toISOString()}`)
    const result = await fn()
    console.log(`[schedule] 完成 ${name}`, result)
  } catch (err) {
    console.error(`[schedule] 失败 ${name}`, err?.stack || err)
  }
}

console.log(`[schedule] 启动 · TZ=${tz} · DRY_RUN=${config.dryRun}`)
console.log('[schedule] 工作日 09:30 跟进提醒 | 周一 10:00 周报 | 每月1日 10:00 月报 | 周一 10:30 文件摘要')

// 工作日 09:30 跟进提醒
cron.schedule(
  '30 9 * * 1-5',
  () => safe('reminder', runDailyReminder),
  { timezone: tz },
)

// 每周一 10:00 周报
cron.schedule(
  '0 10 * * 1',
  () => safe('rank-week', () => runCustomerRank('week')),
  { timezone: tz },
)

// 每月 1 日 10:00 月报
cron.schedule(
  '0 10 1 * *',
  () => safe('rank-month', () => runCustomerRank('month')),
  { timezone: tz },
)

// 每周一 10:30 共享文件摘要
cron.schedule(
  '30 10 * * 1',
  () => safe('files', runFileShareDigest),
  { timezone: tz },
)
