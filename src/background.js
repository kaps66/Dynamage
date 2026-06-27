/*
Background rendering helper.
Exports renderBackground(ctx, width, height, uiState)
*/
export function renderBackground(ctx, width, height, uiState = {}) {
  const base = uiState.backgroundColor || "#f4f3ef";
  function lightenHex(hex, amt = 12) {
    const h = hex.replace("#", "");
    const num = parseInt(h, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + (r << 16 | g << 8 | b).toString(16).padStart(6, "0");
  }
  const far = lightenHex(base, 10);
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, base);
  g.addColorStop(1, far);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(0,0,0,0.03)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(width, height * 0.5);
  ctx.stroke();
}

