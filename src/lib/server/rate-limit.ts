type Bucket = {
  points: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      points: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  if (current.points >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.points += 1;
  buckets.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.points,
    resetAt: current.resetAt,
  };
}
