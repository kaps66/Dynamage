/*
Particle system module: manages particle creation, update and draw.
Exports:
 - createParticles({canvas,ctx})
 - initParticles(count?)
 - updateParticles(dt, uiState)
 - renderParticles(uiState)
 - setParticleParams(params)
 - resetParticles()
*/

let canvas, ctx;
let particles = [];
let width = 0, height = 0;
let particleCount = 900;
let turbulence = 0.18;
let gustsEnabled = false;
let colorMode = "mono";

import { getObstacleData, sampleFlow, samplePressure } from "./flowField.js";

export function createParticles({ canvas: c, ctx: ct }) {
  canvas = c;
  ctx = ct;
}

export function setParticleParams(params = {}) {
  if (params.particleCount !== undefined) particleCount = params.particleCount;
  if (params.turbulence !== undefined) turbulence = params.turbulence;
  if (params.gustsEnabled !== undefined) gustsEnabled = params.gustsEnabled;
  if (params.colorMode !== undefined) colorMode = params.colorMode;
}

export function initParticles(count = particleCount) {
  particles.length = 0;
  particleCount = count;
  width = canvas.clientWidth || window.innerWidth;
  height = canvas.clientHeight || window.innerHeight;
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      age: Math.random() * 4,
    });
  }
}

export function resetParticles() {
  initParticles();
}

import { isSolidAt } from "./flowSolver.js";

/* reset a particle to a fresh off-screen position */
function resetParticle(p) {
  p.x = -10 - Math.random() * 40;
  p.y = Math.random() * height;
  p.vx = 0;
  p.vy = 0;
  p.age = 0;
}

function sampleAlphaGradientLocal(x, y) {
  const od = getObstacleData().obstacleData;
  if (!od) return { gx: 0, gy: 0 };
  const iw = od.width;
  const ix = Math.max(1, Math.min(iw - 2, Math.round(x)));
  const iy = Math.max(1, Math.min(od.height - 2, Math.round(y)));
  const idx = (iy * iw + ix) * 4;

  const idxL = (iy * iw + (ix - 1)) * 4;
  const idxR = (iy * iw + (ix + 1)) * 4;
  const idxU = ((iy - 1) * iw + ix) * 4;
  const idxD = ((iy + 1) * iw + ix) * 4;

  const aL = od.data[idxL + 3] / 255;
  const aR = od.data[idxR + 3] / 255;
  const aU = od.data[idxU + 3] / 255;
  const aD = od.data[idxD + 3] / 255;

  const gx = (aL - aR) * 0.5;
  const gy = (aU - aD) * 0.5;
  const len = Math.hypot(gx, gy) + 1e-6;
  return { gx: gx / len, gy: gy / len };
}

export function updateParticles(dt, uiState = {}) {
  // sync parameters if provided
  if (uiState.turbulence !== undefined) turbulence = uiState.turbulence;
  if (uiState.gustsEnabled !== undefined) gustsEnabled = uiState.gustsEnabled;
  if (uiState.particleCount !== undefined && uiState.particleCount !== particleCount) {
    initParticles(uiState.particleCount);
  }
  if (uiState.colorMode !== undefined) colorMode = uiState.colorMode;

  width = canvas.clientWidth || window.innerWidth;
  height = canvas.clientHeight || window.innerHeight;

  const flowSample = sampleFlow;

  for (const p of particles) {
    const f = flowSample(p.x, p.y);

    const blend = 0.12;
    p.vx += (f.x - p.vx) * blend;
    p.vy += (f.y - p.vy) * blend;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const turbScale = 6 * (0.2 + turbulence);
    p.vx += (Math.random() - 0.5) * turbScale * dt;
    p.vy += (Math.random() - 0.5) * turbScale * dt;

    if (gustsEnabled && Math.random() < 0.003) {
      const gustStrength = 200 + Math.random() * 260;
      p.vx += gustStrength * (0.6 + Math.random() * 0.9);
      p.vy += (Math.random() - 0.5) * gustStrength * 0.2;
    }

    if (p.x > width + 20 || p.y < -40 || p.y > height + 40) {
      p.x = -10 - Math.random() * 40;
      p.y = Math.random() * height;
      p.vx = 0;
      p.vy = 0;
    }

    // If particle ended up inside the solid silhouette, resolve collision with improved physics
    if (isSolidAt(p.x, p.y)) {
      // sample a more robust normal by averaging alpha-gradient normals in a small neighborhood
      let nx = 0, ny = 0;
      const sampleRadius = 2;
      let samples = 0;
      for (let oy = -sampleRadius; oy <= sampleRadius; oy++) {
        for (let ox = -sampleRadius; ox <= sampleRadius; ox++) {
          const sx = p.x + ox;
          const sy = p.y + oy;
          if (isSolidAt(sx, sy)) continue; // prefer fluid-side neighbors
          const g = sampleAlphaGradientLocal(sx, sy);
          if (!g || (!g.gx && !g.gy)) continue;
          nx += g.gx;
          ny += g.gy;
          samples++;
        }
      }
      if (samples === 0) {
        // fallback to local gradient at current position
        const g = sampleAlphaGradientLocal(p.x, p.y);
        nx = g.gx || 1; ny = g.gy || 0;
      } else {
        nx /= samples; ny /= samples;
      }

      // normalize normal and ensure it's pointing outwards
      const nlen = Math.hypot(nx, ny) + 1e-6;
      nx /= nlen; ny /= nlen;

      // compute penetration depth by marching along normal until outside solid (cap steps)
      let pen = 0;
      const maxPen = 12;
      for (let s = 0; s <= maxPen; s++) {
        const tx = p.x + nx * s;
        const ty = p.y + ny * s;
        if (!isSolidAt(tx, ty)) { pen = s; break; }
      }
      // if still inside after maxPen, push out by maxPen
      if (pen === 0) pen = maxPen;

      // Move particle out by penetration + a small safety distance
      const pushOut = Math.min(maxPen, pen + 1);
      p.x += nx * pushOut;
      p.y += ny * pushOut;

      // Reflect velocity about normal but with restitution < 1 and apply friction on tangential component
      const restitution = 0.48; // bounce energy retained
      const friction = 0.58; // tangential damping
      const vdotn = p.vx * nx + p.vy * ny;
      // normal component
      let vnx = vdotn * nx;
      let vny = vdotn * ny;
      // tangential component
      let vtx = p.vx - vnx;
      let vty = p.vy - vny;

      // invert normal with restitution
      vnx = -vnx * restitution;
      vny = -vny * restitution;
      // reduce tangential with friction and small random smear so particles don't lock
      const smear = 0.02 * (Math.random() - 0.5);
      vtx *= friction;
      vty *= friction;
      vtx += (-ny) * smear;
      vty += (nx) * smear;

      p.vx = vnx + vtx;
      p.vy = vny + vty;

      // small age bump to alter rendering subtly and avoid immediate repeat collisions
      p.age += 0.12;

      // prevent extremely small velocities from causing jitter; if near rest, nudge along tangent
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 4) {
        const tangX = -ny, tangY = nx;
        p.vx += tangX * (1 + Math.random() * 2);
        p.vy += tangY * (Math.random() - 0.5) * 1.2;
      }

      // continue simulation for this particle (now safely outside)
      continue;
    }
  }
}

