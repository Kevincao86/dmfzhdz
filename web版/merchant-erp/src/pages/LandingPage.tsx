import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../cn'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import { getAppEdition, isPartnerEdition, peerEditionRootUrl } from '../lib/appEdition'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import EditionLandingToggle from './landing/EditionLandingToggle'
import WebStaticOssImage from '../components/WebStaticOssImage'
import LandingHeroBackground from './landing/LandingHeroBackground'
import LandingSection3 from './landing/LandingSection3'
import LoginPortalNav from '../components/login/LoginPortalNav'
import {
  EDITION_LABEL,
  getLandingConfig,
  type LandingEditionKey,
} from './landing/landingConfig'
import './landing/landingLook.css'

const SECTION_COUNT = 4

function scrollToSection(root: HTMLElement | null, index: number) {
  if (!root) return
  root.scrollTo({ top: index * root.clientHeight, behavior: 'smooth' })
}

export default function LandingPage() {
  const nav = useNavigate()
  const siteEdition = getAppEdition()
  const config = getLandingConfig(siteEdition)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState(0)
  const [viewEdition, setViewEdition] = useState<LandingEditionKey>(siteEdition)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav('/home', { replace: true })
    })
  }, [nav])

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.clientHeight < 1) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    setActiveSection(Math.min(SECTION_COUNT - 1, Math.max(0, idx)))
  }, [])

  const m = config.marketing[viewEdition]
  const onSameEdition = viewEdition === siteEdition

  function goAuth() {
    if (onSameEdition) {
      nav('/login', { replace: false })
      return
    }
    window.location.href = peerEditionRootUrl()
  }

  const featured = config.section2Cards[0]
  const restCards = config.section2Cards.slice(1)

  return (
    <div className="lq-site h-[100dvh] overflow-hidden bg-[var(--lq-ink)] text-[var(--lq-steam)]">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto scroll-smooth"
      >
        <section className="relative h-[100dvh] w-full shrink-0 snap-start snap-always">
          <LandingHeroBackground config={config} />
          <div className="lq-hero-veil absolute inset-0" />

          <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10 lg:px-14">
            <div className="flex items-center gap-3">
              <img
                src={BRAND_LOGO_URL}
                alt={BRAND_NAME_SHORT}
                className="h-10 w-10 rounded-sm object-contain sm:h-11 sm:w-11"
              />
              <div>
                <p className="lq-serif text-sm tracking-[0.12em] text-[var(--lq-brass)]">{BRAND_NAME_SHORT}</p>
                <p className="hidden text-[13px] text-white/70 sm:block">{config.productTitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="hidden lg:block">
              <LoginPortalNav
                linkClassName="text-white/65 hover:text-white"
                activeClassName="text-[var(--lq-brass)] font-semibold"
              />
              </div>
              <button
                type="button"
                onClick={() => (onSameEdition ? nav('/login') : goAuth())}
                className="lq-cta rounded-sm px-5 py-2 text-sm"
              >
                进店
              </button>
            </div>
          </header>

          <p className="lq-plaque pointer-events-none absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 py-6 text-2xl sm:left-8 sm:block lg:left-12 lg:text-3xl">
            探店
          </p>

          <div className="pointer-events-none absolute bottom-36 left-6 z-10 max-w-xl sm:bottom-32 sm:left-24 lg:left-28">
            <h1 className="lq-serif text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              {m.headline}
              <br />
              好经营成就好增长
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/72">{m.sub}</p>
          </div>

          <div className="absolute bottom-8 right-6 z-20 w-[min(100%,320px)] sm:right-10 lg:right-14">
            <p className="mb-3 text-right text-xs text-white/55">{m.cta}</p>
            <EditionLandingToggle
              siteEdition={siteEdition}
              viewEdition={viewEdition}
              onViewEditionChange={setViewEdition}
            />
            <button
              type="button"
              onClick={goAuth}
              className="lq-cta mt-3 w-full rounded-sm py-3 text-sm"
            >
              {onSameEdition
                ? `以${EDITION_LABEL[viewEdition]}进店`
                : `前往${EDITION_LABEL[viewEdition]}`}
            </button>
            {!isPartnerEdition() ? (
              <button
                type="button"
                onClick={() => nav('/affiliate/apply')}
                className="mt-2 w-full rounded-sm border border-[var(--lq-brass)]/45 bg-transparent py-2.5 text-sm text-[var(--lq-brass)] hover:bg-white/5"
              >
                申请成为推广员
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-[11px] tracking-[0.2em] text-white/50 hover:text-white/80"
            onClick={() => scrollToSection(scrollerRef.current, 1)}
          >
            下滑
          </button>
        </section>

        <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always flex-col justify-center bg-[var(--lq-paper)] px-4 py-12 text-[var(--lq-ink)] sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-6xl">
            <h2 className="lq-serif text-3xl font-semibold sm:text-4xl">
              {config.section2Title}
              <span className="ml-1 decoration-[var(--lq-lacquer)] decoration-2 underline-offset-8 underline">
                {config.section2TitleAccent}
              </span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-[15px]">
              {config.section2Subtitle}
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-5">
              {featured ? (
                <article className="overflow-hidden border border-stone-300 bg-white">
                  <div className="relative h-48 bg-stone-200 sm:h-56 lg:h-[22rem]">
                    <WebStaticOssImage
                      app="merchant"
                      localPath={featured.img}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute left-0 top-0 bg-[var(--lq-lacquer)] px-3 py-1 text-[11px] text-white">
                      {featured.tag}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="lq-serif text-xl">{featured.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone-600">{featured.desc}</p>
                  </div>
                </article>
              ) : null}
              <div className="flex flex-col gap-4">
                {restCards.map((card) => (
                  <article
                    key={card.title}
                    className="flex min-h-0 flex-1 overflow-hidden border border-stone-300 bg-white"
                  >
                    <div className="relative w-[38%] shrink-0 bg-stone-200">
                      <WebStaticOssImage
                        app="merchant"
                        localPath={card.img}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-1 flex-col justify-center p-4">
                      <p className="text-[11px] text-[var(--lq-lacquer)]">{card.tag}</p>
                      <h3 className="lq-serif mt-1 text-base">{card.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-stone-600">{card.desc}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <LandingSection3 config={config} />

        <section className="relative flex h-[100dvh] shrink-0 snap-start snap-always items-center overflow-hidden bg-[var(--lq-night)] px-4 py-12 sm:px-10 lg:px-14">
          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <h2 className="lq-serif text-3xl font-semibold leading-snug sm:text-4xl">
                {config.section4Title}
                <br />
                <span className="text-[var(--lq-brass)]">{config.section4TitleAccent}</span>
              </h2>
              <ol className="mt-8 space-y-0 border-l border-[var(--lq-brass)]/40 pl-5">
                {config.section4Steps.map((s) => (
                  <li
                    key={s.n}
                    className={cn(
                      'relative py-3 text-sm',
                      s.active ? 'text-[var(--lq-steam)]' : 'text-white/35',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute -left-[1.4rem] top-4 h-2 w-2 rounded-full',
                        s.active ? 'bg-[var(--lq-brass)]' : 'bg-white/25',
                      )}
                    />
                    {s.title}
                  </li>
                ))}
              </ol>
              <button type="button" onClick={() => nav('/login')} className="lq-cta mt-8 rounded-sm px-8 py-2.5 text-sm">
                进店登录
              </button>
            </div>
            <div className="border border-[var(--lq-brass)]/25 bg-black/25 p-4 sm:p-6">
              <h3 className="lq-serif text-xl">{config.section4PanelTitle}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{config.section4PanelDesc}</p>
              <WebStaticOssImage
                app="merchant"
                localPath={config.section4ShowcaseImg}
                alt=""
                className="mt-4 w-full object-cover"
                loading="lazy"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {config.section4Tags.map((tag) => (
                  <span
                    key={tag}
                    className="border border-[var(--lq-brass)]/35 px-3 py-1 text-xs text-[var(--lq-brass)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <nav
        className="fixed right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2 sm:right-6"
        aria-label="页面导航"
      >
        {Array.from({ length: SECTION_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`第 ${i + 1} 屏`}
            aria-current={activeSection === i ? 'true' : undefined}
            onClick={() => scrollToSection(scrollerRef.current, i)}
            className={cn(
              'h-2 w-2 rounded-full',
              activeSection === i ? 'bg-[var(--lq-brass)]' : 'bg-white/30 hover:bg-white/55',
            )}
          />
        ))}
      </nav>
    </div>
  )
}
