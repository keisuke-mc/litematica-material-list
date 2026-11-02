/* 建材リストビューア メインロジック */
(function (g) {
  'use strict';

  /* ============================== utilities ============================== */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => n.toLocaleString('ja-JP');
  const STACK = 64, SHULKER = 1728;

  /* ============================== colors ============================== */
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(r, g2, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g2) + c(b);
  }
  function shade(hex, f) { // f<1 darker, f>1 lighter
    const [r, g2, b] = hexToRgb(hex);
    if (f <= 1) return rgbToHex(r * f, g2 * f, b * f);
    return rgbToHex(r + (255 - r) * (f - 1), g2 + (255 - g2) * (f - 1), b + (255 - b) * (f - 1));
  }
  function adjust(hex, satMul, lightMul) {
    let [r, g2, b] = hexToRgb(hex).map((v) => v / 255);
    const max = Math.max(r, g2, b), min = Math.min(r, g2, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g2 - b) / d + (g2 < b ? 6 : 0)) / 6;
      else if (max === g2) h = ((b - r) / d + 2) / 6;
      else h = ((r - g2) / d + 4) / 6;
    }
    s = Math.max(0, Math.min(1, s * satMul));
    l = Math.max(0, Math.min(1, l * lightMul));
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) { r = g2 = b = l; } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g2 = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g2 * 255, b * 255);
  }
  function hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function hsl(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); };
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }

  /* ============================== icon resolution ============================== */
  const ID = g.ICON_DATA;
  const FAMILY_KEYS = Object.keys(ID.FAMILIES).sort((a, b) => b.length - a.length);
  const COLOR_BLOCK_RE = new RegExp('^(white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(wool|concrete|concrete_powder|terracotta|glazed_terracotta|glass|glass_pane|carpet|bed|banner|wall_banner|candle|shulker_box)$');
  const CROSS_KW = ['sapling', 'tulip', 'dandelion', 'poppy', 'orchid', 'allium', 'bluet', 'daisy', 'cornflower',
    'lily_of_the_valley', 'rose_bush', 'peony', 'lilac', 'sunflower', 'pitcher_plant', 'torchflower', 'wheat',
    'carrots', 'potatoes', 'beetroots', 'sweet_berry', 'cave_vines', 'glow_lichen', 'vine', 'twisting_vines',
    'weeping_vines', 'tall_grass', 'large_fern', 'short_grass', 'fern', 'seagrass', 'kelp', 'sugar_cane',
    'nether_sprouts', 'crimson_roots', 'warped_roots', 'crimson_fungus', 'warped_fungus', 'brown_mushroom',
    'red_mushroom', 'dead_bush', 'pitcher_crop', 'pink_petals', 'eyeblossom', 'mangrove_propagule', 'frogspawn'];

  function detectShape(id) {
    const p = id.split(':')[1] || id;
    if (p.endsWith('_stairs')) return 'stairs';
    if (p.endsWith('_slab')) return 'slab';
    if (p.endsWith('_pane') || p.endsWith('_bars')) return 'pane';
    if (p.endsWith('_carpet') || p.endsWith('_pressure_plate') || p.endsWith('_rug')) return 'plate';
    if (p.endsWith('_door') || p.endsWith('_trapdoor')) return 'door';
    if (p === 'torch' || p.endsWith('_torch') || p === 'candle' || p.endsWith('_candle') ||
        p === 'candles' || p.endsWith('_candles') || p === 'sea_pickle' || p.endsWith('_sea_pickle')) return 'torch';
    if (p === 'chain' || p === 'iron_bars') return 'pane';
    if (p === 'lightning_rod' || p === 'end_rod' || p === 'candle_cake') return 'torch';
    if (!p.endsWith('_block') && !p.endsWith('_path') && CROSS_KW.some((k) => p.includes(k))) return 'cross';
    if (p === 'grass' || p === 'tall_grass' || p === 'large_fern') return 'cross';
    if (p === 'snow' || p.endsWith('_snow') ) return 'plate';
    if (p.endsWith('_button')) return 'plate';
    return 'cube';
  }

  function resolveIcon(id) {
    // returns { shape, top, left, right, alpha, glow }
    const p = id.includes(':') ? id.split(':').slice(1).join(':') : id;
    let base = null, alpha = 1, shape = detectShape(id);

    const sp = ID.SPECIAL[id];
    if (sp) {
      base = { top: sp.top, left: sp.left, right: sp.right };
      return { shape, top: sp.top, left: sp.left, right: sp.right, alpha: sp.alpha || 1 };
    }

    // dyed block families
    const m = p.match(COLOR_BLOCK_RE);
    if (m) {
      let c = ID.DYES[m[1]];
      const mat = m[2];
      if (mat === 'concrete_powder') c = shade(c, 1.16);
      else if (mat === 'terracotta') c = adjust(c, 0.5, 0.82);
      else if (mat === 'glazed_terracotta') c = adjust(c, 1.35, 1.02);
      else if (mat === 'wool' || mat === 'carpet' || mat === 'bed' || mat === 'banner' || mat === 'wall_banner') c = adjust(c, 0.88, 1.02);
      if (mat === 'glass' || mat === 'glass_pane') alpha = 0.62;
      base = c;
    }

    if (base === null) {
      // glass (plain)
      if (p === 'glass' || p === 'tinted_glass') { base = '#d4ebea'; alpha = 0.62; }
      else if (p === 'glass_pane') { base = '#d4ebea'; alpha = 0.62; }
      // logs: bark sides + light top
      else if (/^stripped_/.test(p) && /(_log|_wood|_stem)$/.test(p)) {
        const fam = detectFamily(p.replace('stripped_', ''));
        if (fam) base = ID.FAMILIES[fam].c;
      } else if (/(_log|_stem)$/.test(p) || /_wood$/.test(p)) {
        const fam = detectFamily(p);
        if (fam) {
          const f = ID.FAMILIES[fam];
          const bark = f.b || shade(f.c, 0.62);
          const top = f.t || shade(f.c, 1.22);
          if (/_wood$/.test(p)) return { shape, top: bark, left: shade(bark, 0.92), right: shade(bark, 0.72), alpha };
          return { shape, top, left: bark, right: shade(bark, 0.78), alpha };
        }
      } else {
        const fam = detectFamily(p);
        if (fam) base = ID.FAMILIES[fam].c;
      }
    }

    if (base === null) {
      if (ID.ITEM_COLORS[id]) base = ID.ITEM_COLORS[id];
      else {
        // unknown / modded: deterministic hue
        const hue = hashHue(id);
        base = hsl(hue, 0.34, 0.58);
        return { shape: shape === 'cube' ? 'cube' : shape, top: shade(base, 1.22), left: base, right: shade(base, 0.7), alpha };
      }
    }

    const top = typeof base === 'string' ? shade(base, 1.2) : base.top;
    const left = typeof base === 'string' ? base : base.left;
    const right = typeof base === 'string' ? shade(base, 0.72) : base.right;
    return { shape, top, left, right, alpha };
  }

  function detectFamily(p) {
    for (const k of FAMILY_KEYS) {
      if (p.includes(k)) return k;
    }
    return null;
  }

  /* ============================== SVG icons ============================== */
  // isometric projection of unit coordinates (0..1)
  const PX = (x, z) => (16 + (x - z) * 12.6).toFixed(2);
  const PY = (x, y, z) => (3.4 + (x + z) * 6.5 + (1 - y) * 12.6).toFixed(2);
  const pts = (arr) => arr.map((a) => a.join(',')).join(' ');

  function boxPolys(x0, y0, z0, x1, y1, z1) {
    return {
      top: [[PX(x0, z0), PY(x0, y1, z0)], [PX(x1, z0), PY(x1, y1, z0)], [PX(x1, z1), PY(x1, y1, z1)], [PX(x0, z1), PY(x0, y1, z1)]],
      left: [[PX(x0, z1), PY(x0, y1, z1)], [PX(x1, z1), PY(x1, y1, z1)], [PX(x1, z1), PY(x1, y0, z1)], [PX(x0, z1), PY(x0, y0, z1)]],
      right: [[PX(x1, z0), PY(x1, y1, z0)], [PX(x1, z1), PY(x1, y1, z1)], [PX(x1, z1), PY(x1, y0, z1)], [PX(x1, z0), PY(x1, y0, z0)]],
    };
  }
  function polyStr(poly, fill, alpha) {
    return `<polygon points="${pts(poly)}" fill="${fill}"${alpha < 1 ? ` opacity="${alpha}"` : ''} stroke="rgba(0,0,0,.38)" stroke-width="0.45" stroke-linejoin="round"/>`;
  }

  const iconCache = new Map();
  function iconSVG(id, opts) {
    const key = id;
    if (iconCache.has(key)) return iconCache.get(key);
    const ic = resolveIcon(id);
    const a = ic.alpha;
    let inner = '';

    function drawBox(x0, y0, z0, x1, y1, z1, colors) {
      const b = boxPolys(x0, y0, z0, x1, y1, z1);
      return polyStr(b.top, colors.top || ic.top, a) + polyStr(b.left, colors.left || ic.left, a) + polyStr(b.right, colors.right || ic.right, a);
    }

    switch (ic.shape) {
      case 'slab':
        inner = drawBox(0, 0, 0, 1, 0.55, 1, {});
        break;
      case 'stairs':
        inner = drawBox(0, 0, 0, 1, 1, 0.5, {}) + drawBox(0, 0, 0.5, 1, 0.55, 1, {});
        break;
      case 'pane':
      case 'door':
        inner = drawBox(0.06, 0, 0.42, 0.94, 1, 0.58, {});
        break;
      case 'plate':
        inner = drawBox(0.02, 0, 0.02, 0.98, 0.16, 0.98, {});
        break;
      case 'cross':
        inner = drawBox(0.2, 0, 0.42, 0.8, 1, 0.58, { top: ic.left, right: ic.left }) +
                drawBox(0.42, 0, 0.2, 0.58, 1, 0.8, { top: shade(ic.left, 1.1), right: ic.left });
        break;
      case 'torch': {
        inner = drawBox(0.4, 0, 0.4, 0.6, 0.68, 0.6, {}) +
          drawBox(0.36, 0.68, 0.36, 0.64, 0.92, 0.64, { top: ic.top, left: shade(ic.top, 0.86), right: shade(ic.top, 0.78) });
        break;
      }
      case 'flat': {
        inner = `<rect x="5" y="5" width="22" height="22" rx="4.5" fill="${ic.left}" stroke="rgba(0,0,0,.4)" stroke-width="0.6"/>` +
          `<rect x="7.5" y="7.5" width="17" height="17" rx="3" fill="${ic.top}" opacity=".55"/>`;
        break;
      }
      default: // cube
        inner = drawBox(0, 0, 0, 1, 1, 1, {});
    }
    const svg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(displayName(id))}">${inner}</svg>`;
    iconCache.set(key, svg);
    return svg;
  }

  /* ============================== names ============================== */
  const NAMES = g.NAMES || {};
  const IS_ITEM = g.IS_ITEM || {};
  const NOTES = g.ITEM_NOTES || {};
  const RECIPES = g.RECIPES || {};

  function displayName(id) {
    if (NAMES[id]) return NAMES[id];
    const p = id.includes(':') ? id.split(':').slice(1).join(':') : id;
    // wall variants fall back to the standing block name
    let alt = null;
    if (p.endsWith('_wall_banner')) alt = id.replace('_wall_banner', '_banner');
    else if (p.endsWith('_wall_sign')) alt = id.replace('_wall_sign', '_sign');
    else if (p.endsWith('_wall_skull')) alt = id.replace('_wall_skull', '_skull');
    else if (p.endsWith('_wall_head')) alt = id.replace('_wall_head', '_head');
    else if (p === 'wall_torch') alt = 'minecraft:torch';
    else if (p === 'soul_wall_torch') alt = 'minecraft:soul_torch';
    else if (p === 'redstone_wall_torch') alt = 'minecraft:redstone_torch';
    if (alt && NAMES[alt]) return NAMES[alt];
    return p;
  }
  function nameWithFallback(id) {
    const n = displayName(id);
    const p = id.includes(':') ? id.split(':').slice(1).join(':') : id;
    return { name: n, known: !!NAMES[id] || n !== p, path: p };
  }

  /* ============================== recipes ============================== */
  function recipeIngredients(v) { // Map id->count
    const m = new Map();
    if (v.g) {
      for (const row of v.g) for (const c of row) if (c) m.set(c, (m.get(c) || 0) + 1);
    } else if (v.u) {
      for (const c of v.u) m.set(c, (m.get(c) || 0) + 1);
    } else if (v.i) {
      m.set(v.i, 1);
    }
    return m;
  }
  const TYPE_ORDER = { c: 0, s: 1, k: 2 };
  function variantsOf(id) {
    const list = RECIPES[id] || [];
    return list.slice().sort((a, b) => (TYPE_ORDER[a.t] ?? 9) - (TYPE_ORDER[b.t] ?? 9));
  }
  function pickBest(id) { // most material-efficient recipe (for raw expansion)
    const list = RECIPES[id] || [];
    let best = null, bestScore = Infinity;
    for (const v of list) {
      const ings = recipeIngredients(v);
      let total = 0;
      for (const n of ings.values()) total += n;
      const score = total / (v.o || 1);
      if (score < bestScore - 1e-9) { bestScore = score; best = v; }
    }
    return best;
  }
  function expandRaw(id, count) {
    const mats = new Map();
    let smelts = 0;
    const add = (k, n) => mats.set(k, (mats.get(k) || 0) + n);
    const path = new Set();
    (function rec(cid, n) {
      if (path.has(cid) || path.size >= 10) { add(cid, n); return; }
      const v = pickBest(cid);
      if (!v) { add(cid, n); return; }
      path.add(cid);
      const crafts = Math.ceil(n / (v.o || 1));
      if (v.t === 's') smelts += crafts;
      for (const [iid, per] of recipeIngredients(v)) rec(iid, crafts * per);
      path.delete(cid);
    })(id, count);
    return { mats, smelts };
  }

  /* ============================== あいうえお順: 読み仮名ソートキー ==============================
   * 日本語名が漢字で始まる場合、先頭の読み仮名に変換してから照合します（公式の日本語名に合わせて手動整備）。
   * 例: 石レンガ → せきれんが…、丸石 → まるいし…
   */
  const YOMI = {
    '錆止めされた': 'さびどめされた', '錆びた': 'さびた', '錆': 'さび',
    '壁に付けられた': 'かべにつけられた', '壁付き': 'かべつき',
    '磨かれた': 'みがかれた', '歪んだ': 'ゆがんだ', '真紅': 'しんく',
    '赤紫色': 'あかむらさきいろ', '赤色': 'あかいろ', '赤い': 'あかい',
    '樹皮を剥いだ': 'じゅひをはいだ', '茶色': 'ちゃいろ', '桃色': 'ももいろ',
    '橙色': 'だいだいいろ', '白色': 'しろいろ', '死んだ': 'しんだ',
    '酸化した': 'さんかした', '青緑色': 'あおみどりいろ', '青色': 'あおいろ',
    '青氷': 'あおこおり', '風化した': 'ふうかした', '灰色': 'はいいろ',
    '空色': 'そらいろ', '空気': 'くうき', '竹細工': 'たけざいく', '竹入り': 'たけいり',
    '竹': 'たけ', '紫色': 'むらさきいろ', '緑色': 'みどりいろ', '薄灰色': 'うすはいいろ',
    '薄氷': 'うすごおり', '黄緑色': 'きみどりいろ', '黄色': 'きいろ',
    '黄土色': 'おうどいろ', '黒色': 'くろいろ', '黒曜石': 'こくようせき',
    '模様入り': 'もよういり', '深層岩': 'しんそうがん', '深層石炭': 'しんそうせきたん',
    '深層金鉱': 'しんそうきんこう', '深層鉄鉱': 'しんそうてつこう', '深層銅鉱': 'しんそうどうこう',
    '深層': 'しんそう', '滑らかな': 'なめらかな', '銅塊': 'どうかい', '銅格子': 'どうごうし',
    '銅鉱石': 'どうこうせき', '銅': 'どう', '苔': 'こけ', '石切台': 'いしぎりだい',
    '石レンガ': 'せきれんが', '石炭鉱石': 'せきたんこうせき', '石炭': 'せきたん',
    '石化した': 'せっかした', '石英': 'せきえい', '石灰': 'せっかい', '石': 'いし',
    '凝灰岩': 'ぎょうがん', '鉄塊': 'てっかい', '鉄格子': 'てつごうし', '鉄鉱石': 'てつこうせき',
    '鉄': 'てつ', '樹脂': 'じゅし', '泥': 'どろ', '金床': 'かなとこ', '金塊': 'きんかい',
    '金鉱石': 'きんこうせき', '金': 'きん', '背の低い': 'せのひくい',
    '表皮を剥いだ': 'ひょうひをはいだ', '丸石': 'まるいし', '大きな': 'おおきな',
    '安山岩': 'あんざんがん', '砂岩': 'さがん', '研がれた': 'とがれた',
    '花崗岩': 'かこうがん', '虫食い': 'むしくい', '閃緑岩': 'せんりょくがん',
    '魂': 'たましい', '乾燥した': 'かんそうした', '切り込み入り': 'きりこみいり',
    '洞窟': 'どうくつ', '色あせた': 'いろあせた', '開花した': 'かいかした',
    '土の道': 'どのみち', '土': 'つち', '実がなった': 'みがなった', '小さな': 'ちいさな',
    '怪しげな': 'あやしげな', '枯れ木': 'かれき', '鍾乳石': 'しょうにゅうせき',
    '閉じた': 'とじた', '開いた': 'ひらいた', '雪玉': 'ゆきだま', '雪': 'ゆき',
    '骨粉': 'こっぷん', '骨': 'ほね', '中くらいの': 'なかくらいの', '作動中': 'さどうちゅう',
    '作業台': 'さぎょうだい', '卵': 'たまご', '古代の': 'こだいの', '固めた': 'かためた',
    '垂れ根': 'たれね', '壊れかけ': 'こわれかけ', '大釜': 'おおがま', '奈落': 'ならく',
    '宝物庫': 'ほうもつこ', '小麦': 'こむぎ', '岩盤': 'がんばん', '干草': 'ほしくさ',
    '弓': 'ゆみ', '強化された': 'きょうかされた', '新緑色': 'しんりょくいろ',
    '方解石': 'ほうかいせき', '日照': 'にっしょう', '書見台': 'しょみだい', '木炭': 'もくたん',
    '本棚': 'ほんだな', '本': 'ほん', '松明': 'たいまつ', '根付いた': 'ねついた',
    '桜色': 'さくらいろ', '棒': 'ぼう', '植木鉢': 'うえきばち', '樽': 'たる',
    '機織り機': 'はたおりき', '欠けた': 'かけた', '気泡柱': 'きほうちゅう',
    '水入り': 'みずいり', '水': 'みず', '氷塊': 'ひょうかい', '氷': 'こおり',
    '泣く': 'なく', '海洋': 'かいよう', '海草': 'かいそう', '溶岩入り': 'ようがんいり',
    '溶岩': 'ようがん', '溶鉱炉': 'ようこうろ', '濡れた': 'ぬれた', '火打石': 'ひうちいし',
    '火薬': 'かやく', '炎': 'ほのお', '焚き火': 'たきび', '焼いた': 'やいた',
    '燻製器': 'くんせいき', '玄武岩': 'げんぶがん', '的': 'まと', '真珠色': 'しんじゅいろ',
    '矢細工台': 'やさいくだい', '砂利': 'じゃり', '砂糖': 'さとう', '砂': 'すな',
    '砥石': 'といし', '粉雪入り': 'こなゆきいり', '粉雪': 'こなゆき', '粗い': 'あらい',
    '粘土玉': 'ねんだま', '粘土': 'ねんど', '粘着': 'ねんちゃく', '糸': 'いと',
    '紙': 'かみ', '耕地': 'こうち', '胞子': 'ほうし', '自動作業台': 'じどうさぎょうだい',
    '芽生えた': 'めばえた', '茂み': 'しげみ', '草': 'くさ', '菌糸': 'きんし',
    '落ち葉': 'おちば', '製図台': 'せいずだい', '試練': 'しれん', '調律された': 'ちょうりつされた',
    '足場': 'あしば', '軽量用': 'けいりょうよう', '遮光': 'しゃこう', '避雷針': 'ひらいしん',
    '醸造台': 'じょうぞうだい', '重量用': 'じゅうりょうよう', '野花': 'のばな',
    '鍛冶台': 'かじだい', '鐘': 'かね', '革': 'かわ', '音符': 'おんぷ',
    '飾り壺': 'かざりつぼ', '養蜂箱': 'ようほうばこ',
  };
  const YOMI_KEYS = Object.keys(YOMI).sort((a, b) => b.length - a.length);
  function nameSortKey(name) {
    for (const p of YOMI_KEYS) {
      if (name.startsWith(p)) return YOMI[p] + name.slice(p.length);
    }
    return name;
  }
  function cmpNames(a, b) {
    return nameSortKey(a).localeCompare(nameSortKey(b), 'ja');
  }

  /* ============================== state ============================== */
  const state = {
    fileName: '', meta: null, items: [], total: 0,
    sortKey: 'count', sortDir: -1, filter: '',
    restoredFrom: null,
  };

  /* ============================== formatting ============================== */
  function stackFmt(c) {
    const s = Math.floor(c / STACK), r = c % STACK;
    if (s === 0) return String(r);
    return r === 0 ? s + 'st' : s + 'st+' + r;
  }
  function shulkerFmt(c) {
    if (c === 0) return '0';
    const b = Math.floor(c / SHULKER), r = c % SHULKER;
    if (b > 0) return r === 0 ? b + '箱' : b + '箱+' + fmt(r);
    return (c / SHULKER).toFixed(2) + '箱';
  }

  /* ============================== rendering ============================== */
  function render() {
    const items = state.items;
    $('#result-section').hidden = false;
    // summary
    $('#fs-name').textContent = state.fileName || (state.meta && state.meta.name) || '設計図';
    const metaBits = [];
    if (state.meta) {
      const m = state.meta;
      if (m.name) metaBits.push('設計図名: ' + m.name);
      if (m.author) metaBits.push('作成者: ' + m.author);
      if (m.size) metaBits.push('サイズ: ' + m.size.join(' × '));
      metaBits.push('形式: ' + (g.SchemLib.FORMAT_LABEL[state.format] || state.format));
      if (state.restoredFrom) metaBits.push('履歴から表示 (' + state.restoredFrom + ')');
    }
    $('#fs-meta').textContent = metaBits.join(' ／ ');
    // stats
    const total = items.reduce((a, b) => a + b.count, 0);
    state.total = total;
    $('#stat-total').textContent = fmt(total);
    $('#stat-kinds').textContent = fmt(items.length);
    $('#stat-stacks').textContent = stackFmt(total) + ' (' + (total / STACK).toFixed(1) + ')';
    $('#stat-shulkers').textContent = shulkerFmt(total) + ' (' + (total / SHULKER).toFixed(2) + ')';

    sortItems();
    renderRows();
    updateSortHeaders();
  }

  function visibleItems() {
    if (!state.filter) return state.items;
    const f = state.filter.toLowerCase();
    return state.items.filter((it) =>
      it.name.toLowerCase().includes(f) || it.id.toLowerCase().includes(f));
  }

  function sortItems() {
    const { sortKey, sortDir } = state;
    state.items.sort((a, b) => {
      let r;
      if (sortKey === 'name') r = cmpNames(a.name, b.name);
      else r = a.count - b.count; // count / stack / shulker share the same ordering
      if (r === 0) r = cmpNames(a.name, b.name);
      return r * sortDir;
    });
  }

  function renderRows() {
    const rows = visibleItems();
    const html = rows.map((it) => {
      const nm = nameWithFallback(it.id);
      const sub = nm.known ? '' : `<small class="item-id">${esc(it.id)}</small>`;
      const stackTitle = `${fmt(it.count)}個 = ${Math.floor(it.count / STACK)}スタック + ${it.count % STACK}個`;
      const shTitle = `${fmt(it.count)}個 = ${(it.count / SHULKER).toFixed(3)}シュルカーボックス (${Math.floor(it.count / SHULKER)}箱 + ${fmt(it.count % SHULKER)}個)`;
      return `<tr data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(nm.name)} ${fmt(it.count)}個">
        <td><div class="item-cell"><div class="item-slot">${iconSVG(it.id)}</div><div class="item-name">${esc(nm.name)}${sub}</div></div></td>
        <td class="col-num">${fmt(it.count)}</td>
        <td class="col-num" title="${stackTitle}">${stackFmt(it.count)}</td>
        <td class="col-num" title="${shTitle}">${shulkerFmt(it.count)}</td>
      </tr>`;
    }).join('');
    $('#mat-body').innerHTML = html;

    // footer totals (all items, not filtered)
    const total = state.total;
    $('#tfoot-kinds').textContent = `(${fmt(state.items.length)}種類)`;
    $('#tfoot-total').textContent = fmt(total);
    $('#tfoot-stack').textContent = stackFmt(total);
    $('#tfoot-shulker').textContent = shulkerFmt(total);

    const filterInfo = state.filter ? ` — 「${esc(state.filter)}」で絞り込み中: ${fmt(rows.length)}件` : '';
    const note = $('.table-note');
    if (note) note.dataset.base = note.dataset.base || note.innerHTML;
  }

  function updateSortHeaders() {
    document.querySelectorAll('.th-sortable').forEach((th) => {
      const arrow = th.querySelector('.sort-arrow');
      if (th.dataset.sort === state.sortKey) {
        th.classList.add('sorted');
        arrow.textContent = state.sortDir === 1 ? '▲' : '▼';
        th.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
      } else {
        th.classList.remove('sorted');
        arrow.textContent = '↕';
        th.setAttribute('aria-sort', 'none');
      }
    });
  }

  /* ============================== tooltip ============================== */
  const tooltip = $('#tooltip');
  let tooltipItem = null, hideTimer = null, showTimer = null;

  function iconCellHTML(id, cls) {
    const nm = displayName(id);
    return `<div class="tt-gridcell has" title="${esc(nm)}">${iconSVG(id)}</div>`;
  }

  function buildTooltipHTML(id, count) {
    const nm = nameWithFallback(id);
    const parts = [];
    parts.push(`<div class="tt-title"><div class="item-slot">${iconSVG(id)}</div>
      <div><div class="tt-name">${esc(nm.name)}${nm.known ? '' : ' <small style="color:var(--text-dim)">(' + esc(nm.path) + ')</small>'}</div>
      <div><span class="tt-count">${fmt(count)}個</span> <span style="color:var(--text-dim)">= ${stackFmt(count)} = ${(count / SHULKER).toFixed(2)}箱</span></div></div></div>`);

    const variants = variantsOf(id);
    if (!variants.length) {
      parts.push(`<div class="tt-section"><div class="tt-section-title">クラフトレシピ</div>
        <p class="tt-none">クラフトでは作れません${NOTES[id] ? '' : '（採掘・交換・ドロップなどで入手）'}</p></div>`);
      if (NOTES[id]) parts.push(`<div class="tt-note">💡 ${esc(NOTES[id])}</div>`);
      return parts.join('');
    }

    parts.push('<div class="tt-section"><div class="tt-section-title">クラフトレシピ</div>');
    for (const v of variants) {
      const crafts = Math.ceil(count / (v.o || 1));
      let head = '';
      let body = '';
      if (v.t === 'c') {
        head = '<span class="tt-badge b-craft">作業台</span>';
        let cells = '';
        if (v.g) {
          const tall = v.g.length === 3 && v.g[0].length === 2;
          for (let r = 0; r < v.g.length; r++) for (let c = 0; c < v.g[r].length; c++) {
            const cell = v.g[r][c];
            cells += cell ? iconCellHTML(cell) : '<div class="tt-gridcell"></div>';
          }
          body = `<div class="tt-grid${tall ? ' tall' : ''}" style="grid-template-columns:repeat(${v.g[0].length},24px)">${cells}</div>`;
        } else {
          const cols = v.u.length > 4 ? 3 : Math.min(v.u.length, 3);
          for (const ing of v.u) cells += iconCellHTML(ing);
          body = `<div class="tt-grid" style="grid-template-columns:repeat(${cols},24px)">${cells}</div>`;
        }
        body += `<span class="tt-arrow">→</span><div class="tt-result">${iconCellHTML(id)}<span class="tt-resnum">×${v.o}</span></div>`;
      } else if (v.t === 's') {
        head = '<span class="tt-badge b-smelt">かまど</span>';
        body = `${iconCellHTML(v.i)}<span class="tt-arrow">🔥→</span><div class="tt-result">${iconCellHTML(id)}<span class="tt-resnum">×${v.o}</span></div>`;
      } else {
        head = '<span class="tt-badge b-cut">石切台</span>';
        body = `${iconCellHTML(v.i)}<span class="tt-arrow">🪚→</span><div class="tt-result">${iconCellHTML(id)}<span class="tt-resnum">×${v.o}</span></div>`;
      }
      // ingredients for the full count
      const ings = recipeIngredients(v);
      const ingRows = [];
      for (const [iid, per] of ings) {
        const iname = displayName(iid);
        ingRows.push(`<div class="tt-ing">${iconCellHTML(iid)}<span class="tt-ing-name">${esc(iname)}</span><span class="tt-ing-count">× ${fmt(crafts * per)}</span></div>`);
      }
      parts.push(`<div class="tt-variant"><div class="tt-variant-head">${head}<span class="yield">${v.t === 's' ? '精錬' : v.t === 'k' ? '石切' : 'クラフト'} ${fmt(crafts)}回分</span></div>
        <div class="tt-craftrow">${body}</div>
        <div class="tt-needs"><div class="tt-needs-title">${fmt(count)}個全部を作るのに必要な素材</div><div class="tt-ings">${ingRows.join('')}</div></div></div>`);
    }
    parts.push('</div>');

    // raw material expansion
    const { mats, smelts } = expandRaw(id, count);
    const direct = new Map();
    for (const v of [pickBest(id)]) if (v) for (const [iid, per] of recipeIngredients(v)) direct.set(iid, Math.ceil(count / (v.o || 1)) * per);
    const sameAsDirect = mats.size === direct.size && [...mats.entries()].every(([k, n]) => direct.get(k) === n);
    const matsArr = [...mats.entries()].filter(([k, n]) => !(n === count && k === id)).sort((a, b) => b[1] - a[1]);
    if (matsArr.length && !sameAsDirect) {
      const rows = matsArr.slice(0, 12).map(([iid, n]) =>
        `<div class="tt-ing">${iconCellHTML(iid)}<span class="tt-ing-name">${esc(displayName(iid))}</span><span class="tt-ing-count">× ${fmt(n)}</span></div>`).join('');
      let smeltInfo = '';
      if (smelts > 0) smeltInfo = `<div class="tt-smeltinfo">🔥 精錬 ${fmt(smelts)}回ぶん必要（石炭 ${fmt(Math.ceil(smelts / 8))}個が目安）</div>`;
      parts.push(`<div class="tt-section"><div class="tt-section-title">素材を展開した原材料の目安</div><div class="tt-ings tt-raws">${rows}</div>${smeltInfo}</div>`);
    }
    if (NOTES[id]) parts.push(`<div class="tt-note">💡 ${esc(NOTES[id])}</div>`);
    return parts.join('');
  }

  function showTooltip(id, count, x, y) {
    tooltip.innerHTML = buildTooltipHTML(id, count);
    tooltip.hidden = false;
    positionTooltip(x, y);
    requestAnimationFrame(() => tooltip.classList.add('show'));
  }
  function positionTooltip(x, y) {
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let px = x + 18, py = y + 20;
    if (px + w > vw - 8) px = x - w - 16;
    if (px < 8) px = 8;
    if (py + h > vh - 8) py = y - h - 14;
    if (py < 8) py = 8;
    tooltip.style.left = px + 'px';
    tooltip.style.top = py + 'px';
  }
  function hideTooltip() {
    tooltip.classList.remove('show');
    tooltipItem = null;
    setTimeout(() => { if (!tooltipItem) tooltip.hidden = true; }, 130);
  }

  function wireTooltip() {
    const body = $('#mat-body');
    body.addEventListener('mouseover', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const it = state.items.find((i) => i.id === id);
      if (!it) return;
      if (tooltipItem === id) return;
      clearTimeout(showTimer); clearTimeout(hideTimer);
      showTimer = setTimeout(() => {
        tooltipItem = id;
        showTooltip(id, it.count, e.clientX, e.clientY);
      }, 140);
    });
    body.addEventListener('mousemove', (e) => {
      if (tooltipItem) positionTooltip(e.clientX, e.clientY);
    });
    body.addEventListener('mouseleave', () => {
      clearTimeout(showTimer);
      hideTimer = setTimeout(hideTooltip, 120);
    });
    body.addEventListener('mouseover', (e) => {
      if (!e.target.closest('tr[data-id]')) { clearTimeout(showTimer); }
    });
    // touch: tap row toggles
    let lastTapId = null;
    body.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const it = state.items.find((i) => i.id === id);
      if (!it) return;
      if (tooltipItem === id && lastTapId === id) { hideTooltip(); lastTapId = null; return; }
      lastTapId = id;
      clearTimeout(showTimer);
      tooltipItem = id;
      showTooltip(id, it.count, e.clientX || window.innerWidth / 2, e.clientY || 200);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });
    window.addEventListener('scroll', () => hideTooltip(), { passive: true });
  }

  /* ============================== history (cookies) ============================== */
  const HKEY = 'litemat_history';
  const ID_INDEX = Object.keys(NAMES);

  function cookieWorks() {
    try {
      document.cookie = '__t=1; SameSite=Lax; path=/';
      const ok = document.cookie.includes('__t=1');
      document.cookie = '__t=; Max-Age=0; path=/';
      return ok;
    } catch (e) { return false; }
  }
  const USE_COOKIE = cookieWorks();

  function readHistory() {
    // cookie first, then localStorage fallback
    const fromCookie = (() => {
      const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + HKEY + '=([^;]*)'));
      if (!m) return null;
      try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
    })();
    if (fromCookie && fromCookie.length) return fromCookie;
    try {
      const s = localStorage.getItem(HKEY);
      if (s) return JSON.parse(s);
    } catch (e) { /* ignore */ }
    return [];
  }
  function writeHistory(entries) {
    const prune = (list) => {
      let json = JSON.stringify(list);
      while (encodeURIComponent(json).length > 3800 && list.length) {
        // drop item detail of the oldest first, then entries
        if (list.length > 1 && list[list.length - 1].i) delete list[list.length - 1].i;
        else list.pop();
        json = JSON.stringify(list);
      }
      return list;
    };
    entries = prune(entries);
    if (USE_COOKIE) {
      document.cookie = `${HKEY}=${encodeURIComponent(JSON.stringify(entries))}; Max-Age=31536000; SameSite=Lax; path=/`;
    }
    try { localStorage.setItem(HKEY, JSON.stringify(entries)); } catch (e) { /* ignore */ }
  }
  function compactItems(items) {
    return items.map((it) => {
      const idx = ID_INDEX.indexOf(it.id);
      return (idx >= 0 ? String(idx) : it.id) + ':' + it.count;
    }).join(',');
  }
  function parseCompactItems(str) {
    if (!str) return null;
    const out = [];
    for (const part of str.split(',')) {
      const ci = part.lastIndexOf(':');
      if (ci < 0) continue;
      const key = part.slice(0, ci), cnt = parseInt(part.slice(ci + 1), 10);
      if (!cnt || cnt < 0) continue;
      const id = /^\d+$/.test(key) ? (ID_INDEX[+key] || null) : key;
      if (id) out.push({ id, count: cnt });
    }
    return out;
  }
  function pushHistory(fileName, meta, items, total) {
    if (!fileName) return;
    let entries = readHistory().filter((e) => e.n !== fileName);
    entries.unshift({
      n: fileName.slice(0, 80), d: Date.now(), t: total,
      k: items.length, i: compactItems(items),
    });
    if (entries.length > 12) entries = entries.slice(0, 12);
    writeHistory(entries);
    renderHistory();
  }
  function renderHistory() {
    const entries = readHistory();
    const list = $('#history-list');
    const empty = $('#history-empty');
    empty.style.display = entries.length ? 'none' : 'block';
    list.innerHTML = entries.map((e, i) => {
      const date = new Date(e.d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const canRestore = !!(e.i && parseCompactItems(e.i));
      return `<li class="history-item" data-idx="${i}">
        <div class="hi-main"><div class="hi-name">${esc(e.n)}</div>
        <div class="hi-sub">${esc(date)} ／ ${fmt(e.t || 0)}ブロック・${fmt(e.k || 0)}種類${USE_COOKIE ? '' : '（ブラウザ保存）'}</div></div>
        <div class="hi-actions">
          <button type="button" class="btn btn-ghost btn-mini hi-restore" ${canRestore ? '' : 'disabled'}>表示</button>
          <button type="button" class="hi-delete" title="この履歴を削除" aria-label="削除">✕</button>
        </div></li>`;
    }).join('');
    list.querySelectorAll('.hi-restore').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const idx = +ev.target.closest('.history-item').dataset.idx;
        const e = readHistory()[idx];
        if (!e || !e.i) return;
        const items = parseCompactItems(e.i);
        if (!items) return;
        const map = new Map();
        for (const it of items) map.set(it.id, it.count);
        applyResult(map, e.n, { name: '', author: '', description: '', size: null, dataVersion: null }, 'litematic');
        state.restoredFrom = new Date(e.d).toLocaleString('ja-JP');
        render();
        showInfo(`履歴「${esc(e.n)}」を表示しました。最新の集計をするには再度アップロードしてください。`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    list.querySelectorAll('.hi-delete').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const idx = +ev.target.closest('.history-item').dataset.idx;
        const entries = readHistory();
        entries.splice(idx, 1);
        writeHistory(entries);
        renderHistory();
      });
    });
  }

  /* ============================== file handling ============================== */
  function showError(msg) {
    const box = $('#error-box');
    box.textContent = msg;
    box.hidden = false;
    $('#info-box').hidden = true;
  }
  function showInfo(msg) {
    const box = $('#info-box');
    box.innerHTML = msg;
    box.hidden = false;
    $('#error-box').hidden = true;
  }
  function clearAlerts() { $('#error-box').hidden = true; $('#info-box').hidden = true; }

  function applyResult(countsMap, fileName, meta, format) {
    const items = [...countsMap.entries()].map(([id, count]) => {
      const nm = nameWithFallback(id);
      return { id, count, name: nm.name, known: nm.known };
    });
    items.sort((a, b) => b.count - a.count);
    state.items = items;
    state.fileName = fileName;
    state.meta = meta;
    state.format = format;
    state.filter = '';
    $('#filter-input').value = '';
    state.restoredFrom = null;
  }

  async function handleBytes(bytes, fileName, opts) {
    opts = opts || {};
    clearAlerts();
    showInfo('⏳ 設計図を解析しています…');
    await new Promise((r) => setTimeout(r, 20)); // let the message paint
    try {
      if (/\.schematic$/i.test(fileName)) {
        throw new Error('古い MCEdit 形式 (.schematic) には対応していません。WorldEdit の .schem に変換するか、Litematica で保存し直してください');
      }
      const t0 = performance.now();
      const result = await g.SchemLib.parseFile(bytes);
      const ms = Math.round(performance.now() - t0);
      if (result.total === 0 && result.counts.size === 0) {
        throw new Error('ブロックが見つかりませんでした。空気のみの設計図の可能性があります');
      }
      applyResult(result.counts, fileName, result.meta, result.format);
      render();
      const info = `✅ 解析完了 (${ms}ms) — ${fmt(result.total)}ブロック・${fmt(result.counts.size)}種類` +
        (opts.isSample ? '（サンプル）' : '');
      showInfo(info);
      if (!opts.isSample && !opts.isRestore) pushHistory(fileName, result.meta, state.items, result.total);
      $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      console.error(err);
      let msg = err && err.message ? err.message : 'ファイルの解析に失敗しました';
      if (/NBTデコードエラー|ルートがCompound|gzip|JSON/.test(msg)) {
        msg = 'ファイル形式を認識できませんでした。Litematica (.litematic)・バニラ構造 (.nbt)・WorldEdit (.schem) 形式のファイルかどうかご確認ください';
      }
      showError('❌ ' + msg);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await handleBytes(bytes, file.name);
  }

  /* ============================== events ============================== */
  function wireEvents() {
    const dz = $('#dropzone');
    const input = $('#file-input');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    $('#btn-browse').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handleFile(input.files[0]); input.value = ''; });

    ['dragenter', 'dragover'].forEach((ev) => {
      dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) handleFile(files[0]);
    });

    $('#btn-sample').addEventListener('click', async () => {
      try {
        const b64 = g.SAMPLE_B64;
        if (!b64) throw new Error('サンプルファイルが見つかりません');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        await handleBytes(bytes, 'sample.litematic（サンプルの小屋）', { isSample: true });
      } catch (err) {
        showError('❌ サンプルの読み込みに失敗しました: ' + err.message);
      }
    });

    document.querySelectorAll('.th-sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir *= -1;
        } else {
          state.sortKey = key;
          state.sortDir = key === 'name' ? 1 : -1;
        }
        sortItems(); renderRows(); updateSortHeaders();
      });
    });

    let filterTimer = null;
    $('#filter-input').addEventListener('input', (e) => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => { state.filter = e.target.value.trim(); renderRows(); }, 120);
    });

    $('#btn-clear-history').addEventListener('click', () => {
      writeHistory([]);
      renderHistory();
    });
  }

  /* ============================== init ============================== */
  document.addEventListener('DOMContentLoaded', () => {
    wireEvents();
    wireTooltip();
    renderHistory();
    if (!USE_COOKIE) {
      const note = document.querySelector('.history-note');
      if (note) note.textContent = 'この環境ではクッキーが使えないため localStorage に保存されます（GitHub Pages 上ではクッキーに保存されます）';
    }
  });
})(typeof self !== 'undefined' ? self : globalThis);
