// Historical preference JSON may contain raw banking credentials. Keep those
// fields out of account responses and reject them on generic preference writes.
// Normalize separators/casing because generic preference JSON accepts arbitrary keys.
const bankCredentialKeys = new Set([
  'bankdetails', 'bankaccount', 'bankaccountnumber', 'bankroutingnumber',
  'accountnumber', 'accountnumberfull', 'routingnumber', 'iban', 'swiftcode',
  'bic', 'sortcode',
]);

function isBankCredentialKey(key: string): boolean {
  return bankCredentialKeys.has(key.toLowerCase().replace(/[\s_-]/g, ''));
}

export function hasBankCredentials(value: unknown): boolean {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (isBankCredentialKey(key) && child != null) return true;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return false;
}

export function publicPaymentPreferences(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, unknown> = {};
  const pending: Array<[object, object]> = [[value, result]];
  while (pending.length) {
    const [source, target] = pending.pop()!;
    for (const [key, child] of Object.entries(source)) {
      if (isBankCredentialKey(key)) continue;
      const next = child && typeof child === 'object' ? (Array.isArray(child) ? [] : {}) : child;
      Object.defineProperty(target, key, { value: next, enumerable: true, writable: true, configurable: true });
      if (child && typeof child === 'object') pending.push([child, next as object]);
    }
  }
  return result;
}
