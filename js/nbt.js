/* NBT (Named Binary Tag) parser - big endian, gzip support.
 * Works in browsers and Node.js (both have DecompressionStream since Node 18).
 *
 * Value mapping:
 *   TAG_Byte/Short/Int/Long/Float/Double -> Number
 *   TAG_String  -> String
 *   TAG_List    -> Array
 *   TAG_Compound-> object (null prototype)
 *   TAG_Byte_Array -> Uint8Array (unsigned view)
 *   TAG_Int_Array  -> Int32Array
 *   TAG_Long_Array -> Uint32Array of [hi,lo] pairs (bit-exact, for packed data)
 * Long values beyond 2^53 lose precision when converted to Number (display only).
 */
(function (global) {
  'use strict';

  const TAG_END = 0, TAG_BYTE = 1, TAG_SHORT = 2, TAG_INT = 3, TAG_LONG = 4,
    TAG_FLOAT = 5, TAG_DOUBLE = 6, TAG_BYTE_ARRAY = 7, TAG_STRING = 8,
    TAG_LIST = 9, TAG_COMPOUND = 10, TAG_INT_ARRAY = 11, TAG_LONG_ARRAY = 12;

  async function gunzip(u8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('この機能には最新のブラウザ (Chrome 80+ / Firefox 113+ / Safari 16.4+) が必要です');
    }
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([u8]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function isGzip(u8) {
    return u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
  }

  /** Parse raw (uncompressed) NBT bytes. Returns the root compound object. */
  function parse(u8) {
    let off = 0;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const td = new TextDecoder('utf-8', { fatal: false });

    function readString() {
      const len = dv.getUint16(off); off += 2;
      const s = td.decode(u8.subarray(off, off + len));
      off += len;
      return s;
    }

    function readPayload(type) {
      switch (type) {
        case TAG_BYTE: { const v = dv.getInt8(off); off += 1; return v; }
        case TAG_SHORT: { const v = dv.getInt16(off); off += 2; return v; }
        case TAG_INT: { const v = dv.getInt32(off); off += 4; return v; }
        case TAG_LONG: {
          const hi = dv.getUint32(off), lo = dv.getUint32(off + 4); off += 8;
          return hi * 4294967296 + lo; // may lose precision > 2^53 (display use only)
        }
        case TAG_FLOAT: { const v = dv.getFloat32(off); off += 4; return v; }
        case TAG_DOUBLE: { const v = dv.getFloat64(off); off += 8; return v; }
        case TAG_BYTE_ARRAY: {
          const len = dv.getInt32(off); off += 4;
          const arr = new Uint8Array(len);
          arr.set(u8.subarray(off, off + len));
          off += len;
          return arr;
        }
        case TAG_STRING: return readString();
        case TAG_LIST: {
          const elemType = dv.getInt8(off); off += 1;
          const len = dv.getInt32(off); off += 4;
          const list = new Array(len);
          for (let i = 0; i < len; i++) list[i] = readPayload(elemType);
          return list;
        }
        case TAG_COMPOUND: {
          const obj = Object.create(null);
          for (;;) {
            const t = dv.getUint8(off); off += 1;
            if (t === TAG_END) break;
            const name = readString();
            obj[name] = readPayload(t);
          }
          return obj;
        }
        case TAG_INT_ARRAY: {
          const len = dv.getInt32(off); off += 4;
          const arr = new Int32Array(len);
          for (let i = 0; i < len; i++) { arr[i] = dv.getInt32(off); off += 4; }
          return arr;
        }
        case TAG_LONG_ARRAY: {
          const len = dv.getInt32(off); off += 4;
          // store as [hi0, lo0, hi1, lo1, ...] bit-exact pairs
          const arr = new Uint32Array(len * 2);
          for (let i = 0; i < len; i++) {
            arr[i * 2] = dv.getUint32(off);
            arr[i * 2 + 1] = dv.getUint32(off + 4);
            off += 8;
          }
          return arr;
        }
        default:
          throw new Error('NBTデコードエラー: 不明なタグ形式 (type ' + type + ')');
      }
    }

    const rootType = dv.getUint8(off); off += 1;
    if (rootType !== TAG_COMPOUND) {
      throw new Error('NBTデコードエラー: ルートがCompoundではありません');
    }
    readString(); // root name (usually "")
    const value = readPayload(TAG_COMPOUND);
    return { value, bytesRead: off };
  }

  /** Parse bytes that may or may not be gzipped. */
  async function parseAuto(bytes) {
    let u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (isGzip(u8)) u8 = await gunzip(u8);
    if (u8.length === 0) throw new Error('ファイルが空です');
    return parse(u8);
  }

  const NBT = { parse, parseAuto, gunzip, isGzip };

  if (typeof module !== 'undefined' && module.exports) module.exports = NBT;
  else global.NBT = NBT;
})(typeof self !== 'undefined' ? self : globalThis);
