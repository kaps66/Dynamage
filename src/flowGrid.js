/*
flowGrid.js
Contains nominal velocity field construction (first pass).
*/
import * as obstacle from "./obstacle.js";

export function computeNominalField(opts = {}) {
  const {
    flowGrid, gridCols, gridRows, GRID_SIZE, width, height,
    baseWindSpeed, crosswindVec, vortexStrengthGlobal, turbulenceGlobal, obstacleData, obstacleBounds
  } = opts;

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const cx = (gx + 0.5) * GRID_SIZE;
      const cy = (gy + 0.5) * GRID_SIZE;

      let windFactor = baseWindSpeed / 80;
      let vx = 1.2 * windFactor;
      let vy = (cy < height * 0.5 ? -0.06 : 0.06) * windFactor;
      vx += crosswindVec.x * 0.01;
      vy += crosswindVec.y * 0.01;

      let repX = 0, repY = 0, repWeight = 0;

      const influenceRadius = Math.max(10, Math.round(Math.min(width, height) * 0.06));
      const sx0 = Math.max(0, Math.floor((cx - influenceRadius)));
      const sy0 = Math.max(0, Math.floor((cy - influenceRadius)));
      const sx1 = Math.min(width - 1, Math.ceil(cx + influenceRadius));
      const sy1 = Math.min(height - 1, Math.ceil(cy + influenceRadius));
      const step = 2;

      const od = obstacleData;
      if (od) {
        const d = od.data;
        for (let sy = sy0; sy <= sy1; sy += step) {
          for (let sx = sx0; sx <= sx1; sx += step) {
            const idx = (sy * width + sx) * 4;
            const a = d[idx + 3];
            if (a > 10) {
              const dx = cx - sx;
              const dy = cy - sy;
              const dist = Math.hypot(dx, dy) + 0.001;
              const wBase = Math.max(0, (influenceRadius - dist) / influenceRadius);
              const w = wBase * wBase * (a / 255);
              repX += (dx / dist) * w;
              repY += (dy / dist) * w;
              repWeight += w;
            }
          }
        }
      }

      if (repWeight > 0) {
        repX /= repWeight;
        repY /= repWeight;
        vx += repX * 2.0;
        vy += repY * 2.0;
      }

      if (obstacleBounds) {
        const oCenterX = obstacleBounds.x + obstacleBounds.w * 0.5;
        const oCenterY = obstacleBounds.y + obstacleBounds.h * 0.5;
        const relX = cx - oCenterX;
        const relY = cy - oCenterY;
        
        // PHYSICS ADD: Base flow velocity deficit (Wake region) 
        if (relX > 0 && relX < obstacleBounds.w * 4.0) {
          const wakeFall = Math.exp(-relX / Math.max(1, obstacleBounds.w * 1.5));
          const latFall = Math.exp(-Math.pow(relY / Math.max(1, obstacleBounds.h * 0.5), 2));
          const deficit = 0.6 * wakeFall * latFall;
          vx *= (1 - deficit);
          vy *= (1 - deficit);
        }

        if (cx > oCenterX) {
          const normRelX = relX / Math.max(1, width - oCenterX);
          const swirlStrength = Math.exp(-normRelX * 3) * 1.0 * vortexStrengthGlobal;
          const above = cy < oCenterY ? -1 : 1;
          const phase = Math.sin((cx * 0.06) + (cy * 0.03));
          vx += -above * phase * swirlStrength * 1.2;
          vy += phase * swirlStrength * 1.2;
        }
      }

      const mag = Math.hypot(vx, vy) + 0.0001;
      const speed = Math.max(12, Math.min(600, (baseWindSpeed * 0.8) + Math.min(420, mag * 160)));
      const nx = (vx / mag) * speed;
      const ny = (vy / mag) * speed;

      const idxGrid = (gy * gridCols + gx) * 2;
      flowGrid[idxGrid + 0] = nx;
      flowGrid[idxGrid + 1] = ny;
    }
  }
}
