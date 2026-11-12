// Checks for the DEMO checkout form only. Nothing here talks to a payment provider and card data is never sent anywhere.

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Luhn checksum, so the form rejects typos the way a real one would. */
export function luhnValid(cardNumber: string): boolean {
  const digits = digitsOnly(cardNumber);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** MM/YY in the future relative to the given month (passed in, so this stays testable). */
export function expiryValid(value: string, nowYear: number, nowMonth: number): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return year > nowYear || (year === nowYear && month >= nowMonth);
}
