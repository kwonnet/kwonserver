// In-process capability: JSON supplied by an HTTP caller cannot mark itself verified.
const verified = new WeakMap<object, string>();
export function markVerifiedPayment<T extends object>(payload: T, providerId: string): T {
  verified.set(payload, providerId);
  return payload;
}
export function verifiedPaymentId(payload: object) { return verified.get(payload); }
