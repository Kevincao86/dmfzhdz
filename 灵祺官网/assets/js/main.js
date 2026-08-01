(() => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const topbar = document.getElementById("topbar");
  const onScroll = () => {
    if (!topbar) return;
    topbar.classList.toggle("is-scrolled", window.scrollY > 20);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

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

  const wrap = document.querySelector(".play-canvas-wrap");
  const nodesRoot = document.getElementById("play-nodes");
  const svg = document.getElementById("play-links");
  const panelTitle = document.getElementById("panel-title");
  const panelDesc = document.getElementById("panel-desc");
  const panelStats = document.getElementById("panel-stats");
  const panelLink = document.getElementById("panel-link");
  const tip = document.getElementById("canvas-tip");

  if (!wrap || !nodesRoot || !svg) return;

  const nodes = Array.from(nodesRoot.querySelectorAll(".node"));

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
  };

  const drawLinks = () => {
    const rect = wrap.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    svg.innerHTML = "";

    const centerOf = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - rect.left + r.width / 2,
        y: r.top - rect.top + r.height / 2,
      };
    };

    const byId = Object.fromEntries(nodes.map((n) => [n.dataset.id, n]));

    for (const [aId, bId] of LINKS) {
      const a = byId[aId];
      const b = byId[bId];
      if (!a || !b) continue;
      const dim = a.classList.contains("is-dim") || b.classList.contains("is-dim");
      const pa = centerOf(a);
      const pb = centerOf(b);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(pa.x));
      line.setAttribute("y1", String(pa.y));
      line.setAttribute("x2", String(pb.x));
      line.setAttribute("y2", String(pb.y));
      line.setAttribute("stroke", dim ? "rgba(124,58,237,0.12)" : "rgba(124,58,237,0.45)");
      line.setAttribute("stroke-width", dim ? "1" : "1.6");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    }
  };

  const selectNode = (node) => {
    nodes.forEach((n) => n.classList.toggle("is-active", n === node));
    setPanel(node.dataset.id || "agent");
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

  /* Layer filter chips */
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

  /* Drag nodes */
  let drag = null;

  const onPointerDown = (e) => {
    const node = e.target.closest(".node");
    if (!node || !nodesRoot.contains(node)) return;
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
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
      tip.textContent = "拖拽中…松开完成排布";
    }
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    const rect = wrap.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const cx = Math.min(90, Math.max(10, x));
    const cy = Math.min(88, Math.max(12, y));
    drag.node.style.setProperty("--x", `${cx}%`);
    drag.node.style.setProperty("--y", `${cy}%`);
    drawLinks();
  };

  const onPointerUp = (e) => {
    if (!drag) return;
    drag.node.classList.remove("is-dragging");
    if (drag.moved) drag.node.dataset.didDrag = "1";
    if (tip) tip.hidden = true;
    drag = null;
    drawLinks();
  };

  wrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", drawLinks);

  /* init */
  const active = nodes.find((n) => n.classList.contains("is-active")) || nodes[0];
  if (active) selectNode(active);
  requestAnimationFrame(drawLinks);
})();
