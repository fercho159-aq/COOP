import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MONTHS = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

export const MONTH_NAMES: Record<number, string> = {
  1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
  5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
  9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
};

export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}
