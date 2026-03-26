interface CacheEnvelope<T> {
  cachedAt: string;
  data: T;
}

export async function getCachedJson<T>(kv: KVNamespace, key: string) {
  const raw = await kv.get(key);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as CacheEnvelope<T>;
}

export async function putCachedJson<T>(
  kv: KVNamespace,
  key: string,
  data: T,
  ttlSeconds: number
) {
  const envelope: CacheEnvelope<T> = {
    cachedAt: new Date().toISOString(),
    data,
  };

  await kv.put(key, JSON.stringify(envelope), {
    expirationTtl: ttlSeconds,
  });

  return envelope;
}

export async function getOrSetCachedJson<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
) {
  const cached = await getCachedJson<T>(kv, key);
  if (cached) {
    return cached;
  }

  const data = await loader();
  return putCachedJson(kv, key, data, ttlSeconds);
}

export async function deleteCacheKeys(kv: KVNamespace, keys: string[]) {
  await Promise.all(keys.map((key) => kv.delete(key)));
}
