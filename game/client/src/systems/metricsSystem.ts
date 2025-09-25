let lastLog = performance.now();
let frames = 0;

export function trackFrame(): void {
  frames += 1;
  const now = performance.now();
  if (now - lastLog >= 1000) {
    const fps = (frames * 1000) / (now - lastLog);
    console.debug(`[metrics] fps=${fps.toFixed(1)}`);
    frames = 0;
    lastLog = now;
  }
}
