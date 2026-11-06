/* Schematic parsers: .litematic (Litematica), .nbt (vanilla structure block),
 * .schem (Sponge/WorldEdit v2+). Produces a material-count summary.
 *
 * Bit packing reference (validated against litemapy 0.11):
 *   bits = max(2, ceil(log2(paletteSize)))
 *   entries are packed LSB-first, spanning across 64-bit long boundaries,
 *   long array length = ceil(volume * bits / 64)
 * A non-spanning fallback (vanilla 1.16+ chunk style) is auto-detected via
 * the long array length.
 */
(function (global) {
  'use strict';

  let NBTRef;
  if (typeof module !== 'undefined' && module.exports) {
    NBTRef = require('./nbt.js'); // Node (tests)
  } else {
    NBTRef = global.NBT; // browser (classic scripts)
  }

  // Blocks that are never shown in the material list
  const EXCLUDED = new Set([
    'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air',
    'minecraft:structure_void', 'minecraft:light', 'minecraft:barrier',
    // ピストンが伸びた際の先端ブロック。プレイヤーが設置・入手できる
    // アイテムではないため建材リストからは除外する（本体は
    // minecraft:piston / minecraft:sticky_piston としてカウントされる）。
    'minecraft:piston_head', 'minecraft:sticky_piston_head',
  ]);

  // 壁付けバリアントは同じアイテムとして集計する (例: oak_wall_sign -> oak_sign)。
  // バニラのブロックID表 (scripts/data/blocks_26_1.json) から生成した対応表。
  // 対象: 壁付けの看板・吊り看板・旗・サンゴファン・松明・頭・頭蓋骨。
  // ※ 「〇〇_wall」(石レンガの壁など) は独立したアイテムなので含まない。
  const WALL_TO_BASE = {
    "minecraft:acacia_wall_hanging_sign":"minecraft:acacia_hanging_sign", "minecraft:acacia_wall_sign":"minecraft:acacia_sign", "minecraft:bamboo_wall_hanging_sign":"minecraft:bamboo_hanging_sign",
    "minecraft:bamboo_wall_sign":"minecraft:bamboo_sign", "minecraft:birch_wall_hanging_sign":"minecraft:birch_hanging_sign", "minecraft:birch_wall_sign":"minecraft:birch_sign",
    "minecraft:black_wall_banner":"minecraft:black_banner", "minecraft:blue_wall_banner":"minecraft:blue_banner", "minecraft:brain_coral_wall_fan":"minecraft:brain_coral_fan",
    "minecraft:brown_wall_banner":"minecraft:brown_banner", "minecraft:bubble_coral_wall_fan":"minecraft:bubble_coral_fan", "minecraft:cherry_wall_hanging_sign":"minecraft:cherry_hanging_sign",
    "minecraft:cherry_wall_sign":"minecraft:cherry_sign", "minecraft:copper_wall_torch":"minecraft:copper_torch", "minecraft:creeper_wall_head":"minecraft:creeper_head",
    "minecraft:crimson_wall_hanging_sign":"minecraft:crimson_hanging_sign", "minecraft:crimson_wall_sign":"minecraft:crimson_sign", "minecraft:cyan_wall_banner":"minecraft:cyan_banner",
    "minecraft:dark_oak_wall_hanging_sign":"minecraft:dark_oak_hanging_sign", "minecraft:dark_oak_wall_sign":"minecraft:dark_oak_sign", "minecraft:dead_brain_coral_wall_fan":"minecraft:dead_brain_coral_fan",
    "minecraft:dead_bubble_coral_wall_fan":"minecraft:dead_bubble_coral_fan", "minecraft:dead_fire_coral_wall_fan":"minecraft:dead_fire_coral_fan", "minecraft:dead_horn_coral_wall_fan":"minecraft:dead_horn_coral_fan",
    "minecraft:dead_tube_coral_wall_fan":"minecraft:dead_tube_coral_fan", "minecraft:dragon_wall_head":"minecraft:dragon_head", "minecraft:fire_coral_wall_fan":"minecraft:fire_coral_fan",
    "minecraft:gray_wall_banner":"minecraft:gray_banner", "minecraft:green_wall_banner":"minecraft:green_banner", "minecraft:horn_coral_wall_fan":"minecraft:horn_coral_fan",
    "minecraft:jungle_wall_hanging_sign":"minecraft:jungle_hanging_sign", "minecraft:jungle_wall_sign":"minecraft:jungle_sign", "minecraft:light_blue_wall_banner":"minecraft:light_blue_banner",
    "minecraft:light_gray_wall_banner":"minecraft:light_gray_banner", "minecraft:lime_wall_banner":"minecraft:lime_banner", "minecraft:magenta_wall_banner":"minecraft:magenta_banner",
    "minecraft:mangrove_wall_hanging_sign":"minecraft:mangrove_hanging_sign", "minecraft:mangrove_wall_sign":"minecraft:mangrove_sign", "minecraft:oak_wall_hanging_sign":"minecraft:oak_hanging_sign",
    "minecraft:oak_wall_sign":"minecraft:oak_sign", "minecraft:orange_wall_banner":"minecraft:orange_banner", "minecraft:pale_oak_wall_hanging_sign":"minecraft:pale_oak_hanging_sign",
    "minecraft:pale_oak_wall_sign":"minecraft:pale_oak_sign", "minecraft:piglin_wall_head":"minecraft:piglin_head", "minecraft:pink_wall_banner":"minecraft:pink_banner",
    "minecraft:player_wall_head":"minecraft:player_head", "minecraft:purple_wall_banner":"minecraft:purple_banner", "minecraft:red_wall_banner":"minecraft:red_banner",
    "minecraft:redstone_wall_torch":"minecraft:redstone_torch", "minecraft:skeleton_wall_skull":"minecraft:skeleton_skull", "minecraft:soul_wall_torch":"minecraft:soul_torch",
    "minecraft:spruce_wall_hanging_sign":"minecraft:spruce_hanging_sign", "minecraft:spruce_wall_sign":"minecraft:spruce_sign", "minecraft:tube_coral_wall_fan":"minecraft:tube_coral_fan",
    "minecraft:wall_torch":"minecraft:torch", "minecraft:warped_wall_hanging_sign":"minecraft:warped_hanging_sign", "minecraft:warped_wall_sign":"minecraft:warped_sign",
    "minecraft:white_wall_banner":"minecraft:white_banner", "minecraft:wither_skeleton_wall_skull":"minecraft:wither_skeleton_skull", "minecraft:yellow_wall_banner":"minecraft:yellow_banner",
    "minecraft:zombie_wall_head":"minecraft:zombie_head"
  };

  // 設置されたときのブロックIDが、アイテムとしてのIDと異なるもの。
  // アイテム形態のIDに統合して集計・表示する (パワー 0-15 などの
  // ブロック状態は、パレット集計時に最初から区別しない)。
  // 例: レッドストーンワイヤー(設置状態) -> レッドストーンダスト(アイテム)
  const BLOCK_TO_ITEM = {
    "minecraft:redstone_wire": "minecraft:redstone",
  };

  function canonicalId(id) {
    return WALL_TO_BASE[id] || BLOCK_TO_ITEM[id] || id;
  }

  const FORMAT_LABEL = {
    litematic: 'Litematica (.litematic)',
    nbt: 'バニラ構造 (.nbt)',
    schem: 'Sponge/WorldEdit (.schem)',
  };

  function bitlen(x) {
    return x <= 0 ? 0 : 32 - Math.clz32(x);
  }

  /* ---------- bit readers: longs = Uint32Array [hi0,lo0,hi1,lo1,...] ---------- */

  function makeGetSpanning(longs, bits) {
    const mask = bits >= 31 ? 0x7FFFFFFF : (1 << bits) - 1;
    return function (i) {
      const startBit = i * bits;
      const li = startBit >>> 6;
      const off = startBit & 63;
      const L = li * 2;
      if (off < 32) {
        if (off + bits <= 32) return (longs[L + 1] >>> off) & mask;
        // spans lo -> hi inside one long
        return ((longs[L + 1] >>> off) | (longs[L] << (32 - off))) & mask;
      }
      if (off + bits <= 64) return (longs[L] >>> (off - 32)) & mask;
      // spans into the next long's low bits
      return ((longs[L] >>> (off - 32)) | (longs[L + 3] << (64 - off))) & mask;
    };
  }

  function makeGetNonSpanning(longs, bits) {
    const perLong = Math.floor(64 / bits);
    const mask = bits >= 31 ? 0x7FFFFFFF : (1 << bits) - 1;
    return function (i) {
      const li = (i / perLong) | 0;
      const off = (i % perLong) * bits;
      const L = li * 2;
      if (off < 32) {
        if (off + bits <= 32) return (longs[L + 1] >>> off) & mask;
        return ((longs[L + 1] >>> off) | (longs[L] << (32 - off))) & mask;
      }
      return (longs[L] >>> (off - 32)) & mask;
    };
  }

  /* ------------------------------- litematic ------------------------------- */

  function decodeRegion(region, counts) {
    if (!region || !region.Size) return { volume: 0, blocks: 0 };
    const size = region.Size;
    const sx = Math.abs(size.x | 0), sy = Math.abs(size.y | 0), sz = Math.abs(size.z | 0);
    const vol = sx * sy * sz;
    if (vol <= 0) return { volume: 0, blocks: 0 };

    const paletteNbt = region.BlockStatePalette;
    if (!paletteNbt || !paletteNbt.length) return { volume: vol, blocks: 0 };
    const palette = new Array(paletteNbt.length);
    for (let i = 0; i < paletteNbt.length; i++) {
      const e = paletteNbt[i];
      palette[i] = (e && typeof e.Name === 'string') ? e.Name : 'minecraft:air';
    }

    const longs = region.BlockStates; // Uint32Array pairs, or undefined
    if (!longs || longs.length === 0) {
      // No data: if the single palette entry is a real block, everything is that
      if (palette.length === 1 && !EXCLUDED.has(palette[0])) {
        const id0 = canonicalId(palette[0]);
        counts.set(id0, (counts.get(id0) || 0) + vol);
      }
      return { volume: vol, blocks: 0 };
    }
    const longCount = longs.length / 2;

    // candidate (packing, bits) configurations, most standard first
    const needed = Math.max(2, bitlen(palette.length - 1));
    const candidates = [];
    const seen = new Set();
    function push(packing, bits) {
      const key = packing + ':' + bits;
      if (bits <= 0 || bits > 26 || seen.has(key)) return;
      seen.add(key);
      candidates.push({ packing, bits });
    }
    const spanLen = Math.ceil(vol * needed / 64);
    const perLong = Math.floor(64 / needed);
    const nonSpanLen = Math.ceil(vol / perLong);
    // Prefer configurations whose expected array length matches exactly.
    if (longCount === spanLen) push('span', needed);
    if (longCount === nonSpanLen) push('nonspan', needed);
    if (needed < 4) {
      const b4 = 4;
      if (longCount === Math.ceil(vol * b4 / 64)) push('span', b4);
      if (longCount === Math.ceil(vol / Math.floor(64 / b4))) push('nonspan', b4);
    }
    // fallbacks if the length matches nothing
    push('span', needed); push('nonspan', needed);
    if (needed < 4) { push('span', 4); push('nonspan', 4); }

    // pick the first candidate that decodes without palette violations
    let chosen = null;
    for (const cand of candidates) {
      const get = cand.packing === 'span'
        ? makeGetSpanning(longs, cand.bits) : makeGetNonSpanning(longs, cand.bits);
      const local = new Map();
      let ok = true;
      for (let i = 0; i < vol; i++) {
        const v = get(i);
        if (v >= palette.length || v < 0) { ok = false; break; }
        local.set(v, (local.get(v) || 0) + 1);
      }
      if (!ok) continue;
      chosen = { local };
      break;
    }
    if (!chosen) {
      throw new Error('BlockStatesのデコードに失敗しました（パレットとデータ長が一致しません）');
    }
    let blocks = 0;
    for (const [idx, n] of chosen.local) {
      const id = canonicalId(palette[idx]);
      if (EXCLUDED.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + n);
      blocks += n;
    }
    return { volume: vol, blocks };
  }

  function parseLitematic(root) {
    const meta = root.Metadata || {};
    const counts = new Map();
    let volume = 0, blocks = 0;
    const regions = root.Regions;
    if (!regions) throw new Error('Regionsが見つかりません（.litematicではない可能性があります）');
    let size = null;
    if (meta.EnclosingSize) {
      size = [Math.abs(meta.EnclosingSize.x | 0), Math.abs(meta.EnclosingSize.y | 0), Math.abs(meta.EnclosingSize.z | 0)];
    }
    for (const key of Object.keys(regions)) {
      const r = decodeRegion(regions[key], counts);
      volume += r.volume; blocks += r.blocks;
    }
    return {
      format: 'litematic',
      meta: {
        name: typeof meta.Name === 'string' ? meta.Name : '',
        author: typeof meta.Author === 'string' ? meta.Author : '',
        description: typeof meta.Description === 'string' ? meta.Description : '',
        size, dataVersion: root.MinecraftDataVersion || null,
      },
      volume, total: blocks, counts,
    };
  }

  /* ---------------------------- vanilla .nbt ------------------------------- */

  function parseVanilla(root) {
    if (!root.palette || !root.blocks) {
      throw new Error('palette/blocksが見つかりません（構造ブロック形式ではありません）');
    }
    if (root.palette.length && typeof root.palette[0] === 'string') {
      throw new Error('古い形式 (Minecraft 1.12以前) の構造ファイルには対応していません。最新バージョンで再保存してください');
    }
    const counts = new Map();
    let blocks = 0;
    for (const b of root.blocks) {
      const idx = b.state | 0;
      const e = root.palette[idx];
      if (!e || typeof e.Name !== 'string') continue;
      if (EXCLUDED.has(e.Name)) continue;
      const id = canonicalId(e.Name);
      if (EXCLUDED.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      blocks++;
    }
    const size = Array.isArray(root.size) ? root.size.map(v => Math.abs(v | 0)) : null;
    return {
      format: 'nbt',
      meta: { name: '', author: '', description: '', size, dataVersion: root.DataVersion || null },
      volume: size ? size[0] * size[1] * size[2] : blocks,
      total: blocks, counts,
    };
  }

  /* ------------------------------ sponge .schem ---------------------------- */

  function decodeVarints(u8) {
    const out = new Array(u8.length); // upper bound
    let n = 0, i = 0;
    while (i < u8.length) {
      let value = 0, shift = 1;
      let b;
      do {
        b = u8[i++];
        value += (b & 0x7F) * shift;
        shift *= 128;
      } while (b & 0x80);
      out[n++] = value;
    }
    return out.slice(0, n);
  }

  function parseSponge(root) {
    const w = root.Width | 0, h = root.Height | 0, l = root.Length | 0;
    if (!root.Palette || !root.BlockData) {
      throw new Error('Palette/BlockDataが見つかりません（.schem v2以降のみ対応）');
    }
    const id2name = new Map();
    for (const name of Object.keys(root.Palette)) {
      id2name.set(root.Palette[name] | 0, name);
    }
    const indices = decodeVarints(root.BlockData);
    const counts = new Map();
    let blocks = 0;
    for (const v of indices) {
      const name = id2name.get(v);
      if (!name || EXCLUDED.has(name)) continue;
      const id = canonicalId(name);
      if (EXCLUDED.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      blocks++;
    }
    return {
      format: 'schem',
      meta: { name: '', author: '', description: '', size: [w, h, l], dataVersion: root.DataVersion || null },
      volume: w * h * l, total: blocks, counts,
    };
  }

  /* ------------------------------ entry point ------------------------------ */

  async function parseFile(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const { value: root } = await NBTRef.parseAuto(u8);
    if (root.Regions && root.Metadata) return parseLitematic(root);
    if (root.palette && root.blocks) return parseVanilla(root);
    if (root.Palette && root.BlockData && root.Width !== undefined) return parseSponge(root);
    throw new Error('対応していないファイル形式です（.litematic / .nbt / .schem に対応しています）');
  }

  const SchemLib = { parseFile, EXCLUDED, WALL_TO_BASE, BLOCK_TO_ITEM, canonicalId, FORMAT_LABEL, parseLitematic, parseVanilla, parseSponge };

  if (typeof module !== 'undefined' && module.exports) module.exports = SchemLib;
  else global.SchemLib = SchemLib;
})(typeof self !== 'undefined' ? self : globalThis);
