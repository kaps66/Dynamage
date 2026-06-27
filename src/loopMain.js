/*
Main loop initializer: orchestrates initialization and starts the animation loop.
This file centralizes high-level wiring while specifics live in focused modules.
*/

import { createFlowField, buildFlowField, sampleFlow, setObstacleData, computeDragIndex, resizeFlow, renderObstacleOverlay, tick as tickFlowField } from "./flowField.js";
import { createParticles, initParticles, updateParticles, renderParticles, setParticleParams, resetParticles } from "./particles.js";
import { setupUI, getUIState } from "./ui.js";
import { samplePressure } from "./diagnostics.js";

import { setupRecording } from "./recording.js";
import { setupIntro } from "./intro.js";
import { setupLogoEgg } from "./logoEgg.js";
import { renderBackground } from "./background.js";
import { setupResizer } from "./resize.js";

const canvas = document.getElementById("flowCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

let width = 0;
let height = 0;
let lastTime = performance.now();
let paused = false;

// initialize modules
createFlowField({ canvas, ctx });
createParticles({ canvas, ctx });

// wire UI
setupUI({
  onTogglePause: (p) => (paused = p),
  onExport: () => {
    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "dynamage_export.png";
      a.click();
    } catch (err) {
      console.warn("Export failed", err);
    }
  },
  onExportVideo: () => setupRecording({ canvas, buildFlowField, getUIState, setPaused: (v) => (paused = v) }),
  onReset: () => {
    setObstacleData(null);
    resetParticles();
    computeDragIndex();
  },
  onImageLoad: async (img, opts = {}) => {
    setObstacleData(img, () => {
      initParticles();
      buildFlowField(getUIState());
      computeDragIndex();
    });
  },
  onParamsChange: (params) => {
    setParticleParams(params);
    buildFlowField(params);
  },
});

// handle resize and start loop via helper
setupResizer({
  canvas, ctx,
  onResize: ({ width: w, height: h, dpr }) => {
    width = w; height = h;
    resizeFlow({ width, height });
    initParticles();
  }
});

// small helpers moved into separate modules
setupIntro();
setupLogoEgg();

