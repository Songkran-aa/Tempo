export class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

export async function api(method, path, body, { raw = false } = {}) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: { "x-requested-with": "tempo", ...(body && !isForm ? { "content-type": "application/json" } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new ApiError(0, "network", "Network error");
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, "error", res.statusText);
    return res;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code || "error", data?.message || res.statusText);
  return data;
}
