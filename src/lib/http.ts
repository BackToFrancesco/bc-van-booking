export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Parses "YYYY-MM-DD" from/to query params into a [from, to+1day) range. */
export function parseRangeParams(url: URL, maxDays = 400): { from: Date; to: Date } | string {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return 'Parametri "from" e "to" obbligatori';
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return 'Date non valide';
  if (toDate.getTime() - fromDate.getTime() > maxDays * 24 * 60 * 60 * 1000) {
    return `Intervallo di date troppo ampio (massimo ${maxDays} giorni)`;
  }
  toDate.setDate(toDate.getDate() + 1);
  return { from: fromDate, to: toDate };
}
