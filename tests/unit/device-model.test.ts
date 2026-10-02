import { expect, it } from 'vitest';
import Device from '@/db/models/DeviceModel';
it('preserves device revocation in the strict schema', () => {
  const revokedAt = new Date('2026-10-01');
  const device = new Device({ userId: 'u', deviceId: 'phone', revokedAt });
  expect(device.get('revokedAt')).toEqual(revokedAt); expect(device.validateSync()).toBeUndefined();
});
it('defaults a new device to active with no prekeys', () => {
  const device = new Device({ userId: 'u', deviceId: 'phone' });
  expect(device.get('revokedAt')).toBeNull(); expect(device.oneTimePreKeys).toEqual([]);
});
it('serializes a public ID without the internal MongoDB ID', () => {
  const device = new Device({ userId: 'u', deviceId: 'phone' });
  for (const value of [device.toJSON(), device.toObject()]) {
    expect(value.id).toBe(String(device._id)); expect(value).not.toHaveProperty('_id');
  }
});
