const MOBILE_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  if (MOBILE_REGEX.test(ua)) return true;
  return (navigator.maxTouchPoints ?? 0) > 1 && window.innerWidth <= 1024;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent || navigator.vendor || "");
}

export function isStandaloneIOS(): boolean {
  return isIOS() && (window.navigator as any).standalone === true;
}
