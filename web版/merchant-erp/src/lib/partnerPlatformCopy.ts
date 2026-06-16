import { isPartnerEdition } from './appEdition'

/** 服务商版「服务商平台」与「客户商家」文案（商家版仍用组件内原有「来客」文案） */

export type DouyinBindCopy = {
  brandAlt: string
  sectionTitle: string
  sectionIntro: string
  bindButton: string
  addButton: string
  accountsHeading: string
  emptyAccountsHint: string
  defaultAccountName: string
  bindModalTitle: string
  bindModalAddTitle: string
  merchantIdLabel: string
  merchantIdPlaceholder: string
  emptyStateHint: string
  guideTitle: string
  cardBoundTitle: string
  cardBoundDegradedTitle: string
  cardErrorTitle: string
}

export function douyinBindCopy(): DouyinBindCopy {
  if (isPartnerEdition()) {
    return {
      brandAlt: '抖音林客',
      sectionTitle: '抖音林客 · 服务商应用',
      sectionIntro:
        '绑定生活服务开放平台创建的「服务商应用」（非商家应用）。完成林客授权后，方可在「客户商家」添加代运营商家账号；商品查询默认走 goods_query_type=3。',
      bindButton: '绑定抖音林客',
      addButton: '添加林客账号',
      accountsHeading: '已绑定的林客账号',
      emptyAccountsHint: '尚未绑定林客服务商应用',
      defaultAccountName: '林客账号',
      bindModalTitle: '绑定抖音林客',
      bindModalAddTitle: '添加林客账号',
      merchantIdLabel: '服务商账户 ID',
      merchantIdPlaceholder: '林客 / 服务商根账户 ID（非客户商家 ID）',
      emptyStateHint:
        '尚未绑定。请先在开放平台创建「服务商应用」并完成林客接入，再填写 AppID、App Secret 与服务商账户 ID。绑定成功后，前往「客户商家」添加代运营客户。',
      guideTitle: '抖音林客 · 服务商接入说明',
      cardBoundTitle: '抖音林客已绑定',
      cardBoundDegradedTitle: '抖音林客已绑定（门店同步受阻）',
      cardErrorTitle: '抖音林客连接异常',
    }
  }
  return {
    brandAlt: '抖音来客',
    sectionTitle: '抖音来客商家版',
    sectionIntro:
      '绑定开放平台凭证后，经后端代理拉取账户下全部门店明细。可与「巨量本地推」使用不同登录账号。',
    bindButton: '绑定抖音来客',
    addButton: '添加来客账号',
    accountsHeading: '已绑定的来客账号',
    emptyAccountsHint: '尚未绑定来客账号',
    defaultAccountName: '来客账号',
    bindModalTitle: '绑定抖音来客',
    bindModalAddTitle: '添加抖音来客账号',
    merchantIdLabel: '商户 ID',
    merchantIdPlaceholder: '抖音来客商户根账户 ID',
    emptyStateHint:
      '完成来客与开放平台配置，再点击「绑定抖音来客」填写 AppID、App Secret 与商户 ID。',
    guideTitle: '抖音来客绑定说明书',
    cardBoundTitle: '抖音来客已绑定',
    cardBoundDegradedTitle: '抖音来客已绑定（门店同步受阻）',
    cardErrorTitle: '抖音来客连接异常',
  }
}

export type KuaishouBindCopy = {
  sectionTitle: string
  bindButton: string
  addButton: string
  accountsHeading: string
  emptyAccountsHint: string
  defaultAccountName: string
  bindModalTitle: string
  bindModalAddTitle: string
  merchantIdPlaceholder: string
  emptyStateHint: string
  cardBoundTitle: string
  cardBoundDegradedTitle: string
  cardErrorTitle: string
}

export function kuaishouBindCopy(): KuaishouBindCopy {
  if (isPartnerEdition()) {
    return {
      sectionTitle: '快手团购 · 服务商应用',
      bindButton: '绑定快手服务商',
      addButton: '添加服务商账号',
      accountsHeading: '已绑定的服务商账号',
      emptyAccountsHint: '尚未绑定快手服务商应用',
      defaultAccountName: '服务商账号',
      bindModalTitle: '绑定快手服务商',
      bindModalAddTitle: '添加服务商账号',
      merchantIdPlaceholder: '服务商根账户 ID（非客户商家 ID）',
      emptyStateHint:
        '请先在快手本地生活开放平台创建服务商应用并完成接入，再填写凭证。绑定成功后，前往「客户商家」添加代运营客户。',
      cardBoundTitle: '快手服务商已绑定',
      cardBoundDegradedTitle: '快手服务商已绑定（门店同步受阻）',
      cardErrorTitle: '快手服务商连接异常',
    }
  }
  return {
    sectionTitle: '快手团购商家版',
    bindButton: '绑定快手团购',
    addButton: '添加快手账号',
    accountsHeading: '已绑定的快手账号',
    emptyAccountsHint: '尚未绑定快手账号',
    defaultAccountName: '快手账号',
    bindModalTitle: '绑定快手团购',
    bindModalAddTitle: '添加快手团购账号',
    merchantIdPlaceholder: '快手团购商户根账户 ID',
    emptyStateHint: '完成开放平台配置后，填写 AppID、App Secret 与商户 ID。',
    cardBoundTitle: '快手团购已绑定',
    cardBoundDegradedTitle: '快手团购已绑定（门店同步受阻）',
    cardErrorTitle: '快手团购连接异常',
  }
}

/** 服务商版已支持的平台 ID（服务商平台 / 客户商家） */
export const PARTNER_SUPPORTED_GROUPBUY_PLATFORM_IDS = ['douyin', 'kuaishou'] as const

export function isPartnerSupportedGroupbuyPlatform(id: string): boolean {
  return (PARTNER_SUPPORTED_GROUPBUY_PLATFORM_IDS as readonly string[]).includes(id)
}
