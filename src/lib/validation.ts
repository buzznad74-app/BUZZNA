/**
 * Kenyan Phone Number Validator
 * Validates Safaricom and Airtel numbers
 */

export const KENYAN_PHONE_PATTERNS = {
  safaricom: /^(?:\+254|0)?7[0-9]{8}$/,
  airtel: /^(?:\+254|0)?6[0-9]{8}$|^(?:\+254|0)?4[0-9]{8}$/,
  equity: /^(?:\+254|0)?8[0-9]{8}$/,
  vodafone: /^(?:\+254|0)?9[0-9]{8}$/
};

export function validateKenyanPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s/g, '');
  return (
    KENYAN_PHONE_PATTERNS.safaricom.test(cleaned) ||
    KENYAN_PHONE_PATTERNS.airtel.test(cleaned) ||
    KENYAN_PHONE_PATTERNS.equity.test(cleaned) ||
    KENYAN_PHONE_PATTERNS.vodafone.test(cleaned)
  );
}

export function normalizeKenyanPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return '+254' + cleaned.substring(1);
  } else if (cleaned.length === 9) {
    return '+254' + cleaned;
  } else if (cleaned.startsWith('254')) {
    return '+' + cleaned;
  }
  return phone;
}

export function getCarrier(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const digit = cleaned[cleaned.length - 10] || cleaned[0];
  
  if (['7'].includes(digit)) return 'Safaricom';
  if (['6', '4'].includes(digit)) return 'Airtel';
  if (['8'].includes(digit)) return 'Equity';
  if (['9'].includes(digit)) return 'Vodafone';
  return 'Unknown';
}
