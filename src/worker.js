const DEFAULT_STATE = {
  version: 1,
  dishes: [],
  fridge: [],
  plan: [],
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/state") {
      if (request.method === "GET") return getState(env);
      if (request.method === "PUT") return putState(request, env);
      return methodNotAllowed("GET, PUT");
    }

    if (url.pathname === "/api/uploads") {
      if (request.method === "POST") return uploadPhotos(request, env);
      return methodNotAllowed("POST");
    }

    if (url.pathname.startsWith("/api/photos/")) {
      if (request.method === "GET" || request.method === "HEAD") {
        return getPhoto(request, env, url.pathname.slice("/api/photos/".length));
      }
      return methodNotAllowed("GET, HEAD");
    }

    return env.ASSETS.fetch(request);
  },
};

async function getState(env) {
  const row = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?1")
    .bind("state")
    .first();
  if (!row?.value) return json(DEFAULT_STATE);

  try {
    return json(normalizeState(JSON.parse(row.value)));
  } catch {
    return json(DEFAULT_STATE);
  }
}

async function putState(request, env) {
  let nextState;
  try {
    nextState = normalizeState(await request.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const previousRow = await env.DB.prepare("SELECT value FROM app_state WHERE key = ?1")
    .bind("state")
    .first();
  const previousState = previousRow?.value ? safeParseState(previousRow.value) : DEFAULT_STATE;
  const body = JSON.stringify(nextState);

  await env.DB.prepare(
    "INSERT INTO app_state (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
  )
    .bind("state", body)
    .run();

  await deleteRemovedPhotos(env, previousState, nextState);
  return json({ ok: true });
}

async function uploadPhotos(request, env) {
  const form = await request.formData();
  const files = form.getAll("photos").filter((item) => typeof item !== "string" && item.size > 0);
  const uploads = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const extension = extensionFor(file.type, file.name);
    const key = `${crypto.randomUUID()}${extension}`;
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        originalName: file.name || "photo",
      },
    });
    uploads.push({ key, url: `/api/photos/${encodeURIComponent(key)}` });
  }

  return json({ uploads });
}

async function getPhoto(request, env, rawKey) {
  const key = decodeURIComponent(rawKey || "");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const object = await env.PHOTOS.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");

  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    version: 1,
    dishes: Array.isArray(state.dishes) ? state.dishes.map(normalizeDish) : [],
    fridge: Array.isArray(state.fridge) ? state.fridge.map(normalizeFridgeItem) : [],
    plan: Array.isArray(state.plan) ? state.plan.map(normalizePlanItem).filter(Boolean) : [],
  };
}

function normalizeDish(dish) {
  return {
    id: asString(dish.id) || crypto.randomUUID(),
    name: asString(dish.name) || "未命名菜",
    method: asString(dish.method),
    ingredients: normalizeIngredients(dish.ingredients),
    sources: normalizeSources(dish.sources),
    logs: Array.isArray(dish.logs) ? dish.logs.map(normalizeLog) : [],
    createdAt: asString(dish.createdAt) || new Date().toISOString(),
    updatedAt: asString(dish.updatedAt) || new Date().toISOString(),
  };
}

function normalizeIngredients(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const name = asString(typeof item === "string" ? item : item?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function normalizeSources(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const url = asString(typeof item === "string" ? item : item?.url);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

function normalizeLog(log) {
  return {
    id: asString(log.id) || crypto.randomUUID(),
    date: asString(log.date) || new Date().toISOString().slice(0, 10),
    rating: clamp(Number(log.rating) || 4, 1, 5),
    notes: asString(log.notes),
    photos: Array.isArray(log.photos) ? log.photos.map(asString).filter(Boolean) : [],
    createdAt: asString(log.createdAt) || new Date().toISOString(),
    updatedAt: asString(log.updatedAt) || new Date().toISOString(),
  };
}

function normalizeFridgeItem(item) {
  return {
    id: asString(item.id) || crypto.randomUUID(),
    amount: asString(item.amount),
    unit: asString(item.unit),
    name: asString(item.name),
    expires: asString(item.expires),
    createdAt: asString(item.createdAt) || new Date().toISOString(),
  };
}

function normalizePlanItem(item) {
  const date = asString(item.date);
  const dishId = asString(item.dishId);
  if (!date || !dishId) return null;
  return { date, dishId };
}

function safeParseState(value) {
  try {
    return normalizeState(JSON.parse(value));
  } catch {
    return DEFAULT_STATE;
  }
}

async function deleteRemovedPhotos(env, previousState, nextState) {
  const previous = extractPhotoKeys(previousState);
  const next = extractPhotoKeys(nextState);
  const removed = [...previous].filter((key) => !next.has(key));
  await Promise.all(removed.map((key) => env.PHOTOS.delete(key)));
}

function extractPhotoKeys(state) {
  const keys = new Set();
  for (const dish of state.dishes || []) {
    for (const log of dish.logs || []) {
      for (const photo of log.photos || []) {
        const key = photoKey(photo);
        if (key) keys.add(key);
      }
    }
  }
  return keys;
}

function photoKey(value) {
  const text = asString(value);
  const marker = "/api/photos/";
  const index = text.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(text.slice(index + marker.length));
}

function extensionFor(type, name) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  const match = String(name || "").match(/\.[a-z0-9]{2,8}$/i);
  return match ? match[0].toLowerCase() : "";
}

function asString(value) {
  return String(value ?? "").trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: JSON_HEADERS,
  });
}

function methodNotAllowed(allow) {
  return new Response("Method not allowed", {
    status: 405,
    headers: { allow },
  });
}
