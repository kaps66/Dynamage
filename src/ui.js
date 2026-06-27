/*
UI module: wires DOM controls and emits callbacks for image import and parameter changes.
Exports:
 - setupUI(callbacks)
 - getUIState()
*/

import { samplePressure, sampleFlow } from "./flowField.js";

let uiState = {
  baseWindSpeed: 80,
  turbulence: 0.18,
  vortexStrength: 0.9,
  gustsEnabled: false,
  particleCount: 900,
  colorMode: "mono",
  backgroundColor: "#f4f3ef",
  // smoothImage removed; smoothing is simulated automatically in obstacle processing
};

export function getUIState() {
  return { ...uiState };
}

export function setupUI({ onTogglePause, onExport, onReset, onImageLoad, onParamsChange, onFlowShapingToggle, onExportVideo }) {
  const fileInput = document.getElementById("imageInput");
  const smoothCheckbox = document.getElementById("smoothImage");
  const dragLabel = document.getElementById("dragLabel");
  const exportVideoBtn = document.getElementById("exportVideoBtn");

  const togSettings = document.getElementById("togSettings");
  const settingsPanel = document.getElementById("settingsPanel");
  const windSpeedInput = document.getElementById("windSpeed");
  const windVal = document.getElementById("windVal");
  const turbInput = document.getElementById("turbulence");
  const turbVal = document.getElementById("turbVal");
  const vortexInput = document.getElementById("vortex");
  const vortexVal = document.getElementById("vortexVal");
  const gustToggle = document.getElementById("gustToggle");
  const particleCountInput = document.getElementById("particleCount");
  const particleCountVal = document.getElementById("particleCountVal");
  const colorModeSelect = document.getElementById("colorMode");
  const bgColorInput = document.getElementById("bgColor");
  const crosswindMag = document.getElementById("crosswindMag");
  const crosswindMagVal = document.getElementById("crosswindMagVal");
  const crosswindAngle = document.getElementById("crosswindAngle");
  const crosswindAngleVal = document.getElementById("crosswindAngleVal");
  const pauseBtn = document.getElementById("pauseBtn");
  const exportBtn = document.getElementById("exportBtn");
  const resetBtn = document.getElementById("resetBtn");

  // --- Debug controls injection (pressure / velocity overlays) ---
  // create a debug section inside the settings panel for runtime visualization toggles
  if (settingsPanel && !document.getElementById("debugControls")) {
    const row = document.createElement("div");
    row.className = "row";
    row.id = "debugControls";
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <strong id="debugToggleBtn" style="font-size:12px; cursor:pointer">Debug overlays</strong>
        <small style="font-size:11px;color:rgba(0,0,0,0.45)">tap to center info</small>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgPressure" /> Pressure
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgVelocity" /> Velocity
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgBounds" /> Bounds
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgForces" /> Forces (Drag/Lift)
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgCP" /> Center of Pressure
        </label>
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dbgVorticity" /> Vorticity
        </label>
      </div>
    `;
    // place before control row for visibility
    const ctrlRow = settingsPanel.querySelector(".ctrl-row");
    if (ctrlRow) settingsPanel.insertBefore(row, ctrlRow);
    else settingsPanel.appendChild(row);
  }

  const dbgPressure = document.getElementById("dbgPressure");
  const dbgVelocity = document.getElementById("dbgVelocity");
  const dbgBounds = document.getElementById("dbgBounds");
  const dbgForces = document.getElementById("dbgForces");
  const dbgCP = document.getElementById("dbgCP");
  const dbgVorticity = document.getElementById("dbgVorticity");

  // Create centered debug overlay (hidden by default)
  let debugOverlay = document.getElementById("debugOverlay");
  if (!debugOverlay) {
    debugOverlay = document.createElement("div");
    debugOverlay.id = "debugOverlay";
    debugOverlay.style.display = "none";
    debugOverlay.style.position = "fixed";
    debugOverlay.style.left = "50%";
    debugOverlay.style.top = "50%";
    debugOverlay.style.transform = "translate(-50%, -50%)";
    debugOverlay.style.zIndex = "9999";
    debugOverlay.style.maxWidth = "86vw";
    debugOverlay.style.maxHeight = "70vh";
    debugOverlay.style.overflow = "auto";
    debugOverlay.style.padding = "14px";
    debugOverlay.style.borderRadius = "12px";
    debugOverlay.style.background = "rgba(12,14,18,0.9)";
    debugOverlay.style.color = "#fff";
    debugOverlay.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto";
    debugOverlay.style.boxShadow = "0 18px 48px rgba(0,0,0,0.6)";
    debugOverlay.style.backdropFilter = "blur(6px)";
    debugOverlay.innerHTML = `<div id="debugOverlayContent" style="font-size:13px;line-height:1.3"></div>
                              <div style="text-align:right;margin-top:8px"><button id="debugOverlayClose" style="padding:8px 10px;border-radius:8px;border:none;background:#222;color:#fff;cursor:pointer">Close</button></div>`;
    document.body.appendChild(debugOverlay);
    const closeBtn = debugOverlay.querySelector("#debugOverlayClose");
    closeBtn?.addEventListener("click", () => { debugOverlay.style.display = "none"; });
  }

  // Toggle when the header label is clicked: populate with latest metrics and active debug toggles
  const debugToggleBtn = document.getElementById("debugToggleBtn");
  if (debugToggleBtn) {
    debugToggleBtn.addEventListener("click", () => {
      const contentEl = document.getElementById("debugOverlayContent");
      const metrics = (window.lastDynamageMetrics) ? window.lastDynamageMetrics : null;
      const active = [];
      if (dbgPressure && dbgPressure.checked) active.push("Pressure");
      if (dbgVelocity && dbgVelocity.checked) active.push("Velocity");
      if (dbgBounds && dbgBounds.checked) active.push("Bounds");
      if (dbgForces && dbgForces.checked) active.push("Forces");
      if (dbgCP && dbgCP.checked) active.push("Center of Pressure");
      if (dbgVorticity && dbgVorticity.checked) active.push("Vorticity");

      let html = `<div style="font-weight:700;margin-bottom:8px">Debug snapshot</div>`;
      html += `<div style="margin-bottom:6px"><strong>Active overlays:</strong> ${active.length ? active.join(", ") : "None"}</div>`;
      if (metrics) {
        html += `<div style="margin-top:8px"><strong>Metrics</strong></div>`;
        html += `<div>Drag C_D: ${metrics.C_D?.toFixed?.(3) ?? "–"}</div>`;
        html += `<div>Lift C_L: ${metrics.C_L?.toFixed?.(3) ?? "–"}</div>`;
        html += `<div>Yaw Mz: ${Math.round(metrics.Mz ?? 0)}</div>`;
        html += `<div>CP: (${Math.round(metrics.CPx ?? 0)}, ${Math.round(metrics.CPy ?? 0)})</div>`;
        html += `<div>CG: (${Math.round(metrics.CGx ?? 0)}, ${Math.round(metrics.CGy ?? 0)})</div>`;
        html += `<div>Obstacle area: ${metrics.obstacleArea ?? "–"}</div>`;
        html += `<div>V_ref: ${Math.round(metrics.baseV ?? (metrics.baseV ?? 0))} px/s</div>`;
        if (metrics.strouhal) html += `<div>Strouhal: ${metrics.strouhal.toFixed(3)} Hz</div>`;
      } else {
        html += `<div style="margin-top:6px;color:rgba(255,255,255,0.75)">No metrics available yet — load a shape or enable overlays.</div>`;
      }

      // Add live sampled diagnostics (pressure / velocity statistics) by scanning the canvas grid
      try {
        const step = 16;
        const w = window.innerWidth || document.documentElement.clientWidth;
        const h = window.innerHeight || document.documentElement.clientHeight;
        let pMin = Infinity, pMax = -Infinity, pSum = 0, pCount = 0;
        let vxSum = 0, vySum = 0, vrmsSum = 0, vCount = 0;
        for (let y = step / 2; y < h; y += step) {
          for (let x = step / 2; x < w; x += step) {
            // pressure sample may throw if grid not ready, guard it
            let p = 0;
            try { p = samplePressure(x, y); } catch (e) { p = 0; }
            pMin = Math.min(pMin, p);
            pMax = Math.max(pMax, p);
            pSum += p; pCount++;
            // velocity sample
            try {
              const f = sampleFlow(x, y) || { x: 0, y: 0 };
              const mag = Math.hypot(f.x || 0, f.y || 0);
              vxSum += (f.x || 0);
              vySum += (f.y || 0);
              vrmsSum += mag * mag;
              vCount++;
            } catch (e) {}
          }
        }
        if (pCount > 0) {
          const pMean = pSum / pCount;
          html += `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:8px 0">`;
          html += `<div style="margin-top:6px"><strong>Live diagnostics (grid step ${step}px)</strong></div>`;
          html += `<div>Pressure samples: ${pCount}</div>`;
          html += `<div>Pressure min: ${pMin.toFixed(2)} | mean: ${pMean.toFixed(2)} | max: ${pMax.toFixed(2)}</div>`;
        }
        if (vCount > 0) {
          const vxMean = vxSum / vCount;
          const vyMean = vySum / vCount;
          const vrms = Math.sqrt(vrmsSum / vCount);
          html += `<div>Velocity mean: (${vxMean.toFixed(2)}, ${vyMean.toFixed(2)}) px/s</div>`;
          html += `<div>Velocity RMS: ${vrms.toFixed(2)} px/s</div>`;
        }
      } catch (e) {
        html += `<div style="margin-top:8px;color:rgba(255,120,120,0.9)">Live diagnostics not available yet.</div>`;
      }

      contentEl.innerHTML = html;
      debugOverlay.style.display = "block";
    }, { passive: true });
  }

  togSettings?.addEventListener("click", () => {
    const showing = settingsPanel.classList.toggle("show");

    // Add a class on the primary UI column so we can hide controls and enforce vertical layout while settings are open
    const uiCol = document.getElementById("ui");
    if (uiCol) {
      if (showing) uiCol.classList.add("settings-open");
      else uiCol.classList.remove("settings-open");
    }

    // stagger children with small delays when opening for a pleasant entrance
    const children = Array.from(settingsPanel.querySelectorAll(".row, .ctrl-row, .panel .row > *"));
    if (showing) {
      children.forEach((el, i) => {
        el.style.animationDelay = `${30 + i * 30}ms`;
        el.classList.add("panel-item-in");
        // ensure reflow so animation restarts when reopened quickly
        void el.offsetWidth;
      });
    } else {
      children.forEach((el) => {
        el.style.animationDelay = "";
        el.classList.remove("panel-item-in");
      });
    }
  });

  // debounce wrapper to avoid spamming updates from fast slider moves
  let _debounceTimer = 0;
  function emitParams(p) {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      onParamsChange && onParamsChange(p);
    }, 80);
  }
  windSpeedInput?.addEventListener("input", (e) => {
    uiState.baseWindSpeed = parseFloat(e.target.value);
    windVal.textContent = uiState.baseWindSpeed.toFixed(0);
    emitParams({ baseWindSpeed: uiState.baseWindSpeed, vortexStrength: uiState.vortexStrength });
  });

  turbInput?.addEventListener("input", (e) => {
    uiState.turbulence = parseFloat(e.target.value);
    turbVal.textContent = uiState.turbulence.toFixed(2);
    emitParams({ turbulence: uiState.turbulence });
  });

  vortexInput?.addEventListener("input", (e) => {
    uiState.vortexStrength = parseFloat(e.target.value);
    vortexVal.textContent = uiState.vortexStrength.toFixed(2);
    emitParams({ vortexStrength: uiState.vortexStrength });
  });

  gustToggle?.addEventListener("change", (e) => {
    uiState.gustsEnabled = e.target.checked;
    emitParams({ gustsEnabled: uiState.gustsEnabled });
  });



  particleCountInput?.addEventListener("input", (e) => {
    uiState.particleCount = parseInt(e.target.value, 10);
    particleCountVal.textContent = uiState.particleCount;
    emitParams({ particleCount: uiState.particleCount });
  });

  colorModeSelect?.addEventListener("change", (e) => {
    uiState.colorMode = e.target.value;
    emitParams({ colorMode: uiState.colorMode });
  });

  // background color picker
  bgColorInput?.addEventListener("input", (e) => {
    uiState.backgroundColor = e.target.value;
    // inform listeners of backgroundColor change (no heavy debounce)
    onParamsChange && onParamsChange({ backgroundColor: uiState.backgroundColor });
  });

  // crosswind controls
  crosswindMag?.addEventListener("input", (e) => {
    uiState.crosswindMag = parseFloat(e.target.value);
    crosswindMagVal.textContent = uiState.crosswindMag.toFixed(0);
    emitParams({ crosswindMag: uiState.crosswindMag });
  });
  crosswindAngle?.addEventListener("input", (e) => {
    uiState.crosswindAngle = parseFloat(e.target.value);
    crosswindAngleVal.textContent = `${uiState.crosswindAngle.toFixed(0)}°`;
    emitParams({ crosswindAngle: uiState.crosswindAngle });
  });

  // smooth checkbox handling
  if (smoothCheckbox) {
    uiState.smoothImage = smoothCheckbox.checked;
    smoothCheckbox.addEventListener("change", (e) => {
      uiState.smoothImage = !!e.target.checked;
    });
  }

  // debug checkbox listeners
  if (dbgPressure) {
    uiState.debugPressure = !!dbgPressure.checked;
    dbgPressure.addEventListener("change", (e) => {
      uiState.debugPressure = !!dbgPressure.checked;
      onParamsChange && onParamsChange({ debugPressure: uiState.debugPressure });
    });
  }
  if (dbgVelocity) {
    uiState.debugVelocity = !!dbgVelocity.checked;
    dbgVelocity.addEventListener("change", (e) => {
      uiState.debugVelocity = !!dbgVelocity.checked;
      onParamsChange && onParamsChange({ debugVelocity: uiState.debugVelocity });
    });
  }
  if (dbgBounds) {
    uiState.debugBounds = !!dbgBounds.checked;
    dbgBounds.addEventListener("change", (e) => {
      uiState.debugBounds = !!dbgBounds.checked;
      onParamsChange && onParamsChange({ debugBounds: uiState.debugBounds });
    });
  }
  if (dbgForces) {
    uiState.debugForces = !!dbgForces.checked;
    dbgForces.addEventListener("change", (e) => {
      uiState.debugForces = !!dbgForces.checked;
      onParamsChange && onParamsChange({ debugForces: uiState.debugForces });
    });
  }
  if (dbgCP) {
    uiState.debugCP = !!dbgCP.checked;
    dbgCP.addEventListener("change", (e) => {
      uiState.debugCP = !!dbgCP.checked;
      onParamsChange && onParamsChange({ debugCP: uiState.debugCP });
    });
  }
  if (dbgVorticity) {
    uiState.debugVorticity = !!dbgVorticity.checked;
    dbgVorticity.addEventListener("change", (e) => {
      uiState.debugVorticity = !!dbgVorticity.checked;
      onParamsChange && onParamsChange({ debugVorticity: uiState.debugVorticity });
    });
  }

  pauseBtn?.addEventListener("click", () => {
    const paused = pauseBtn.textContent !== "Resume";
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    onTogglePause && onTogglePause(paused);
  });

  exportBtn?.addEventListener("click", () => onExport && onExport());
  exportVideoBtn?.addEventListener("click", () => onExportVideo && onExportVideo());
  resetBtn?.addEventListener("click", () => onReset && onReset());

  // file import handling: pass smoothing choice to callback
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      onImageLoad && onImageLoad(img, { smoothing: uiState.smoothImage });
    };
    img.onerror = () => {
      if (dragLabel) dragLabel.textContent = "Drag index: –";
    };
    img.src = URL.createObjectURL(file);
  });
}

