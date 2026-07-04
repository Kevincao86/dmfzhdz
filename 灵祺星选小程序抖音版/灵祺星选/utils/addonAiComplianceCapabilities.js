const VIDEO_CAPABILITY_META = {
  title: '全方位视频合规检测',
  subtitle: 'AI 抽帧 + ASR + OCR，识别画面与音频中的合规风险',
  cards: [
    {
      id: 'ocr',
      title: 'OCR 字幕',
      desc: '识别视频字幕、贴片文字、Logo 文案',
      tone: 'rose',
      glyph: '字',
    },
    {
      id: 'frames',
      title: '抽帧画面',
      desc: '逐帧检测违规画面、低俗、暴力',
      tone: 'sky',
      glyph: '帧',
    },
    {
      id: 'asr',
      title: '音频识别',
      desc: 'ASR 转写 + 违禁词扫描',
      tone: 'violet',
      glyph: '音',
    },
    {
      id: 'behavior',
      title: '行为风险',
      desc: '暴力、危险动作、违规手势',
      tone: 'emerald',
      glyph: '⚠',
    },
    {
      id: 'ai',
      title: 'AI 复核',
      desc: '大模型语义理解兜底',
      tone: 'amber',
      glyph: 'AI',
    },
    {
      id: 'brand',
      title: '品牌识别',
      desc: 'Logo、品牌、广告内容识别',
      tone: 'indigo',
      glyph: '标',
    },
  ],
}

const SCRIPT_CAPABILITY_META = {
  title: '全方位文稿合规检测',
  subtitle: '全文扫描 + 平台规则 + AI 语义复核，精准定位违规片段',
  cards: [
    {
      id: 'scan',
      title: '全文扫描',
      desc: '违禁词与风险短语本地预扫描',
      tone: 'rose',
      glyph: '文',
    },
    {
      id: 'rules',
      title: '平台规则',
      desc: '对齐小红书 / 大众点评笔记规范',
      tone: 'sky',
      glyph: '规',
    },
    {
      id: 'locate',
      title: '段落定位',
      desc: '标注违规段落与原文片段',
      tone: 'violet',
      glyph: '段',
    },
    {
      id: 'extreme',
      title: '极限用语',
      desc: '绝对化、夸大宣传表述识别',
      tone: 'emerald',
      glyph: '禁',
    },
    {
      id: 'ai',
      title: 'AI 复核',
      desc: '大模型语义理解与修改建议',
      tone: 'amber',
      glyph: 'AI',
    },
    {
      id: 'disclosure',
      title: '合规披露',
      desc: '广告标识、品牌授权等检查',
      tone: 'indigo',
      glyph: '告',
    },
  ],
}

function capabilityMetaForMode(reviewMode) {
  return reviewMode === 'video' ? VIDEO_CAPABILITY_META : SCRIPT_CAPABILITY_META
}

module.exports = {
  capabilityMetaForMode,
}
