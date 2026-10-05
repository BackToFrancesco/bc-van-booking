// Pure display helpers for vans (usable on server and client)

export function vanLabel(van: { name: string; model?: string | null }): string {
  return van.model ? `${van.name} (${van.model})` : van.name;
}

/** Short tag for tight spaces like the admin calendar: "pulmino-2" → "P2". */
export function vanCode(id: string): string {
  const n = id.match(/(\d+)$/)?.[1];
  return n ? `P${n}` : id;
}

export function seatsLabel(seats: number): string {
  return `${seats} posti + conducente`;
}
