#!/usr/bin/env node
import { runDailyReminder } from './jobs/dailyReminder.js'
import { runCustomerRank } from './jobs/customerRank.js'
import { runFileShareDigest } from './jobs/fileShareDigest.js'

const cmd = String(process.argv[2] || '').trim()

async function main() {
  switch (cmd) {
    case 'reminder':
      return runDailyReminder()
    case 'rank-week':
      return runCustomerRank('week')
    case 'rank-month':
      return runCustomerRank('month')
    case 'files':
      return runFileShareDigest()
    case 'demo': {
      console.log('—— demo: 跟进提醒 ——')
      await runDailyReminder()
      console.log('—— demo: 周报 ——')
      await runCustomerRank('week')
      console.log('—— demo: 月报 ——')
      await runCustomerRank('month')
      console.log('—— demo: 共享文件 ——')
      await runFileShareDigest()
      return { ok: true, demo: true }
    }
    default:
      console.error(
        '用法: node src/cli.js <reminder|rank-week|rank-month|files|demo>',
      )
      process.exitCode = 1
      return null
  }
}

main()
  .then((result) => {
    if (result) console.log('[done]', JSON.stringify(result, null, 2))
  })
  .catch((err) => {
    console.error('[error]', err?.stack || err)
    process.exitCode = 1
  })
