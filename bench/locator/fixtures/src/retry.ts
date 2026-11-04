export function backoffForAttempt(attempt: number): number {
  const base = 250;
  return Math.min(base * 2 ** attempt, 30_000);
}

export function maxAttempts(): number {
  return 4;
}
