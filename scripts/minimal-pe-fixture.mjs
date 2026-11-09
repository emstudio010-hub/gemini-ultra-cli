import { Buffer } from 'node:buffer';

// Generated PE32 with one section and a known KERNEL32!ExitProcess import.
// Verification tools parse these bytes as data; this file is never executed.
export function minimalPeFixture() {
  const buffer = Buffer.alloc(0x600);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'ascii');
  buffer.writeUInt16LE(0x14c, 0x84);
  buffer.writeUInt16LE(1, 0x86);
  buffer.writeUInt16LE(0xe0, 0x94);
  buffer.writeUInt16LE(0x102, 0x96);
  const optional = 0x98;
  buffer.writeUInt16LE(0x10b, optional);
  buffer.writeUInt32LE(0x400, optional + 4);
  buffer.writeUInt32LE(0x1000, optional + 16);
  buffer.writeUInt32LE(0x1000, optional + 20);
  buffer.writeUInt32LE(0x400000, optional + 28);
  buffer.writeUInt32LE(0x1000, optional + 32);
  buffer.writeUInt32LE(0x200, optional + 36);
  buffer.writeUInt16LE(6, optional + 40);
  buffer.writeUInt16LE(6, optional + 48);
  buffer.writeUInt32LE(0x2000, optional + 56);
  buffer.writeUInt32LE(0x200, optional + 60);
  buffer.writeUInt16LE(3, optional + 68);
  buffer.writeUInt32LE(0x100000, optional + 72);
  buffer.writeUInt32LE(0x1000, optional + 76);
  buffer.writeUInt32LE(0x100000, optional + 80);
  buffer.writeUInt32LE(0x1000, optional + 84);
  buffer.writeUInt32LE(16, optional + 92);
  buffer.writeUInt32LE(0x1100, optional + 104);
  buffer.writeUInt32LE(40, optional + 108);
  const section = optional + 0xe0;
  buffer.write('.text', section, 'ascii');
  buffer.writeUInt32LE(0x400, section + 8);
  buffer.writeUInt32LE(0x1000, section + 12);
  buffer.writeUInt32LE(0x400, section + 16);
  buffer.writeUInt32LE(0x200, section + 20);
  buffer.writeUInt32LE(0x60000020, section + 36);
  buffer[0x200] = 0xc3;
  buffer.writeUInt32LE(0x1140, 0x300);
  buffer.writeUInt32LE(0x1160, 0x30c);
  buffer.writeUInt32LE(0x1150, 0x310);
  buffer.writeUInt32LE(0x1170, 0x340);
  buffer.writeUInt32LE(0x1170, 0x350);
  buffer.write('KERNEL32.dll\0', 0x360, 'ascii');
  buffer.write('ExitProcess\0', 0x372, 'ascii');
  return buffer;
}
