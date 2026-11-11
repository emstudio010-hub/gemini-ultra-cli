import { Buffer } from 'node:buffer';
export const highAddressBase = 0xffff800000000000n;
export function highAddressElfFixture() {
  const bytes = Buffer.alloc(256);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  bytes.writeUInt16LE(2, 16);
  bytes.writeUInt16LE(62, 18);
  bytes.writeUInt32LE(1, 20);
  bytes.writeBigUInt64LE(highAddressBase + 128n, 24);
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(64, 52);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeUInt32LE(5, 68);
  bytes.writeBigUInt64LE(highAddressBase, 80);
  bytes.writeBigUInt64LE(highAddressBase, 88);
  bytes.writeBigUInt64LE(256n, 96);
  bytes.writeBigUInt64LE(256n, 104);
  bytes.writeBigUInt64LE(4096n, 112);
  bytes.set([0xe8, 11, 0, 0, 0, 0xc3], 128);
  bytes.set([0xb8, 42, 0, 0, 0, 0xc3], 144);
  return bytes;
}
