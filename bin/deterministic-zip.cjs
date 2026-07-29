#!/usr/bin/env node
const fs = require('fs');

const CRC_TABLE = makeCrcTable();

function createDeterministicZip(entries) {
  const normalized = Object.entries(entries || {}).map(([name, value]) => {
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`unsafe zip entry: ${name}`);
    return { name, nameBytes: Buffer.from(name), data: Buffer.isBuffer(value) ? value : Buffer.from(String(value)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of normalized) {
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + entry.nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entry.nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    entry.nameBytes.copy(local, 30);
    locals.push(local, entry.data);

    const central = Buffer.alloc(46 + entry.nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    entry.nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

function listZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + size);
    if (method !== 0) throw new Error(`unsupported compression method ${method}`);
    if (crc32(data) !== buffer.readUInt32LE(offset + 14)) throw new Error(`CRC mismatch: ${name}`);
    entries.push({ name, data });
    offset = start + size;
  }
  return entries;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

if (require.main === module) {
  const output = process.argv[2];
  const input = process.argv[3];
  if (!output || !input) throw new Error('用法: deterministic-zip.cjs <output.zip> <entries.json>');
  const entries = JSON.parse(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, createDeterministicZip(entries));
}

module.exports = { createDeterministicZip, listZipEntries, crc32 };
