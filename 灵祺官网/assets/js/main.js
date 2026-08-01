(() => {
  const reducePageMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const topbar = document.getElementById("topbar");
  const onScroll = () => {
    if (!topbar) return;
    topbar.classList.toggle("is-scrolled", window.scrollY > 20);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* —— Page ambient FX（不动 Live Mesh 底栏） —— */
  const pageFx = document.getElementById("page-fx");
  const cursorOrb = document.getElementById("cursor-orb");

  if (pageFx instanceof HTMLCanvasElement && !reducePageMotion) {
    const ctx = pageFx.getContext("2d");
    let w = 0;
    let h = 0;
    let sparks = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      pageFx.width = Math.floor(w * dpr);
      pageFx.height = Math.floor(h * dpr);
      pageFx.style.width = `${w}px`;
      pageFx.style.height = `${h}px`;
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(56, Math.floor((w * h) / 32000));
      sparks = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.1 - Math.random() * 0.28,
        a: 0.12 + Math.random() * 0.4,
        hue: Math.random() > 0.5 ? "violet" : "cyan",
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.y < -10) s.y = h + 10;
        if (s.x < -10) s.x = w + 10;
        if (s.x > w + 10) s.x = -10;
        const alpha = s.a * (0.5 + 0.5 * Math.sin(now * 0.002 + s.x * 0.01));
        ctx.beginPath();
        ctx.fillStyle =
          s.hue === "cyan" ? `rgba(103,232,249,${alpha})` : `rgba(167,139,250,${alpha})`;
        ctx.shadowColor = s.hue === "cyan" ? "rgba(103,232,249,0.7)" : "rgba(167,139,250,0.7)";
        ctx.shadowBlur = 7;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if (cursorOrb && finePointer && !reducePageMotion) {
    document.body.classList.add("has-cursor-orb");
    window.addEventListener(
      "pointermove",
      (e) => {
        cursorOrb.style.left = `${e.clientX}px`;
        cursorOrb.style.top = `${e.clientY}px`;
      },
      { passive: true }
    );
  }

  document
    .querySelectorAll(".block-intro, .bento-cell, .engine-card, .service-strips > li, .steps > li, .banner, .talk-quote, .talk-form")
    .forEach((el) => el.classList.add("reveal"));

  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in-view"));
  }

  if (!reducePageMotion && finePointer) {
    document.querySelectorAll(".btn, .pill-cta, .bento-cell").forEach((el) => {
      el.addEventListener(
        "pointermove",
        (e) => {
          const rect = el.getBoundingClientRect();
          el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
          el.style.setProperty("--my", `${e.clientY - rect.top}px`);
          if (el.classList.contains("btn") || el.classList.contains("pill-cta")) {
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            el.style.transform = `translate(${x * 0.1}px, ${y * 0.14}px)`;
          }
        },
        { passive: true }
      );
      el.addEventListener("pointerleave", () => {
        if (el.classList.contains("btn") || el.classList.contains("pill-cta")) {
          el.style.transform = "";
        }
      });
    });
  }

  /* —— Contact form —— */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  const CONTACT_API = (
    window.LINGQI_CONTACT_API || "https://mofangdianai.com/erp-api/meoo-official-contact"
  ).replace(/\/+$/, "");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const company = String(data.get("company") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const needRaw = String(data.get("need") || "").trim();
      const messageRaw = String(data.get("message") || "").trim();
      const need = needRaw ? `【灵祺官网】${needRaw}` : "";
      const message = messageRaw ? `[来源：灵祺官网]\n${messageRaw}` : "[来源：灵祺官网]";

      if (!name || !company || !phone || !needRaw) {
        if (note) {
          note.classList.add("error");
          note.textContent = "请完整填写姓名、公司、联系方式与需求方向。";
        }
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      if (note) {
        note.classList.remove("error");
        note.textContent = "正在提交…";
      }

      try {
        const res = await fetch(CONTACT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, company, phone, need, message }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          const err = String(json.error || `HTTP ${res.status}`);
          if (err === "feishu_not_configured") {
            throw new Error("咨询通道尚未配置完成，请稍后重试或发邮件至 hello@mofangdianai.com");
          }
          throw new Error(err);
        }
        if (note) {
          note.classList.remove("error");
          note.textContent = "已提交，我们会尽快与您联系。";
        }
        form.reset();
      } catch (err) {
        if (note) {
          note.classList.add("error");
          note.textContent =
            err instanceof Error
              ? err.message
              : "提交失败，请稍后重试或发邮件至 hello@mofangdianai.com";
        }
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  /* —— E：Live Mesh playground —— */
  const NODE_META = {
    merchant: {
      title: "商家 · ERP",
      desc: "AI 经营中枢：组品、招募、内容与财务一体协同，一键推送星选履约。",
      stats: [
        ["入口", "cs.mofangdianai.com"],
        ["能力", "Agent · 多平台门店"],
        ["状态", "Online"],
      ],
      href: "https://cs.mofangdianai.com",
      linkText: "进入商家版 →",
    },
    partner: {
      title: "服务商 · Partner",
      desc: "多客户协同后台：独立租户、客户切换、跨客户商品与投流管理。",
      stats: [
        ["入口", "fws.mofangdianai.com"],
        ["协同", "多商家汇总看板"],
        ["状态", "Online"],
      ],
      href: "https://fws.mofangdianai.com",
      linkText: "进入服务商版 →",
    },
    xingxuan: {
      title: "星选 · Match",
      desc: "达人 / PR / 拍摄 / 剪辑四身份工作台，AI 匹配与招募大厅。",
      stats: [
        ["入口", "dr.mofangdianai.com"],
        ["网络", "报名 · 反选 · 交付"],
        ["状态", "Online"],
      ],
      href: "https://dr.mofangdianai.com",
      linkText: "进入星选平台 →",
    },
    agent: {
      title: "Agent · AI Core",
      desc: "场景化智能体嵌入经营动作：组品、Brief、审片与合规检核。",
      stats: [
        ["链路", "预览 → 确认 → 写入"],
        ["协同", "ERP ↔ 星选"],
        ["状态", "Online"],
      ],
      href: "#services",
      linkText: "了解定制能力 →",
    },
    fulfill: {
      title: "履约 · Loop",
      desc: "招募 → 反选 → 交付 → 回链 → AI 核查 → 结算，全程可追踪。",
      stats: [
        ["闭环", "可验证交付"],
        ["检核", "回链 · AI 合规"],
        ["状态", "Online"],
      ],
      href: "#loop",
      linkText: "查看履约闭环 →",
    },
    private: {
      title: "私有化 · Deploy",
      desc: "模型与推理落在内网或专属云，数据不出域，可审计可扩容。",
      stats: [
        ["形态", "专有云 / 本地"],
        ["能力", "RAG · Agent"],
        ["状态", "Ready"],
      ],
      href: "#services",
      linkText: "咨询私有化 →",
    },
  };

  const LINKS = [
    ["merchant", "agent"],
    ["partner", "agent"],
    ["agent", "xingxuan"],
    ["xingxuan", "fulfill"],
    ["merchant", "xingxuan"],
    ["agent", "private"],
    ["partner", "fulfill"],
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wrap = document.querySelector(".play-canvas-wrap");
  const nodesRoot = document.getElementById("play-nodes");
  const svg = document.getElementById("play-links");
  const panel = document.getElementById("live-panel");
  const panelTitle = document.getElementById("panel-title");
  const panelDesc = document.getElementById("panel-desc");
  const panelStats = document.getElementById("panel-stats");
  const panelLink = document.getElementById("panel-link");
  const tip = document.getElementById("canvas-tip");
  const fxCanvas = document.getElementById("play-fx");
  const spotlight = document.getElementById("play-spotlight");
  const hudSync = document.getElementById("hud-sync");
  const hudLat = document.getElementById("hud-lat");
  const hudPkt = document.getElementById("hud-pkt");

  if (!wrap || !nodesRoot || !svg) return;

  const nodes = Array.from(nodesRoot.querySelectorAll(".node"));
  let linkGeometry = [];

  const centerOf = (el) => {
    const rect = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    };
  };

  const setPanel = (id) => {
    const meta = NODE_META[id];
    if (!meta) return;
    if (panelTitle) panelTitle.textContent = meta.title;
    if (panelDesc) panelDesc.textContent = meta.desc;
    if (panelStats) {
      panelStats.innerHTML = meta.stats
        .map(
          ([k, v]) =>
            `<div><dt>${k}</dt><dd${v === "Online" || v === "Ready" ? ' class="ok"' : ""}>${v}</dd></div>`
        )
        .join("");
    }
    if (panelLink) {
      panelLink.href = meta.href;
      panelLink.textContent = meta.linkText;
      if (meta.href.startsWith("http")) {
        panelLink.target = "_blank";
        panelLink.rel = "noopener noreferrer";
      } else {
        panelLink.removeAttribute("target");
        panelLink.removeAttribute("rel");
      }
    }
    if (panel) {
      panel.classList.remove("is-flash");
      void panel.offsetWidth;
      panel.classList.add("is-flash");
      window.setTimeout(() => panel.classList.remove("is-flash"), 480);
    }
  };

  const spawnRipple = (node) => {
    const ripple = document.createElement("span");
    ripple.className = "node-ripple";
    node.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  };

  const drawLinks = () => {
    const rect = wrap.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svg.innerHTML = "";
    linkGeometry = [];

    const byId = Object.fromEntries(nodes.map((n) => [n.dataset.id, n]));
    const activeId = nodes.find((n) => n.classList.contains("is-active"))?.dataset.id;

    for (const [aId, bId] of LINKS) {
      const a = byId[aId];
      const b = byId[bId];
      if (!a || !b) continue;
      const dim = a.classList.contains("is-dim") || b.classList.contains("is-dim");
      const hot = aId === activeId || bId === activeId;
      const pa = centerOf(a);
      const pb = centerOf(b);
      linkGeometry.push({ pa, pb, dim, hot });

      const base = document.createElementNS("http://www.w3.org/2000/svg", "line");
      base.setAttribute("class", "link-base");
      base.setAttribute("x1", String(pa.x));
      base.setAttribute("y1", String(pa.y));
      base.setAttribute("x2", String(pb.x));
      base.setAttribute("y2", String(pb.y));
      base.setAttribute(
        "stroke",
        dim ? "rgba(124,58,237,0.1)" : hot ? "rgba(124,58,237,0.55)" : "rgba(124,58,237,0.28)"
      );
      base.setAttribute("stroke-width", dim ? "1" : hot ? "2.2" : "1.5");
      svg.appendChild(base);

      if (!dim && !reduceMotion) {
        const flow = document.createElementNS("http://www.w3.org/2000/svg", "line");
        flow.setAttribute("class", "link-flow");
        flow.setAttribute("x1", String(pa.x));
        flow.setAttribute("y1", String(pa.y));
        flow.setAttribute("x2", String(pb.x));
        flow.setAttribute("y2", String(pb.y));
        flow.setAttribute("stroke", hot ? "rgba(103,232,249,0.95)" : "rgba(167,139,250,0.85)");
        flow.setAttribute("stroke-width", hot ? "2.4" : "1.8");
        flow.style.animationDuration = `${0.85 + Math.random() * 0.5}s`;
        svg.appendChild(flow);
      }
    }
  };

  const selectNode = (node) => {
    nodes.forEach((n) => n.classList.toggle("is-active", n === node));
    setPanel(node.dataset.id || "agent");
    spawnRipple(node);
    drawLinks();
  };

  nodes.forEach((node) => {
    node.addEventListener("click", () => {
      if (node.dataset.didDrag === "1") {
        node.dataset.didDrag = "0";
        return;
      }
      selectNode(node);
    });
  });

  document.querySelectorAll(".dock-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".dock-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      const focus = chip.getAttribute("data-focus") || "all";
      nodes.forEach((n) => {
        const layer = n.getAttribute("data-layer") || "";
        const show = focus === "all" || layer === focus;
        n.classList.toggle("is-dim", !show);
      });
      const first = nodes.find((n) => !n.classList.contains("is-dim"));
      if (first) selectNode(first);
      else drawLinks();
    });
  });

  let drag = null;

  const onPointerDown = (e) => {
    const node = e.target.closest(".node");
    if (!node || !nodesRoot.contains(node)) return;
    e.preventDefault();
    drag = {
      node,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    node.classList.add("is-dragging");
    node.setPointerCapture?.(e.pointerId);
    if (tip) {
      tip.hidden = false;
      tip.textContent = "能量重排中…松开锁定坐标";
    }
  };

  const onPointerMove = (e) => {
    const rect = wrap.getBoundingClientRect();
    if (spotlight) {
      spotlight.style.left = `${e.clientX - rect.left}px`;
      spotlight.style.top = `${e.clientY - rect.top}px`;
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    drag.node.style.setProperty("--x", `${Math.min(90, Math.max(10, x))}%`);
    drag.node.style.setProperty("--y", `${Math.min(88, Math.max(12, y))}%`);
    drawLinks();
  };

  const onPointerUp = () => {
    if (!drag) return;
    drag.node.classList.remove("is-dragging");
    if (drag.moved) drag.node.dataset.didDrag = "1";
    if (tip) tip.hidden = true;
    drag = null;
    drawLinks();
  };

  wrap.addEventListener("pointerdown", onPointerDown);
  wrap.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", () => {
    resizeFx();
    drawLinks();
  });

  /* Particle field + energy packets */
  let fxCtx = null;
  let fxW = 0;
  let fxH = 0;
  let sparks = [];
  let packets = [];

  const resizeFx = () => {
    if (!(fxCanvas instanceof HTMLCanvasElement)) return;
    fxCtx = fxCanvas.getContext("2d");
    if (!fxCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fxW = wrap.clientWidth;
    fxH = wrap.clientHeight;
    fxCanvas.width = Math.floor(fxW * dpr);
    fxCanvas.height = Math.floor(fxH * dpr);
    fxCanvas.style.width = `${fxW}px`;
    fxCanvas.style.height = `${fxH}px`;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(70, Math.floor((fxW * fxH) / 14000));
    sparks = Array.from({ length: count }, () => ({
      x: Math.random() * fxW,
      y: Math.random() * fxH,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -0.12 - Math.random() * 0.35,
      a: 0.2 + Math.random() * 0.5,
      hue: Math.random() > 0.55 ? "violet" : "cyan",
    }));
  };

  const tickFx = (now) => {
    if (!fxCtx || reduceMotion) return;
    fxCtx.clearRect(0, 0, fxW, fxH);

    for (const s of sparks) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.y < -8) s.y = fxH + 8;
      if (s.x < -8) s.x = fxW + 8;
      if (s.x > fxW + 8) s.x = -8;
      const alpha = s.a * (0.55 + 0.45 * Math.sin(now * 0.003 + s.x));
      fxCtx.beginPath();
      fxCtx.fillStyle =
        s.hue === "cyan" ? `rgba(103,232,249,${alpha})` : `rgba(167,139,250,${alpha})`;
      fxCtx.shadowColor = s.hue === "cyan" ? "rgba(103,232,249,0.8)" : "rgba(167,139,250,0.8)";
      fxCtx.shadowBlur = 8;
      fxCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.shadowBlur = 0;

    if (packets.length < linkGeometry.filter((g) => !g.dim).length) {
      for (const g of linkGeometry) {
        if (g.dim) continue;
        if (Math.random() > 0.04) continue;
        packets.push({
          g,
          t: 0,
          speed: 0.008 + Math.random() * 0.012,
          r: 2 + Math.random() * 2,
          hot: g.hot,
        });
      }
    }

    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.t += p.speed;
      if (p.t >= 1) {
        packets.splice(i, 1);
        continue;
      }
      const x = p.g.pa.x + (p.g.pb.x - p.g.pa.x) * p.t;
      const y = p.g.pa.y + (p.g.pb.y - p.g.pa.y) * p.t;
      fxCtx.beginPath();
      fxCtx.fillStyle = p.hot ? "rgba(103,232,249,0.95)" : "rgba(196,181,253,0.95)";
      fxCtx.shadowColor = p.hot ? "rgba(103,232,249,1)" : "rgba(167,139,250,1)";
      fxCtx.shadowBlur = 12;
      fxCtx.arc(x, y, p.r, 0, Math.PI * 2);
      fxCtx.fill();
    }
    fxCtx.shadowBlur = 0;

    requestAnimationFrame(tickFx);
  };

  /* HUD live metrics */
  if (!reduceMotion) {
    window.setInterval(() => {
      if (hudSync) hudSync.textContent = `${(97.8 + Math.random() * 1.8).toFixed(1)}%`;
      if (hudLat) hudLat.textContent = `${8 + Math.floor(Math.random() * 16)}ms`;
      if (hudPkt) hudPkt.textContent = `${(0.9 + Math.random() * 1.4).toFixed(1)}k`;
    }, 1200);
  }

  const active = nodes.find((n) => n.classList.contains("is-active")) || nodes[0];
  if (active) selectNode(active);
  resizeFx();
  requestAnimationFrame(drawLinks);
  if (!reduceMotion && fxCanvas) requestAnimationFrame(tickFx);
})();
