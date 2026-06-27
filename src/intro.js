/*
Intro banner behavior extracted for clarity.
Exports setupIntro()
*/
export function setupIntro() {
  const banner = document.getElementById("introBanner");
  if (!banner) return;
  try {
    const dismissed = localStorage.getItem("dynamageIntroDismissed");
    if (dismissed === "1") {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      return;
    }
  } catch (e) {}

  banner.style.touchAction = "none";
  banner.style.transition = "transform 320ms cubic-bezier(.2,.9,.2,1), opacity 320ms ease";

  let startX = 0, startY = 0, curX = 0, curY = 0;
  let dragging = false;
  let startTime = 0;
  let lastMoveTime = 0;
  let lastMoveX = 0;
  let pointerId = null;
  const threshold = 80;
  const velocityThreshold = 0.6;
  const activeClass = "intro-dragging";

  function setTransform(x, y, scale = 1, op = 1) {
    banner.style.transform = `translateX(${x}px) translateY(${y}px) scale(${scale})`;
    banner.style.opacity = String(op);
  }

  function getEventPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function startDrag(e) {
    const p = getEventPoint(e);
    startX = p.x;
    startY = p.y;
    curX = 0; curY = 0;
    dragging = true;
    startTime = performance.now();
    lastMoveTime = startTime;
    lastMoveX = startX;
    banner.classList.add(activeClass);
    banner.style.transition = "none";
    if (e.pointerId) {
      pointerId = e.pointerId;
      try { banner.setPointerCapture(pointerId); } catch (err) {}
    }
  }

  function moveDrag(e) {
    if (!dragging) return;
    const p = getEventPoint(e);
    curX = p.x - startX;
    curY = p.y - startY;
    const dampY = Math.max(-40, Math.min(40, curY * 0.6));
    const dampX = curX;
    const rot = Math.max(-8, Math.min(8, dampX * 0.02));
    const opacity = Math.max(0.25, 1 - Math.abs(dampX) / 420);
    setTransform(dampX, dampY, 1, opacity);
    banner.style.rotate = `${rot}deg`;
    const now = performance.now();
    lastMoveTime = now;
    lastMoveX = p.x;
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    banner.classList.remove(activeClass);
    banner.style.transition = "transform 320ms cubic-bezier(.2,.9,.2,1), opacity 240ms ease";
    const now = performance.now();
    const dt = Math.max(1, now - startTime);
    const avgVel = (curX) / dt;
    const shortDt = Math.max(1, now - lastMoveTime);
    const shortVel = (getEventPoint(e).x - lastMoveX) / shortDt;
    const effectiveVel = Math.abs(shortVel) > 0 ? shortVel : avgVel;
    if (Math.abs(curX) > threshold || Math.abs(effectiveVel) > velocityThreshold) {
      const dir = (curX > 0 || effectiveVel > 0) ? 1 : -1;
      setTransform(dir * (window.innerWidth + 160), curY * 0.4, 1, 0);
      banner.addEventListener("transitionend", () => {
        try { localStorage.setItem("dynamageIntroDismissed", "1"); } catch (e) {}
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      }, { once: true });
    } else {
      setTransform(0, 0, 1, 1);
      banner.style.rotate = `0deg`;
      scheduleAutoSlide();
    }
    if (pointerId !== null) {
      try { banner.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
    }
  }

  function cancelDrag() {
    if (!dragging) return;
    dragging = false;
    banner.classList.remove(activeClass);
    banner.style.transition = "transform 220ms ease, opacity 220ms ease";
    setTransform(0, 0, 1, 1);
    banner.style.rotate = `0deg`;
    if (pointerId !== null) {
      try { banner.releasePointerCapture(pointerId); } catch (err) {}
      pointerId = null;
    }
    scheduleAutoSlide();
  }

  banner.addEventListener("pointerdown", (e) => { startDrag(e); }, { passive: true });
  banner.addEventListener("pointermove", (e) => { moveDrag(e); }, { passive: true });
  banner.addEventListener("pointerup", (e) => { endDrag(e); }, { passive: true });
  banner.addEventListener("pointercancel", cancelDrag, { passive: true });
  banner.addEventListener("touchstart", (e) => { startDrag(e); }, { passive: true });
  window.addEventListener("touchmove", (e) => { moveDrag(e); }, { passive: true });
  window.addEventListener("touchend", (e) => { endDrag(e); }, { passive: true });
  window.addEventListener("touchcancel", cancelDrag, { passive: true });
  banner.addEventListener("mousedown", (e) => { startDrag(e); });
  window.addEventListener("mousemove", (e) => { moveDrag(e); });
  window.addEventListener("mouseup", (e) => { endDrag(e); });

  let autoTimer = null;
  function scheduleAutoSlide() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      banner.style.transition = "transform 520ms cubic-bezier(.2,.9,.2,1), opacity 420ms ease";
      setTransform(0, -48, 0.985, 0);
      banner.addEventListener("transitionend", () => {
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      }, { once: true });
    }, 3500);
  }

  const closeBtn = banner.querySelector(".intro-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    }, { passive: true });
  }

  scheduleAutoSlide();
}

