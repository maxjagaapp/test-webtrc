export function getSignalingUrl() {
  // 1) URL override via ?signal=ws[s]://host
  const qp =
    typeof window !== "undefined" ? new URLSearchParams(location.search) : null;
  const override = qp?.get("signal");
  if (override) {
    console.log("[signaling] URL (query) =", override);
    return override;
  }
  // 2) Env (Vite/CRA) or fallback to localhost for development
  let url = "wss://signalingroom.onrender.com";

  // 3) If env was just a host, add scheme matching page protocol
  if (!/^wss?:\/\//i.test(url)) {
    const scheme =
      typeof location !== "undefined" && location.protocol === "https:"
        ? "wss"
        : "ws";
    url = `${scheme}://${url.replace(/^\/\//, "")}`;
  }

  try {
    new URL(url);
  } catch (e) {
    console.warn("[signaling] Invalid URL:", url, e);
  }
  console.log("[signaling] URL =", url);
  return url;
}
