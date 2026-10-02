import { expect, it } from 'vitest';
import { Socket } from 'node:net';

it('blocks accidental outbound TCP connections', () => {
  const socket = new Socket();
  try { expect(() => socket.connect(5432, '127.0.0.1')).toThrow('Network access is forbidden'); }
  finally { socket.destroy(); }
});
it('requires explicit fetch mocks', () => {
  expect(() => fetch('https://example.invalid')).toThrow('Mock fetch');
});
