import { runProfileLinkParseCore } from '../src/lib/profileLinkParseCore.js'

const samples = [
  {
    platform: '抖音',
    link: '2- 长按复制此条消息，打开抖音搜索，查看TA的更多作品。 https://v.douyin.com/nk49vT-LArs/ 1@7.com :0pm',
  },
  {
    platform: '小红书',
    link: '@3kissland 在小红书收获了27.3K次赞与收藏，查看Ta的主页>> https://xhslink.com/m/3Ay6k8iPdQ1',
  },
  {
    platform: '大众点评',
    link: '【@美式品鉴家的个人主页】 https://w.dianping.com/cube/evoke/dianping.html?url=dianping%3A%2F%2Fuser%3Fuserid%3D859830995&shareid=PByI6IJPkY_1780827371',
  },
  {
    platform: '快手',
    link: 'https://v.kuaishou.com/nti21yJA 看了这么多快手，还是「魔术师-二哥」最好玩了！ 复制此消息，打开【快手】直接观看！',
  },
]

async function main() {
  for (const s of samples) {
    console.log('\n===', s.platform, '===')
    const r = await runProfileLinkParseCore({ link: s.link, platform: s.platform })
    console.log(JSON.stringify(r, null, 2))
  }
}

main().catch(console.error)
