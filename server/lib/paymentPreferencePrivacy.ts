// Historical preference JSON may contain raw banking credentials. Keep those
// fields out of account responses and reject them on generic preference writes.
const bankCredentialKeys = new Set([
  'bankdetails', 'accountnumber', 'accountnumberfull', 'routingnumber', 'iban', 'swiftcode',
]);

export function hasBankCredentials(value: unknown): boolean {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (bankCredentialKeys.has(key.toLowerCase()) && child != null) return true;
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
      if (bankCredentialKeys.has(key.toLowerCase())) continue;
      const next = child && typeof child === 'object' ? (Array.isArray(child) ? [] : {}) : child;
      Object.defineProperty(target, key, { value: next, enumerable: true, writable: true, configurable: true });
      if (child && typeof child === 'object') pending.push([child, next as object]);
    }
  }
  return result;
}
