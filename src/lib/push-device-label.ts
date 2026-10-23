// A short description of a device from its user agent, for the list of devices that
// get pushes (Settings › Notifications): "iPhone · Safari", "Windows · Chrome". Pure;
// the parts are product names, so they are not translated. Null when nothing is known.

function deviceOf(ua: string): string | null {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

function browserOf(ua: string): string | null {
  if (/Edg(A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

export function deviceLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  const parts = [deviceOf(ua), browserOf(ua)].filter((p): p is string => p != null);
  return parts.length ? parts.join(" · ") : null;
}
