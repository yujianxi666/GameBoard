/* =========================================================================
   我的游戏库 — 交互脚本
   渲染网格 / 列表双视图、类型筛选、详情面板与弹窗，并驱动入场动画。

   注意：这里刻意不使用 ES Module。改用普通脚本后，index.html 直接双击
   以 file:// 打开也能正常运行（模块导入在同一环境下会被 CORS 拦截）。
   数据由 js/games.js 以 window.GAMES / window.GENRES 提供。
   ========================================================================= */
const { GAMES, GENRES } = window;

/* ---------------------------------------------------------------- 工具 */
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

/* 中文界面用中文类型名，英文视图回退到英文 */
const genreLabel = (game, zh = true) => {
  const primary = zh ? game.genresZh : game.genres;
  return (primary || game.genres || '').split(', ').filter(Boolean);
};
const firstGenre = (game) => genreLabel(game)[0] || '游戏';

const releaseLabel = (game) =>
  (game.releaseZh || game.release || '').replace(/\s*年\s*/, '-').replace(/\s*月\s*/, '-').replace(/\s*日/, '') || game.release;

/* 详情/弹窗底部操作：Steam 游戏给商店页按钮，非 Steam 游戏给一句说明 */
const actionHtml = (game) => (
  game.steam
    ? `<a class="btn btn--primary" href="${game.steam}" target="_blank" rel="noopener noreferrer">
         <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>
         Steam 商店页
       </a>`
    : '<span class="detail__note">非 Steam 游戏 · 无商店页面</span>'
);

/* --------------------------------------------------------------- 状态 */
const state = {
  view: 'grid',
  query: '',
  genre: '全部',
  selectedKey: null,
};

/* ----------------------------------------------------------- DOM 引用 */
const els = {
  grid: $('#grid'),
  board: $('#board'),
  listPane: $('#listPane'),
  glist: $('#glist'),
  listCount: $('#listCount'),
  detail: $('#detail'),
  empty: $('#empty'),
  chips: $('#chips'),
  search: $('#search'),
  viewToggle: $('#viewToggle'),
  replay: $('#replay'),
  clearFilters: $('#clearFilters'),
  modal: $('#modal'),
  modalPanel: $('#modalPanel'),
  toast: $('#toast'),
  statGames: $('#statGames'),
  statGenre: $('#statGenre'),
  dust: $('#dust'),
  stage: $('#stage'),
};

/* ============================================================ 背景星点 */
function buildDust(count = 26) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('i');
    const size = (Math.random() * 2.4 + 1.4).toFixed(2);
    dot.style.left = `${(Math.random() * 100).toFixed(2)}%`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.setProperty('--dx', `${(Math.random() * 90 - 45).toFixed(0)}px`);
    dot.style.animationDuration = `${(Math.random() * 16 + 15).toFixed(1)}s`;
    dot.style.animationDelay = `${(-Math.random() * 26).toFixed(1)}s`;
    dot.style.opacity = (Math.random() * 0.5 + 0.3).toFixed(2);
    frag.append(dot);
  }
  els.dust.append(frag);
}

/* ============================================================ 类型筛选 */
function buildChips() {
  const items = ['全部', ...GENRES];
  els.chips.innerHTML = items
    .map((name, i) => {
      const count = name === '全部' ? GAMES.length : GAMES.filter((g) => g.genres.includes(name)).length;
      const label = i === 0 ? `全部 <b>${count}</b>` : `${escapeHtml(name)} <b>${count}</b>`;
      return `<button class="chip" type="button" style="--i:${i}" data-genre="${escapeHtml(name)}"
        aria-pressed="${name === state.genre}">${label}</button>`;
    })
    .join('');
}

/* ============================================================ 过滤逻辑 */
const matches = (game) => {
  if (state.genre !== '全部' && !game.genres.includes(state.genre)) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [game.label, game.title, game.titleZh, game.key, game.dev, game.pub, game.genres, game.genresZh]
    .join(' ')
    .toLowerCase()
    .includes(q);
};

const visibleGames = () => GAMES.filter(matches);

/* ============================================================ 渲染网格 */
function renderGrid(games) {
  els.grid.innerHTML = games
    .map((game, i) => {
      const badge = game.bubble
        ? `<span class="card__badge">${escapeHtml(game.bubble)}</span>`
        : game.note
          ? '<span class="card__badge card__badge--note">更新</span>'
          : '';
      return `
      <button class="card${game.key === state.selectedKey ? ' is-selected' : ''}"
              type="button" data-key="${game.key}" style="--i:${i};--accent:${game.accent}"
              aria-label="${escapeHtml(game.label)}，查看详情">
        <span class="card__in">
          <span class="card__index">${String(game.id).padStart(2, '0')}</span>
          ${badge}
          <span class="cover">
            <img src="${game.cover}" alt="${escapeHtml(game.title)} 封面" loading="${i < 8 ? 'eager' : 'lazy'}" decoding="async" draggable="false" />
            <span class="cover__shine" aria-hidden="true"></span>
            <span class="card__more" data-more="${game.key}" aria-hidden="true">查看详情</span>
          </span>
          <span class="card__body">
            <span class="card__title">${escapeHtml(game.label)}</span>
            <span class="card__sub">${escapeHtml(game.title)}</span>
            <span class="card__tag">${escapeHtml(firstGenre(game))}</span>
          </span>
        </span>
      </button>`;
    })
    .join('');
}

