/*
Recording helper: extracts the recording/export logic from loopInit to keep responsibilities small.
Exports setupRecording({ canvas, buildFlowField, getUIState, setPaused })
*/

export function setupRecording({ canvas, buildFlowField, getUIState, setPaused }) {
  const exportBtn = document.getElementById("exportVideoBtn");
  if (!exportBtn) return;
  const origText = exportBtn.textContent;
  exportBtn.disabled = true;
  exportBtn.textContent = "Recording... 0%";

  const segments = [
    { speed: 50, duration: 10 },
    { speed: 100, duration: 10 },
    { speed: 200, duration: 10 },
  ];
  const fps = 60;
  const totalSeconds = segments.reduce((s, seg) => s + seg.duration, 0);

  let preferredMime = "video/mp4;codecs=h264";
  let mimeType = preferredMime;
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/mp4";
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
  }

  const opts = { mimeType, videoBitsPerSecond: 8_000_000 };
  const stream = canvas.captureStream(fps);
  const recordedChunks = [];
  let rec;
  try {
    rec = new MediaRecorder(stream, opts);
  } catch (err) {
    rec = new MediaRecorder(stream);
  }

  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) recordedChunks.push(ev.data); };
  rec.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    let ext = ".webm";
    if (mimeType.includes("mp4")) ext = ".mp4";
    else if (mimeType.includes("webm")) ext = ".webm";

    a.download = `dynamage_flow_${new Date().toISOString().slice(0,10)}${ext}`;
    a.click();

    exportBtn.textContent = "✓ Saved!";
    setTimeout(() => {
      exportBtn.textContent = origText;
      exportBtn.disabled = false;
      URL.revokeObjectURL(url);
    }, 2000);
  };

  const prevPaused = false;
  setPaused(false);
  rec.start();

  let elapsed = 0;
  let segIndex = 0;
  function applySegment(seg) {
    buildFlowField({ baseWindSpeed: seg.speed });
  }

  applySegment(segments[0]);

  const startTime = performance.now();
  const interval = setInterval(() => {
    const now = performance.now();
    elapsed = (now - startTime) / 1000;
    const progress = Math.round((elapsed / totalSeconds) * 100);
    exportBtn.textContent = `Recording... ${Math.min(progress, 99)}%`;

    let cum = 0, idx = 0;
    for (; idx < segments.length; idx++) {
      cum += segments[idx].duration;
      if (elapsed < cum) break;
    }
    if (idx >= segments.length) {
      clearInterval(interval);
      setTimeout(() => {
        rec.stop();
        setPaused(prevPaused);
        buildFlowField(getUIState());
      }, 120);
      return;
    }
    if (idx !== segIndex) {
      segIndex = idx;
      applySegment(segments[segIndex]);
    }
  }, 200);
}

