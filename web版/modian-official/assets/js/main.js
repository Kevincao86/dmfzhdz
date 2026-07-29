(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Year */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Header scroll state */
  const header = document.getElementById("site-header");
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Magical cursor: core + dual orbit + particle trail */
  const cursorFx = document.getElementById("cursor-fx");
  const trailCanvas = document.getElementById("cursor-trail");
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  if (cursorFx && trailCanvas instanceof HTMLCanvasElement && !reduceMotion && finePointer) {
    document.body.classList.add("has-magic-cursor");
    cursorFx.classList.add("on");
    trailCanvas.classList.add("on");

    const tctx = trailCanvas.getContext("2d");
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let tx = cx;
    let ty = cy;
    let vx = 0;
    let vy = 0;
    let particles = [];
    let lastEmit = 0;
    let dpr = 1;

    const resizeTrail = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      trailCanvas.width = Math.floor(window.innerWidth * dpr);
      trailCanvas.height = Math.floor(window.innerHeight * dpr);
      trailCanvas.style.width = `${window.innerWidth}px`;
      trailCanvas.style.height = `${window.innerHeight}px`;
      if (tctx) tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeTrail();
    window.addEventListener("resize", resizeTrail);

    const spawn = (x, y, burst = false) => {
      const n = burst ? 10 : 1;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = burst ? 1.2 + Math.random() * 2.4 : 0.2 + Math.random() * 0.7;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (burst ? 0.4 : 0),
          life: 1,
          decay: burst ? 0.018 + Math.random() * 0.02 : 0.012 + Math.random() * 0.016,
          size: burst ? 1.6 + Math.random() * 2.4 : 1 + Math.random() * 1.8,
          hue: Math.random() > 0.45 ? "teal" : "ice",
        });
      }
      if (particles.length > 160) particles = particles.slice(-160);
    };

    window.addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
        const now = performance.now();
        const speed = Math.hypot(e.movementX || 0, e.movementY || 0);
        if (now - lastEmit > (speed > 8 ? 12 : 28)) {
          spawn(tx, ty, false);
          lastEmit = now;
        }
      },
      { passive: true }
    );

    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      cursorFx.classList.add("clicking");
      spawn(e.clientX, e.clientY, true);
      const ripple = document.createElement("div");
      ripple.className = "cursor-ripple";
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    });

    window.addEventListener("pointerup", () => cursorFx.classList.remove("clicking"));
    document.addEventListener("mouseleave", () => cursorFx.classList.remove("on"));
    document.addEventListener("mouseenter", () => cursorFx.classList.add("on"));

    document.querySelectorAll("a, button, .cap, input, select, textarea, .header-cta, .btn").forEach((el) => {
      el.addEventListener("pointerenter", () => cursorFx.classList.add("hot"));
      el.addEventListener("pointerleave", () => cursorFx.classList.remove("hot"));
    });

    const tickCursor = () => {
      const dx = tx - cx;
      const dy = ty - cy;
      vx += dx * 0.22;
      vy += dy * 0.22;
      vx *= 0.72;
      vy *= 0.72;
      cx += vx;
      cy += vy;

      cursorFx.style.left = `${cx}px`;
      cursorFx.style.top = `${cy}px`;

      if (tctx) {
        tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= p.decay;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          const alpha = Math.max(0, p.life);
          tctx.beginPath();
          tctx.fillStyle =
            p.hue === "ice"
              ? `rgba(154, 212, 255, ${alpha * 0.85})`
              : `rgba(61, 255, 213, ${alpha})`;
          tctx.shadowColor = p.hue === "ice" ? "rgba(154, 212, 255, 0.8)" : "rgba(61, 255, 213, 0.9)";
          tctx.shadowBlur = 8;
          tctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          tctx.fill();
        }
        tctx.shadowBlur = 0;
      }

      requestAnimationFrame(tickCursor);
    };
    requestAnimationFrame(tickCursor);
  }

  /* Reveal on scroll */
  const revealEls = document.querySelectorAll(".reveal, .signal-board");
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
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* Count-up */
  const counters = document.querySelectorAll("[data-count]");
  const animateCount = (el) => {
    const target = Number(el.getAttribute("data-count") || 0);
    const suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) {
      el.textContent = `${target}${suffix}`;
      return;
    }
    const duration = 1100;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${Math.round(target * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ("IntersectionObserver" in window) {
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => cio.observe(el));
  } else {
    counters.forEach(animateCount);
  }

  /* Contact form → mailto draft */
  const form = document.getElementById("contact-form");
  const note = document.getElementById("form-note");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const company = String(data.get("company") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const need = String(data.get("need") || "").trim();
      const message = String(data.get("message") || "").trim();

      if (!name || !company || !phone || !need) {
        if (note) {
          note.classList.add("error");
          note.textContent = "请完整填写姓名、公司、联系方式与需求方向。";
        }
        return;
      }

      const subject = encodeURIComponent(`【墨典官网咨询】${need} · ${company}`);
      const body = encodeURIComponent(
        [
          `姓名：${name}`,
          `公司：${company}`,
          `联系方式：${phone}`,
          `需求方向：${need}`,
          "",
          "简要描述：",
          message || "（未填写）",
          "",
          "—— 来自墨典官网咨询表单",
        ].join("\n")
      );

      if (note) {
        note.classList.remove("error");
        note.textContent = "已打开邮件草稿，发送后我们会尽快与您联系。";
      }

      window.location.href = `mailto:hello@modian.ai?subject=${subject}&body=${body}`;
    });
  }

  /* Hero neural mesh canvas */
  const canvas = document.getElementById("hero-canvas");
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let nodes = [];
  let mouse = { x: 0.62, y: 0.38 };
  let raf = 0;
  let t0 = performance.now();

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.floor((w * h) / 14000);
    nodes = Array.from({ length: Math.max(42, Math.min(count, 110)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: 1.1 + Math.random() * 1.6,
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

    /* soft grid */
    ctx.save();
    ctx.strokeStyle = "rgba(61, 255, 213, 0.045)";
    ctx.lineWidth = 1;
    const gap = 56;
    const ox = (t * 8) % gap;
    const oy = (t * 5) % gap;
    for (let x = -gap + ox; x < w + gap; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -gap + oy; y < h + gap; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    /* orbit ring near brand focal */
    const cx = w * 0.68;
    const cy = h * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.15);
    ctx.strokeStyle = "rgba(61, 255, 213, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(w, h) * 0.22, Math.min(w, h) * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(-t * 0.35);
    ctx.strokeStyle = "rgba(154, 212, 255, 0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(w, h) * 0.16, Math.min(w, h) * 0.28, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const mx = mouse.x * w;
    const my = mouse.y * h;

    for (const n of nodes) {
      if (!reduceMotion) {
        n.x += n.vx;
        n.y += n.vy;
        const dx = mx - n.x;
        const dy = my - n.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 180) {
          n.vx += (dx / dist) * 0.012;
          n.vy += (dy / dist) * 0.012;
        }
        n.vx *= 0.992;
        n.vy *= 0.992;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      }
    }

    const linkDist = Math.min(150, w * 0.14);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          const alpha = (1 - d / linkDist) * 0.35;
          ctx.strokeStyle = `rgba(61, 255, 213, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      const glow = Math.hypot(n.x - mx, n.y - my) < 120;
      ctx.fillStyle = glow ? "rgba(61, 255, 213, 0.95)" : "rgba(232, 238, 246, 0.55)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* mouse focal */
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 160);
    g.addColorStop(0, "rgba(61, 255, 213, 0.12)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, 160, 0, Math.PI * 2);
    ctx.fill();

    raf = requestAnimationFrame(draw);
  };

  if (!reduceMotion) {
    raf = requestAnimationFrame(draw);
  } else {
    draw(performance.now());
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (!reduceMotion) {
      t0 = performance.now();
      raf = requestAnimationFrame(draw);
    }
  });
})();