/* ============================================================ 渲染列表 */
function renderList(games) {
  els.listCount.textContent = `(${games.length})`;
  els.glist.innerHTML = games
    .map((game, i) => {
      const flag = game.note
        ? `<span class="grow__flag grow__flag--warn"><i></i>更新队列</span>`
        : `<span class="grow__flag"><i></i>已安装</span>`;
      return `
      <li>
        <button class="grow${game.key === state.selectedKey ? ' is-selected' : ''}"
                type="button" data-key="${game.key}" style="--i:${i}"
                title="${escapeHtml(game.title)}">
          <span class="grow__num">${game.id}</span>
          <span class="grow__thumb"><img src="${game.cover}" alt="" loading="lazy" decoding="async" draggable="false" /></span>
          <span class="grow__name">${escapeHtml(game.label)}</span>
          ${flag}
        </button>
      </li>`;
    })
    .join('');
}

/* ============================================================ 详情面板 */
function renderDetail() {
  const game = GAMES.find((g) => g.key === state.selectedKey);
  if (!game) {
    els.detail.innerHTML = `
      <div class="detail__empty">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg>
        <b>选择一款游戏</b>
        将鼠标移到封面上，<br />或点击任意卡片查看详情。
      </div>`;
    return;
  }

  els.detail.innerHTML = `
    <div class="detail__inner" style="--accent:${game.accent}">
      <div class="detail__cover"><img src="${game.cover}" alt="${escapeHtml(game.title)} 封面" /></div>
      <div class="detail__body">
        <h3 class="detail__title">${escapeHtml(game.label)}</h3>
        <p class="detail__sub">${escapeHtml(game.title)}</p>
        <div>${genreLabel(game).map((g) => `<span class="genrepill">${escapeHtml(g)}</span>`).join('')}</div>
        <div class="meta" style="margin-top:12px">
          <div class="meta__row"><span class="meta__k">开发商</span><span class="meta__v">${escapeHtml(game.dev)}</span></div>
          <div class="meta__row"><span class="meta__k">发行商</span><span class="meta__v">${escapeHtml(game.pub)}</span></div>
          <div class="meta__row"><span class="meta__k">发行日期</span><span class="meta__v">${escapeHtml(releaseLabel(game))}</span></div>
        </div>
        <p class="detail__desc">${escapeHtml(game.desc)}</p>
        <div class="detail__actions">${actionHtml(game)}</div>
      </div>
    </div>`;
}

/* ============================================================ 弹窗 */
function openModal(key) {
  const game = GAMES.find((g) => g.key === key);
  if (!game) return;
  els.modalPanel.innerHTML = `
    <button class="modal__close" type="button" data-close aria-label="关闭">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <div class="modal__hero">
      <img src="${game.cover}" alt="${escapeHtml(game.title)} 封面" />
      <div class="modal__heroText">
        <div>${genreLabel(game).map((g) => `<span class="genrepill">${escapeHtml(g)}</span>`).join('')}</div>
        <h2 class="modal__title" id="modalTitle">${escapeHtml(game.label)}</h2>
        <p class="modal__titleZh">${escapeHtml(game.title)}</p>
      </div>
    </div>
    <div class="modal__body">
      <div>
        <p class="modal__desc">${escapeHtml(game.desc)}</p>
        <div class="modal__actions">${actionHtml(game)}</div>
      </div>
      <div class="modal__specs">
        <div class="meta__row"><span class="meta__k">开发商</span><span class="meta__v">${escapeHtml(game.dev)}</span></div>
        <div class="meta__row"><span class="meta__k">发行商</span><span class="meta__v">${escapeHtml(game.pub)}</span></div>
        <div class="meta__row"><span class="meta__k">发行日期</span><span class="meta__v">${escapeHtml(releaseLabel(game))}</span></div>
        <div class="meta__row"><span class="meta__k">类型</span><span class="meta__v">${escapeHtml(game.genresZh || game.genres)}</span></div>
        <div class="meta__row"><span class="meta__k">Steam AppID</span><span class="meta__v">${game.appid}</span></div>
        <div class="meta__row"><span class="meta__k">库状态</span><span class="meta__v">${game.note ? escapeHtml(game.note) : '已安装'}</span></div>
      </div>
    </div>`;
  els.modal.hidden = false;
  document.body.classList.add('is-locked');
  $('.modal__close', els.modalPanel).focus({ preventScroll: true });
}

function closeModal() {
  if (els.modal.hidden) return;
  els.modal.hidden = true;
  document.body.classList.remove('is-locked');
  els.modalPanel.innerHTML = '';
}