function awaitPromiseGetObstacleData() {
  try {
    if (typeof window !== "undefined" && window.getObstacleData) return Promise.resolve(window.getObstacleData());
    return import("./obstacle.js").then(m => {
      if (m && typeof m.getObstacleData === "function") return m.getObstacleData();
      return null;
    }).catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  const uiState = getUIState();

  tickFlowField(now / 1000);

  if (!paused) updateParticles(dt, uiState);

  renderBackground(ctx, width, height, uiState);
  renderObstacleOverlay(ctx);

  try {
    if (uiState.debugPressure) {
      const step = 12;
      const Vref = Math.max(1, uiState.baseWindSpeed || 80);
      // Prepare offscreen small canvas for fast pixel ops (optional fallback)
      // Draw pressure heatmap + vorticity-like field + velocity vectors
      // 1) pressure heatmap (dense translucent)
      ctx.save();
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const p = (() => {
            try { return samplePressure(x, y); } catch (e) { return 0; }
          })();
          const cap = Vref * Vref;
          const norm = Math.max(-cap, Math.min(cap, p));
          const t = (norm + cap) / (2 * cap); // 0..1
          // perceptual-ish mapping: blue (low) -> green (mid) -> orange (high)
          const r = Math.round(220 * t + 20 * (1 - t));
          const g = Math.round(200 * (1 - Math.abs(t - 0.5) * 2) + 30);
          const b = Math.round(220 * (1 - t) + 30);
          ctx.fillStyle = `rgba(${r},${g},${b},${0.12})`;
          ctx.fillRect(x - (step / 2), y - (step / 2), step + 0.5, step + 0.5);
        }
      }
      ctx.restore();

      // 2) approximate vorticity-like measure via pressure curl (finite difference on samplePressure)
      // draw as semi-transparent red-yellow overlay (higher curl -> more saturated)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
          const pL = samplePressure(x - step, y);
          const pR = samplePressure(x + step, y);
          const pU = samplePressure(x, y - step);
          const pD = samplePressure(x, y + step);
          // simple curl-ish metric (dP/dy - dP/dx) proxy (not physical vorticity but useful visual cue)
          const dPx = (pR - pL) * 0.5;
          const dPy = (pD - pU) * 0.5;
          const curlApprox = Math.abs(dPy - dPx);
          // normalize roughly by Vref^2
          const normCurl = Math.min(1, curlApprox / (Vref * Vref * 0.25));
          if (normCurl < 0.02) continue;
          const alpha = 0.08 + normCurl * 0.22;
          const rr = Math.round(255 * normCurl);
          const gg = Math.round(140 + 100 * (1 - normCurl));
          ctx.fillStyle = `rgba(${rr},${gg},40,${alpha.toFixed(3)})`;
          const s = Math.max(4, step * 0.9);
          ctx.beginPath();
          ctx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 3) velocity vector field colored by magnitude (stroke)
      try {
        ctx.save();
        ctx.lineWidth = 1.2;
        const vecStep = Math.max(18, Math.round(step * 1.5));
        for (let y = vecStep / 2; y < height; y += vecStep) {
          for (let x = vecStep / 2; x < width; x += vecStep) {
            const f = sampleFlow(x, y);
            const vx = f.x || 0;
            const vy = f.y || 0;
            const mag = Math.hypot(vx, vy) + 1e-6;
            const scale = Math.min(16, mag * 0.03);
            const ex = x + (vx / mag) * scale;
            const ey = y + (vy / mag) * scale;
            // color map for magnitude: small=gray -> medium=blue -> large=red
            const t = Math.min(1, mag / Math.max(1, Vref * 0.9));
            const cr = Math.round(200 * t + 30 * (1 - t));
            const cg = Math.round(80 * (1 - Math.abs(t - 0.5) * 2));
            const cb = Math.round(240 * (1 - t) + 60 * t);
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.96)`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            // arrowhead
            const ang = Math.atan2(ey - y, ex - x);
            const ah = 4;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - Math.cos(ang - 0.45) * ah, ey - Math.sin(ang - 0.45) * ah);
            ctx.lineTo(ex - Math.cos(ang + 0.45) * ah, ey - Math.sin(ang + 0.45) * ah);
            ctx.closePath();
            ctx.fillStyle = `rgba(${cr},${cg},${cb},0.96)`;
            ctx.fill();
          }
        }
        ctx.restore();
      } catch (e) { /* safe fallback if sampleFlow errors */ }

      // 4) compact legend (pressure and vorticity)
      ctx.save();
      const pad = 12;
      const lw = 180, lh = 68;
      const lx = Math.min(width - lw - pad, pad);
      const ly = Math.min(height - lh - pad, pad);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(12,12,12,0.6)";
      ctx.fillRect(lx, ly, lw, lh);
      // Draw a simple pressure gradient bar
      const barW = 120, barH = 10;
      const bx = lx + 12, by = ly + 12;
      for (let i = 0; i <= barW; i++) {
        const t = i / barW;
        const r = Math.round(220 * t + 20 * (1 - t));
        const g = Math.round(200 * (1 - Math.abs(t - 0.5) * 2) + 30);
        const b = Math.round(220 * (1 - t) + 30);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(bx + i, by, 1, barH);
      }
      ctx.fillStyle = "#fff";
      ctx.font = "11px system-ui";
      ctx.fillText("Pressure (low → high)", bx, by + barH + 14);
      // vorticity indicator
      ctx.fillStyle = "#fff";
      ctx.fillText("Curl proxy", bx, by + barH + 32);
      ctx.fillStyle = "rgba(255,120,40,0.95)";
      ctx.fillRect(bx + 72, by + barH + 20, 36, 8);
      // velocity legend
      ctx.fillStyle = "#fff";
      ctx.fillText("Velocity (color by mag)", bx, by + barH + 50);
      ctx.restore();
    }
  } catch (e) {}

  renderParticles(uiState);

  try {
    if (uiState.debugVelocity) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(6,18,24,0.9)";
      ctx.fillStyle = "rgba(6,18,24,0.9)";
      const step = 24;
      for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
          const f = sampleFlow(x, y);
          const vx = f.x || 0;
          const vy = f.y || 0;
          const mag = Math.hypot(vx, vy) + 1e-6;
          const scale = Math.min(10, mag * 0.03);
          const ex = x + (vx / mag) * scale;
          const ey = y + (vy / mag) * scale;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          const ang = Math.atan2(ey - y, ex - x);
          const ah = 4;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex - Math.cos(ang - 0.4) * ah, ey - Math.sin(ang - 0.4) * ah);
          ctx.lineTo(ex - Math.cos(ang + 0.4) * ah, ey - Math.sin(ang + 0.4) * ah);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }
  } catch (e) {}

  try {
    const m = window.lastDynamageMetrics || null;
    if (m && (uiState.debugForces || uiState.debugCP || uiState.debugVorticity)) {
      const cgx = m.CGx || (width * 0.5);
      const cgy = m.CGy || (height * 0.5);
      ctx.save();
      ctx.lineWidth = 3;
      if (uiState.debugForces) {
        const fx = (m.C_D || 0) * 250;
        const fy = (m.C_L || 0) * 250;
        ctx.strokeStyle = "rgba(220,80,80,0.95)";
        ctx.fillStyle = "rgba(220,80,80,0.95)";
        ctx.beginPath();
        ctx.moveTo(cgx, cgy);
        ctx.lineTo(cgx + fx, cgy - fy);
        ctx.stroke();
        const ang = Math.atan2(-fy, fx);
        const ah = 10;
        ctx.beginPath();
        ctx.moveTo(cgx + fx, cgy - fy);
        ctx.lineTo(cgx + fx - Math.cos(ang - 0.3) * ah, cgy - fy - Math.sin(ang - 0.3) * ah);
        ctx.lineTo(cgx + fx - Math.cos(ang + 0.3) * ah, cgy - fy - Math.sin(ang + 0.3) * ah);
        ctx.closePath();
        ctx.fill();
        ctx.font = "12px system-ui";
        ctx.fillStyle = "rgba(20,20,20,0.9)";
        ctx.fillText(`Drag:${m.C_D.toFixed(3)} Lift:${m.C_L.toFixed(3)}`, cgx + fx + 8, cgy - fy - 6);
      }

      if (uiState.debugCP) {
        ctx.strokeStyle = "rgba(30,140,220,0.95)";
        ctx.fillStyle = "rgba(30,140,220,0.95)";
        ctx.lineWidth = 2;
        const cpX = m.CPx || (cgx + 30);
        const cpY = m.CPy || (cgy);
        ctx.beginPath();
        ctx.arc(cpX, cpY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = "12px system-ui";
        ctx.fillStyle = "rgba(30,30,30,0.95)";
        ctx.fillText(`CP (${Math.round(cpX)},${Math.round(cpY)})`, cpX + 8, cpY - 8);
        ctx.strokeStyle = "rgba(30,140,220,0.5)";
        ctx.setLineDash([6,4]);
        ctx.beginPath();
        ctx.moveTo(cgx, cgy);
        ctx.lineTo(cpX, cpY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (uiState.debugVorticity) {
        ctx.fillStyle = "rgba(10,10,10,0.6)";
        ctx.fillRect(12, height - 84, 220, 72);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = "12px system-ui";
        ctx.fillText(`Vorticity quick summary`, 20, height - 64);
        ctx.fillText(`Obstacle area: ${m.obstacleArea}`, 20, height - 46);
        ctx.fillText(`Yaw moment: ${Math.round(m.Mz)}`, 20, height - 28);
        ctx.fillText(`Strouhal hint not available in this overlay`, 20, height - 10);
      }

      ctx.restore();
    }
  } catch (e) {}

  try {
    if (getUIState().debugBounds) {
      awaitPromiseGetObstacleData().then(ff => {
        if (ff && ff.obstacleBounds) {
          ctx.save();
          ctx.strokeStyle = "rgba(200,40,40,0.9)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6,4]);
          const b = ff.obstacleBounds;
          ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
          ctx.restore();
        }
      }).catch(() => {});
    }
  } catch (e) {}

  computeDragIndex();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);


