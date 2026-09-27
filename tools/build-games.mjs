// ============================================================================
// 游戏库数据构建脚本
//
//   1. 读取 games.config.json（用户可自由编辑的清单）
//   2. 按 key 抓取封面到 covers/<key>.<ext>
//        · cover 字段：直链或本地路径
//        · appid 字段：Steam 官方 header 图，并抓取中英文资料
//        · 都没有 / 抓取失败：沿用已有封面，或生成一张 SVG 占位封面
//   3. 写出 js/games.js（window.GAMES / window.GENRES，供页面双击直接打开）
//
// 运行：node tools/build-games.mjs
//
// 关于证书：部分机器（装了抓包/安全软件的证书链）会让 Node 默认不信任
// HTTPS 证书。脚本检测到这类错误时会自动带 --use-system-ca 重新执行一次，
// 无需手动加参数。
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coversDir = resolve(root, 'covers');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; GameBoard/1.0; local static page)' };

mkdirSync(coversDir, { recursive: true });

/* ---------------------------------------------------------------- 证书兼容 */

const isCertError = (err) => {
  const text = `${err?.message || ''} ${err?.cause?.message || ''}`;
  return /certificate|UNABLE_TO_VERIFY|self.signed|CERT_/i.test(text);
};
const hasSystemCaFlag = process.execArgv.includes('--use-system-ca') || /--use-system-ca/.test(process.env.NODE_OPTIONS || '');
const netState = { certFailure: false };

/* ----------------------------------------------------------- 小工具 */

// Windows PowerShell 写出的 JSON 可能带 UTF-8 BOM
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripHtml = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

async function get(url, { as = 'text', timeout = 25000 } = {}) {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.httpStatus = res.status;
      throw err;
    }
    return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
  } catch (err) {
    if (isCertError(err)) netState.certFailure = true;
    throw err;
  }
}

/* ------------------------------------------------- 图片校验（避免坏封面） */

function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'GIF') {
    return { type: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { type: 'webp', w: 0, h: 0 };
  }
  return null;
}

function validImage(buf) {
  const size = imageSize(buf);
  if (!size) return false;
  if (buf.length < 2048) return false;              // 明显是错误页 / 空图
  if (size.w === 1 && size.h === 1) return false;   // 常见的 1x1 占位像素
  return true;
}

/* --------------------------------------------- 占位封面（抓不到时兜底） */

const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
));

function placeholderSvg({ label, title, accent }) {
  const sub = title && title !== label ? title : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215" viewBox="0 0 460 215">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1a1d"/>
      <stop offset="1" stop-color="#0b0b0d"/>
    </linearGradient>
  </defs>
  <rect width="460" height="215" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.05">
    ${Array.from({ length: 9 }, (_, i) => `<line x1="${(i + 1) * 46}" y1="0" x2="${(i + 1) * 46}" y2="215"/>`).join('\n    ')}
    ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${(i + 1) * 43}" x2="460" y2="${(i + 1) * 43}"/>`).join('\n    ')}
  </g>
  <rect x="0" y="0" width="6" height="215" fill="${escapeXml(accent)}" fill-opacity="0.9"/>
  <text x="36" y="104" fill="#f2f2f2" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="30" font-weight="700">${escapeXml(label)}</text>
  ${sub ? `<text x="36" y="134" fill="#9a9aa0" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="14">${escapeXml(sub)}</text>` : ''}
  <text x="36" y="178" fill="#5c5c62" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="10.5" letter-spacing="2.6">封面待补充 · ADD COVER</text>
</svg>
`;
}

/* --------------------------------------------------------- Steam 抓取 */

async function steamAppDetails(appid, lang) {
  const raw = await get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=${lang}`);
  const json = JSON.parse(raw);
  const entry = Object.values(json)[0];
  if (!entry || !entry.success) throw new Error('appdetails success=false');
  return entry.data;
}

async function fetchSteamMeta(appid) {
  const meta = { appid };
  for (const lang of ['english', 'schinese']) {
    try {
      const d = await steamAppDetails(appid, lang);
      const clean = stripHtml(d.short_description) || stripHtml(d.about_the_game).slice(0, 260);
      const suffix = lang === 'english' ? 'en' : 'zh';
      meta[`title_${suffix}`] = d.name;
      meta[`dev_${suffix}`] = (d.developers || []).join(', ');
      meta[`pub_${suffix}`] = (d.publishers || []).join(', ');
      meta[`genres_${suffix}`] = (d.genres || []).map((g) => g.description).join(', ');
      meta[`release_${suffix}`] = d.release_date?.date || '';
      if (lang === 'english') {
        meta.desc = clean;
        meta.header = d.header_image;
      }
    } catch (err) {
      console.warn(`    ! ${lang} 资料抓取失败：${err.message}`);
    }
    await sleep(1200);
  }
  return meta;
}

/* ------------------------------------------------------------- 主流程 */