export function renderParticles(uiState = {}) {
  ctx.save();
  ctx.globalAlpha = 0.95;
  // color/pressure visualization: adjust stroke per-particle based on local pressure (pressure proxy)
  const flowSample = sampleFlow;
  const pressureSample = samplePressure;
  ctx.lineCap = "round";

  for (const p of particles) {
    const speed = Math.hypot(p.vx, p.vy);
    // make streaks thinner for higher speed (clamped) — slimmer default and gentler scaling
    ctx.lineWidth = Math.max(0.6, Math.min(3, 0.6 + speed * 0.01));

    const len = Math.min(20, 3 + speed * 0.06);
    const px = p.x;
    const py = p.y;
    const nx = px - (p.vx / (speed + 1e-6)) * len;
    const ny = py - (p.vy / (speed + 1e-6)) * len;

    // sample pressure for base mapping
    let pVal = 0;
    try {
      pVal = pressureSample(px, py);
    } catch (e) { pVal = 0; }
    const Vref = Math.max(1, uiState.baseWindSpeed || 80);
    const norm = Math.max(-Vref * Vref, Math.min(Vref * Vref, pVal));
    const tPressure = (norm + Vref * Vref) / (2 * Vref * Vref); // 0..1

    // sample local flow direction to compute angle delta
    const f = flowSample(px, py);
    const fx = f.x || 0;
    const fy = f.y || 0;
    const fmag = Math.hypot(fx, fy) + 1e-6;
    const fvux = fx / fmag, fvuy = fy / fmag;

    const pmag = Math.hypot(p.vx, p.vy) + 1e-6;
    const pvux = p.vx / pmag, pvuy = p.vy / pmag;

    // angle delta in radians between particle velocity and sampled flow (0..PI)
    const dot = Math.max(-1, Math.min(1, pvux * fvux + pvuy * fvuy));
    const angleDelta = Math.acos(dot); // 0 = aligned, PI = opposite
    const angleT = angleDelta / Math.PI; // 0..1

    // Build gradient color based on angle delta and pressure:
    // - angleT near 0 -> use pressure-derived hue (warm/cool)
    // - angleT near 1 -> shift toward complementary / saturated accent to highlight strong deviations
    function lerp(a, b, w) { return a + (b - a) * w; }

    // base color from pressure (cold->blue, hot->orange)
    let baseR = 20 + Math.round(200 * tPressure);
    let baseG = 20 + Math.round(160 * (1 - tPressure));
    let baseB = 30 + Math.round(120 * (1 - tPressure));

    // accent color for large angle deltas (magenta-ish)
    const accR = 220, accG = 60, accB = 160;

    // mix base and accent by angleT, and also modulate alpha slightly by angle
    const r = Math.round(lerp(baseR, accR, angleT));
    const g = Math.round(lerp(baseG, accG, angleT));
    const b = Math.round(lerp(baseB, accB, angleT));
    const alpha = lerp(0.12, 0.26, Math.min(1, angleT * 1.2 + Math.abs(tPressure - 0.5) * 0.4));

    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;

    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  ctx.restore();

  // also render obstacle overlay from flowField module for cohesion (no-op visual placeholder)
  const flow = getObstacleData();
  if (flow) {
    const { obstacleData, obstacleBounds } = flow;
    if (obstacleData && obstacleBounds) {
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.restore();
    }
  }
}

