// Inside sampleFlow() in src/flowSolver.js
// Find the "vortex shedding injection" block and replace the injectScale definition:

  // --- vortex shedding injection (Kármán-like alternating vortices) ---
  if (oBounds) {
    const oCenterX = oBounds.x + oBounds.w * 0.5;
    const oCenterY = oBounds.y + oBounds.h * 0.5;
    const relX = x - oCenterX;
    const relY = y - oCenterY;
    const wakeWidth = Math.max(24, oBounds.h * 0.9);
    const wakeExtent = Math.max(80, oBounds.w * 4.0);

    if (relX > 0 && relX < wakeExtent && Math.abs(relY) < oBounds.h * 1.6) {
      const f = Math.max(0, strouhal);
      const convectedPhase = relX * 0.08;
      const phase = Math.sin(2.0 * Math.PI * f * _time - convectedPhase);
      const sign = phase;
      const downFall = Math.exp(-relX / (oBounds.w * 1.2));
      const latFall = Math.exp(-Math.abs(relY) / (wakeWidth * 0.9));
      const baseShear = vortexStrengthGlobal * 1.05;
      const shear = baseShear * downFall * latFall;

      const mag = Math.hypot(vx, vy) + 1e-6;
      const ux = vx / mag, uy = vy / mag;
      const ox = -uy, oy = ux;

      const localOmega = 0;
      const omegaBoost = 1 + Math.min(3, Math.abs(localOmega) * 10);

      // PHYSICS FIX: Scale injection by local magnitude 'mag' instead of hardcoded 80
      const injectScale = 0.35 * mag * shear * 0.8 * omegaBoost; 
      vx += ox * injectScale * sign * 0.9;
      vy += oy * injectScale * sign * 0.9;

      const wakeCore = Math.exp(-Math.pow(relY / Math.max(1, oBounds.h * 0.45), 2)) * downFall;
      const energyLoss = 1 - Math.min(0.65, 0.18 * shear * (1 + turbulenceGlobal));
      vx *= (1 - wakeCore * (1 - energyLoss));
      vy *= (1 - wakeCore * (1 - energyLoss));
    }
  }
