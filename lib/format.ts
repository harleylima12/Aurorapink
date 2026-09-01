export function formatKm(km: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(km)} km`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}
