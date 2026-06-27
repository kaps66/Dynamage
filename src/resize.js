/*
Resizer helper: encapsulates DPR and resize handling for loopMain.
Exports setupResizer({ canvas, ctx, onResize })
*/
export function setupResizer({ canvas, ctx, onResize }) {
  let width = 0, height = 0;
  function handleResize() {
    const dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (onResize) onResize({ width, height, dpr });
  }
  window.addEventListener("resize", handleResize, { passive: true });
  handleResize();
  return () => window.removeEventListener("resize", handleResize);
}

