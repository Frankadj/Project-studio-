export function fmt(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatFinancialValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  
  const abs = Math.abs(value);
  let formatted = "";
  
  if (abs >= 1e12) {
    formatted = (abs / 1e12).toFixed(1).replace(/\.0$/, "") + "T";
  } else if (abs >= 1e9) {
    formatted = (abs / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  } else if (abs >= 1e6) {
    formatted = (abs / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  } else if (abs >= 1e3) {
    formatted = (abs / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  } else {
    formatted = abs.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  return value < 0 ? `-${formatted}` : formatted;
}

export function formatCompactCurrency(value: number | null | undefined, currency: string = "GH¢"): string {
  if (value === null || value === undefined) return "N/A";
  const formatted = formatFinancialValue(value);
  return `${value < 0 ? '-' : ''}${currency}${formatted.replace(/^-/, '')}`;
}