/* ============================================================ Toast */
let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2100);
}

/* ============================================================ 更新视图 */
function apply() {
  const games = visibleGames();

  renderGrid(games);
  renderList(games);

  const none = games.length === 0;
  els.empty.hidden = !none;
  els.grid.hidden = none;
  els.listPane.hidden = state.view !== 'list';

  if (state.selectedKey && !games.some((g) => g.key === state.selectedKey)) {
    state.selectedKey = null;
    renderDetail();
  }
}

/* ============================================================ 视图切换 */
function setView(view, { animate = true } = {}) {
  state.view = view;
  els.stage.dataset.view = view;
  $$('.segmented__btn').forEach((btn) => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  apply();
  if (animate && !prefersReduced) replayIntro(true);
}

/* ============================================================ 入场动画 */
function replayIntro(silent = false) {
  if (!prefersReduced) {
    els.board.classList.remove('is-scanning');
    // 强制重排以便重新触发 CSS 动画
    void els.board.offsetWidth;
    els.board.classList.add('is-scanning');
    setTimeout(() => els.board.classList.remove('is-scanning'), 1900);

    $$('.card__in').forEach((inner, i) => {
      inner.style.animation = 'none';
      void inner.offsetWidth;
      inner.style.animation = '';
      inner.style.animationDelay = `${i * 55 + 60}ms`;
    });
    // 重放时让整块网格重新做一次“聚光”扫描
    els.grid.classList.remove('is-spotlight');
    $$('.card.is-hot').forEach((c) => c.classList.remove('is-hot'));
  }
  if (!silent) {
    els.replay.classList.add('is-spinning');
    setTimeout(() => els.replay.classList.remove('is-spinning'), 800);
    toast('入场动画已重放');
  }
}

/* ============================================================ 事件绑定 */
function select(key) {
  state.selectedKey = key;
  $$('.card').forEach((c) => c.classList.toggle('is-selected', c.dataset.key === key));
  $$('.grow').forEach((r) => r.classList.toggle('is-selected', r.dataset.key === key));
  renderDetail();
}

function bind() {
  els.grid.addEventListener('click', (e) => {
    const more = e.target.closest('.card__more');
    const card = e.target.closest('.card');
    if (!card) return;
    select(card.dataset.key);
    if (more) openModal(more.dataset.more);
  });

  /* 聚光：指针进入某张卡片时压暗其余卡片（由类驱动，稳定可靠） */
  els.grid.addEventListener('pointerover', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    els.grid.classList.add('is-spotlight');
    $$('.card.is-hot').forEach((c) => { if (c !== card) c.classList.remove('is-hot'); });
    card.classList.add('is-hot');
  });
  els.grid.addEventListener('pointerleave', () => {
    els.grid.classList.remove('is-spotlight');
    $$('.card.is-hot').forEach((c) => c.classList.remove('is-hot'));
  });
  /* 键盘 Tab 聚焦时同样高亮 */
  els.grid.addEventListener('focusin', (e) => {
    const card = e.target.closest('.card');
    if (card) card.classList.add('is-hot');
  });
  els.grid.addEventListener('focusout', (e) => {
    const card = e.target.closest('.card');
    if (card) card.classList.remove('is-hot');
  });

  els.glist.addEventListener('click', (e) => {
    const row = e.target.closest('.grow');
    if (!row) return;
    select(row.dataset.key);
    openModal(row.dataset.key);
  });

  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.genre = chip.dataset.genre;
    $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.genre === state.genre)));
    apply();
    replayIntro(true);
  });

  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value;
      apply();
    }, 110);
  });

  els.viewToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented__btn');
    if (btn) setView(btn.dataset.view);
  });

  els.replay.addEventListener('click', () => replayIntro());

  els.clearFilters.addEventListener('click', () => {
    state.genre = '全部';
    state.query = '';
    els.search.value = '';
    $$('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.genre === '全部')));
    apply();
  });

  /* 详情面板 / 弹窗里的关闭按钮 */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });

  /* 键盘快捷键 */
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') {
      if (!els.modal.hidden) closeModal();
      else if (typing) els.search.blur();
      return;
    }
    if (typing) return;
    if (e.key === '/' && !typing) { e.preventDefault(); els.search.focus(); }
    if (e.key === '1' && !typing) setView('grid');
    if (e.key === '2' && !typing) setView('list');
    if (e.key === 'Enter' && !typing && state.selectedKey) openModal(state.selectedKey);
  });
}

/* ============================================================ 初始化 */
function init() {
  buildDust();
  buildChips();
  els.statGames.textContent = GAMES.length;
  els.statGenre.textContent = GENRES.length;
  els.stage.dataset.view = state.view;

  apply();
  renderDetail();
  bind();

  // 首屏扫描动画
  if (!prefersReduced) {
    setTimeout(() => replayIntro(true), 480);
  }

  // 默认选中第一款，右侧面板不留空
  select(GAMES[0].key);
}

init();