async function buildCover(entry) {
  const jpg = join(coversDir, `${entry.key}.jpg`);
  const svg = join(coversDir, `${entry.key}.svg`);

  // 1) 本地已有封面（例如用户自己放的图）→ 直接用
  if (entry.cover && !/^https?:/i.test(entry.cover)) {
    const local = resolve(root, entry.cover);
    if (existsSync(local)) {
      console.log(`  cover  本地图片 ${entry.cover}`);
      return entry.cover;
    }
    console.warn(`  ! cover 指向的本地文件不存在：${entry.cover}`);
  }

  // 2) 直链 / Steam header
  const urls = [];
  if (entry.cover) urls.push(entry.cover);
  if (entry.appid) {
    urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${entry.appid}/header.jpg`);
    urls.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${entry.appid}/header.jpg`);
  }

  for (const url of urls) {
    try {
      const buf = await get(url, { as: 'buffer' });
      if (!validImage(buf)) throw new Error(`不是有效图片（${buf.length} 字节）`);
      writeFileSync(jpg, buf);
      if (existsSync(svg)) unlinkSync(svg);
      console.log(`  cover  ${url.slice(0, 74)}… → covers/${entry.key}.jpg (${Math.round(buf.length / 1024)}KB)`);
      return `covers/${entry.key}.jpg`;
    } catch (err) {
      console.warn(`  ! cover 失败 ${err.message} :: ${url.slice(0, 74)}…`);
    }
  }

  // 3) 兜底：已有旧封面就保留（网络抖动不该覆盖好图），否则生成占位图
  if (existsSync(jpg)) {
    console.log(`  cover  保留已有 covers/${entry.key}.jpg`);
    return `covers/${entry.key}.jpg`;
  }
  writeFileSync(svg, placeholderSvg(entry), 'utf8');
  console.log(`  cover  占位图 covers/${entry.key}.svg（把真封面放到 covers/${entry.key}.jpg 后可重新运行）`);
  return `covers/${entry.key}.svg`;
}

async function main() {
  const configPath = resolve(root, 'games.config.json');
  if (!existsSync(configPath)) {
    console.error('找不到 games.config.json');
    process.exit(1);
  }
  const config = readJson(configPath);
  const list = config.games;
  if (!Array.isArray(list) || !list.length) {
    console.error('games.config.json 里的 games 数组为空');
    process.exit(1);
  }

  const keys = new Set();
  for (const g of list) {
    if (!g.key || !g.label) throw new Error(`配置项缺少 key 或 label：${JSON.stringify(g)}`);
    if (keys.has(g.key)) throw new Error(`key 重复：${g.key}`);
    keys.add(g.key);
  }

  const cachePath = resolve(coversDir, 'meta-cache.json');
  const cache = existsSync(cachePath) ? readJson(cachePath) : {};
  // 丢掉上一轮失败留下的空缓存，避免把空资料当成"已抓取"
  for (const [appid, meta] of Object.entries(cache)) {
    if (!meta || !meta.genres_en) delete cache[appid];
  }

  console.log(`共 ${list.length} 款游戏，开始构建…\n`);
  const games = [];

  for (const [index, entry] of list.entries()) {
    console.log(`[${String(index + 1).padStart(2, '0')}/${list.length}] ${entry.label}`);

    const offline = !!(entry.meta && typeof entry.meta === 'object');
    let meta = entry.appid ? (cache[entry.appid] || null) : null;
    if (entry.appid && !meta && !offline) {
      meta = await fetchSteamMeta(entry.appid);
      cache[entry.appid] = meta;
    } else if (meta) {
      console.log('  info   使用已缓存资料');
    }

    const cover = await buildCover(entry);
    const label = entry.label;
    const fallback = entry.meta || {};   // 非 Steam 游戏可在配置里直接写资料

    games.push({
      id: index + 1,
      key: entry.key,
      label,
      title: fallback.title || meta?.title_en || label,
      titleZh: fallback.titleZh || meta?.title_zh || label,
      cover,
      accent: entry.accent || '#e0e0e0',
      note: entry.note || '',
      dev: fallback.dev || meta?.dev_en || '',
      pub: fallback.pub || meta?.pub_en || '',
      genres: fallback.genres || meta?.genres_en || '',
      genresZh: fallback.genresZh || meta?.genres_zh || '',
      release: fallback.release || meta?.release_en || '',
      releaseZh: fallback.releaseZh || meta?.release_zh || '',
      desc: fallback.desc || meta?.desc || '',
      appid: entry.appid || null,
      steam: entry.appid ? `https://store.steampowered.com/app/${entry.appid}/` : '',
      ...(entry.bubble ? { bubble: String(entry.bubble) } : {}),
    });
    console.log('');
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

  const genres = [...new Set(games.flatMap((g) => g.genres.split(', ').filter(Boolean)))]
    .sort((a, b) => a.localeCompare(b));

  const banner = `// 由 tools/build-games.mjs 依据 games.config.json 自动生成 —— 请勿手改。
// 想增删游戏请编辑 games.config.json，然后运行：node tools/build-games.mjs
//
// 普通脚本（非 ES Module）：这样 index.html 直接双击以 file:// 打开也能工作，
// 数据通过 window.GAMES / window.GENRES 暴露给 js/app.js。
`;

  writeFileSync(resolve(root, 'js/games.js'), `${banner}
window.GENRES = ${JSON.stringify(genres, null, 2)};

window.GAMES = ${JSON.stringify(games, null, 2)};
`, 'utf8');

  console.log(`完成：${games.length} 款游戏，${genres.length} 种类型 → js/games.js`);
}

/* ------------------------------------------------ 证书错误时自动重试 */

function rerunWithSystemCa() {
  console.log('\n检测到 Node 不信任本机 HTTPS 证书链，正在用 --use-system-ca 重新执行…\n');
  const res = spawnSync(
    process.execPath,
    ['--use-system-ca', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', cwd: root },
  );
  process.exit(res.status ?? 1);
}

main()
  .then(() => {
    if (netState.certFailure && !hasSystemCaFlag) rerunWithSystemCa();
  })
  .catch((err) => {
    if (netState.certFailure && !hasSystemCaFlag) rerunWithSystemCa();
    console.error(`\n构建失败：${err.message}`);
    process.exit(1);
  });
