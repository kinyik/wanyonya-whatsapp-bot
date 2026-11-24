/**
 * 检查讯息真的来自 Meta：Meta 用 App Secret 对整个请求内容做 HMAC-SHA256，
 * 放在 X-Hub-Signature-256: sha256=<hex>。我们自己算一次，对得上才处理。
 */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = await hmacHex(rawBody, appSecret);
  return safeEqual(expected, header.slice(7).toLowerCase());
}

export async function hmacHex(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 逐字比较、不提早结束，避免被用时间差猜出签名 */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
