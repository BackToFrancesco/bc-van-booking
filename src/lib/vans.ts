// Pure display helpers for vans (usable on server and client)

export function vanLabel(van: { name: string; model?: string | null }): string {
  return van.model ? `${van.name} (${van.model})` : van.name;
}

export function seatsLabel(seats: number): string {
  return `${seats} posti + conducente`;
}
