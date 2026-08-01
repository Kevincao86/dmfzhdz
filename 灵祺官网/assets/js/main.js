(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const topbar = document.getElementById("topbar");
  const onScroll = () => {
    if (!topbar) return;
    topbar.classList.toggle("is-scrolled", window.scrollY > 20);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Contact → shared official API, tagged as 灵祺官网 */
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

  /* Hero orb: constellation + rings (light tech) */
  const canvas = document.getElementById("orb-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let nodes = [];
  let raf = 0;
  let t0 = performance.now();
  let mouse = { x: 0.55, y: 0.45 };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor((w * h) / 9000);
    nodes = Array.from({ length: Math.max(28, Math.min(count, 70)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 1.2 + Math.random() * 1.8,
    }));
  };

  resize();
  window.addEventListener("resize", resize);

  canvas.addEventListener(
    "pointermove",
    (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      mouse.y = (e.clientY - rect.top) / Math.max(rect.height, 1);
    },
    { passive: true }
  );

  const draw = (now) => {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.52;
    const cy = h * 0.48;
    const R = Math.min(w, h) * 0.28;

    const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.6);
    glow.addColorStop(0, "rgba(167, 139, 250, 0.35)");
    glow.addColorStop(0.45, "rgba(103, 232, 249, 0.12)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 3; i++) {
      ctx.rotate(t * (0.12 + i * 0.04) * (i % 2 ? -1 : 1));
      ctx.strokeStyle = `rgba(124, 58, 237, ${0.18 - i * 0.04})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * (1.05 + i * 0.22), R * (0.55 + i * 0.12), i * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const core = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.2, 0, cx, cy, R);
    core.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    core.addColorStop(0.35, "rgba(196, 181, 253, 0.75)");
    core.addColorStop(1, "rgba(124, 58, 237, 0.35)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const mx = mouse.x * w;
    const my = mouse.y * h;

    if (!reduceMotion) {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        const dx = mx - n.x;
        const dy = my - n.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 140) {
          n.vx += (dx / dist) * 0.01;
          n.vy += (dy / dist) * 0.01;
        }
        n.vx *= 0.99;
        n.vy *= 0.99;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      }
    }

    const linkDist = Math.min(120, w * 0.16);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < linkDist) {
          const alpha = (1 - d / linkDist) * 0.45;
          ctx.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      const hot = Math.hypot(n.x - mx, n.y - my) < 100;
      ctx.fillStyle = hot ? "rgba(103, 232, 249, 0.95)" : "rgba(124, 58, 237, 0.65)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(draw);
  };

  if (!reduceMotion) {
    raf = requestAnimationFrame(draw);
  } else {
    draw(performance.now());
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduceMotion) {
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
    }
  });
})();
