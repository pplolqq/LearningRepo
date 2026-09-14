'use strict';

const REFRESH_MS = 5000;
const EMBED_TTL_MS = 30000;

const state = {
  services: [],
  status: {},
  visible: [],
  filter: '',
  activeId: null,
  embed: {},
  mounted: { id: null, mode: null } // mode: frame | offline | blocked
};

const el = {
  home: document.getElementById('home'),
  workspace: document.getElementById('workspace'),
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  onlineCount: document.getElementById('online-count'),
  refresh: document.getElementById('refresh'),
  search: document.getElementById('search'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  checkedAt: document.getElementById('checked-at'),
  tpl: document.getElementById('card-tpl'),
  sideList: document.getElementById('side-list'),
  sideChecked: document.getElementById('side-checked'),
  sideRefresh: document.getElementById('side-refresh'),
  tplSide: document.getElementById('side-tpl'),
  barDot: document.getElementById('bar-dot'),
  barName: document.getElementById('bar-name'),
  barUrl: document.getElementById('bar-url'),
  barState: document.getElementById('bar-state'),
  actReload: document.getElementById('act-reload'),
  actCopy: document.getElementById('act-copy'),
  actNewtab: document.getElementById('act-newtab'),
  frameWrap: document.getElementById('frame-wrap')
};

/* ------------------------------------------------------------- 小工具 */

function byId(id) {
  return state.services.find((service) => service.id === id) || null;
}

function activeService() {
  return byId(state.activeId);
}

function resolveUrl(service) {
  if (service.url) return service.url;
  // 用当前页面所在的 host，这样 localhost / 局域网 IP 打开都能点通
  const host = window.location.hostname || 'localhost';
  const suffix = service.path && service.path !== '/' ? service.path : '/';
  return `${window.location.protocol}//${host}:${service.port}${suffix}`;
}

function formatTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function dotState(info) {
  if (!info) return 'checking';
  if (info.online === null) return 'external';
  return info.online ? 'online' : 'offline';
}

function stateLabel(info) {
  if (!info) return '检测中…';
  if (info.online === null) return '外部链接';
  return info.online ? `在线 ${info.ms}ms` : '未启动';
}

function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand('copy');
    helper.remove();
    return ok;
  }
}

/* ---------------------------------------------------------- 首页卡片 */

function paintCard(card, info) {
  card.querySelector('.dot').dataset.state = dotState(info);

  const label = card.querySelector('.state');
  label.textContent = stateLabel(info);
  if (info && info.online !== null) label.dataset.state = info.online ? 'online' : 'offline';
  else label.removeAttribute('data-state');

  card.classList.toggle('offline', Boolean(info) && info.online === false);
}

function buildCard(service) {
  const node = el.tpl.content.firstElementChild.cloneNode(true);
  const url = resolveUrl(service);

  node.href = url;
  node.dataset.id = service.id;
  node.style.setProperty('--tint', service.color);

  node.querySelector('.name').textContent = service.name;
  node.querySelector('.desc').textContent = service.description || '';
  node.querySelector('.url').textContent = url;

  const tagBox = node.querySelector('.tags');
  const tags = service.tags.concat(service.port ? [`:${service.port}`] : []);
  for (const label of tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = label;
    tagBox.appendChild(span);
  }

  // 普通左键：在网关里嵌着打开；带修饰键的点击交回浏览器（新标签）
  node.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    enterService(service.id);
  });

  node.querySelector('[data-act="newtab"]').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(url, '_blank', 'noopener');
  });

  node.querySelector('[data-act="copy"]').addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const ok = await copyText(url);
    button.textContent = ok ? '已复制' : '失败';
    button.classList.toggle('done', ok);
    setTimeout(() => {
      button.textContent = '复制';
      button.classList.remove('done');
    }, 1400);
  });

  return node;
}

function applyFilter() {
  const keyword = state.filter.trim().toLowerCase();

  state.visible = state.services.filter((service) => {
    if (!keyword) return true;
    const haystack = [service.name, service.description, service.id,
      String(service.port || ''), ...service.tags].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });

  const visibleIds = new Set(state.visible.map((service) => service.id));

  for (const card of el.grid.children) {
    card.hidden = !visibleIds.has(card.dataset.id);
    const index = state.visible.findIndex((service) => service.id === card.dataset.id);
    card.querySelector('.idx').textContent = index > -1 && index < 9 ? String(index + 1) : '';
  }

  el.empty.hidden = state.visible.length > 0;

  for (const service of state.services) {
    const card = el.grid.querySelector(`[data-id="${CSS.escape(service.id)}"]`);
    if (card) paintCard(card, state.status[service.id]);
  }

  updateCounter();
}

function updateCounter() {
  const probes = state.services.filter((service) => state.status[service.id]
    && state.status[service.id].online !== null);
  const online = probes.filter((service) => state.status[service.id].online).length;

  if (!probes.length) {
    el.onlineCount.textContent = '在线 –';
    el.onlineCount.classList.remove('ready');
    return;
  }
  el.onlineCount.textContent = `在线 ${online} / ${probes.length}`;
  el.onlineCount.classList.toggle('ready', online > 0);
}

/* ------------------------------------------------------------ 侧栏 */

function renderSidebar() {
  const nodes = state.services.map((service) => {
    const node = el.tplSide.content.firstElementChild.cloneNode(true);
    node.href = `#/${service.id}`;
    node.dataset.id = service.id;
    node.style.setProperty('--tint', service.color);
    node.querySelector('.side-name').textContent = service.name;
    node.querySelector('.side-port').textContent = service.port
      ? `:${service.port}`
      : (service.url || '');
    return node;
  });
  el.sideList.replaceChildren(...nodes);
}

function paintSidebar() {
  for (const item of el.sideList.children) {
    const id = item.dataset.id;
    item.classList.toggle('active', id === state.activeId);
    item.querySelector('.dot').dataset.state = dotState(state.status[id]);
  }
}

function paintBar() {
  const service = activeService();
  if (!service) return;
  const info = state.status[service.id];

  el.barDot.dataset.state = dotState(info);
  el.barName.textContent = service.name;
  el.barUrl.textContent = resolveUrl(service);
  el.barState.textContent = stateLabel(info);
  if (info && info.online !== null) el.barState.dataset.state = info.online ? 'online' : 'offline';
  else el.barState.removeAttribute('data-state');
}

/* ---------------------------------------------------------- 工作台 */

// 每个服务只问一次「能不能被嵌入」，结果缓存 30 秒
async function ensureEmbed(id) {
  const cached = state.embed[id];
  if (cached && Date.now() - cached.at < EMBED_TTL_MS) return cached;

  try {
    const res = await fetch(`/api/embed?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const entry = { embeddable: data.embeddable !== false, reason: data.reason || null, at: Date.now() };
    state.embed[id] = entry;
    return entry;
  } catch {
    return null;
  }
}

let mountToken = 0;

function renderFrame(service) {
  const frame = document.createElement('iframe');
  frame.className = 'frame';
  frame.src = resolveUrl(service);
  frame.title = service.name;

  const loading = document.createElement('div');
  loading.className = 'frame-loading';
  loading.textContent = '加载中…';

  let settled = false;
  const hideLoading = () => {
    if (settled) return;
    settled = true;
    loading.remove();
  };
  frame.addEventListener('load', hideLoading);
  setTimeout(hideLoading, 15000);

  state.mounted = { id: service.id, mode: 'frame' };
  el.frameWrap.replaceChildren(loading, frame);
}

function renderPlaceholder(mode, service, reason) {
  const url = resolveUrl(service);
  const box = document.createElement('div');
  box.className = 'placeholder';

  const title = document.createElement('h3');
  const desc = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'ph-actions';

  const primary = document.createElement('button');
  primary.className = 'ghost';
  primary.type = 'button';

  const secondary = document.createElement('button');
  secondary.className = 'solid';
  secondary.type = 'button';
  secondary.textContent = '在新标签打开 ↗';

  if (mode === 'offline') {
    title.textContent = '服务还没启动';
    desc.textContent = `端口 ${service.port} 没有响应。等它起来后会在这里自动加载，不用手动刷新。`;
    primary.textContent = '立即重试';
  } else {
    title.textContent = '这个页面不允许被嵌入';
    desc.textContent = `它返回了 ${reason === 'csp-frame-ancestors' ? 'CSP frame-ancestors' : 'X-Frame-Options'}，`
      + '浏览器拒绝在 iframe 里显示它。只能在新标签打开。';
    primary.textContent = '仍然尝试加载';
  }

  primary.addEventListener('click', () => mount(true));
  secondary.addEventListener('click', () => window.open(url, '_blank', 'noopener'));

  actions.append(primary, secondary);
  box.append(title, desc, actions);

  state.mounted = { id: service.id, mode };
  el.frameWrap.replaceChildren(box);
}

async function mount(force = false) {
  const service = activeService();
  if (!service) return;

  const token = ++mountToken;
  const info = state.status[service.id];

  if (info && info.online === false && !force) {
    renderPlaceholder('offline', service);
    return;
  }

  const embed = await ensureEmbed(service.id);
  if (token !== mountToken) return; // 期间已经切到别的服务

  if (embed && embed.embeddable === false && !force) {
    renderPlaceholder('blocked', service, embed.reason);
    return;
  }

  renderFrame(service);
}

function teardownFrame() {
  mountToken += 1;
  el.frameWrap.replaceChildren();
  state.mounted = { id: null, mode: null };
}

function maybeAutoMount() {
  const service = activeService();
  if (!service || state.mounted.id !== service.id) return;
  if (state.mounted.mode !== 'offline') return;

  const info = state.status[service.id];
  if (info && info.online) mount(false);
}

/* ------------------------------------------------------------ 路由 */

function hashId() {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return raw ? decodeURIComponent(raw) : null;
}

function enterService(id) {
  if (window.location.hash === `#/${id}`) return;
  window.location.hash = `#/${id}`;
}

function goHome() {
  if (!window.location.hash || window.location.hash === '#/') return;
  window.location.hash = '#/';
}

function showHome() {
  el.home.hidden = false;
  el.workspace.hidden = true;
  document.body.classList.remove('in-workspace');
}

function applyRoute() {
  const id = hashId();
  const service = id ? byId(id) : null;

  if (!service) {
    if (id) window.location.replace('#/'); // 未知服务，回到首页
    if (state.activeId !== null) {
      state.activeId = null;
      teardownFrame();
    }
    showHome();
    paintSidebar();
    return;
  }

  const changed = state.activeId !== service.id;
  state.activeId = service.id;

  el.home.hidden = true;
  el.workspace.hidden = false;
  document.body.classList.add('in-workspace');
  paintSidebar();
  paintBar();

  if (changed) mount(false);
}

/* ------------------------------------------------------------ 数据 */

async function loadConfig() {
  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  state.services = data.services || [];
  el.title.textContent = data.gateway?.title || '本地服务网关';
  el.subtitle.textContent = data.gateway?.subtitle || '';
  document.title = el.title.textContent;

  el.grid.replaceChildren(...state.services.map(buildCard));
  renderSidebar();
  applyFilter();
}

async function loadStatus() {
  el.refresh.classList.add('busy');
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.status = data.status || {};

    const stamp = `状态更新于 ${formatTime(data.checkedAt)}`;
    el.checkedAt.textContent = stamp;
    el.sideChecked.textContent = stamp;

    applyFilter();
    paintSidebar();
    paintBar();
    maybeAutoMount();
  } catch (err) {
    el.checkedAt.textContent = `状态获取失败：${err.message}`;
  } finally {
    el.refresh.classList.remove('busy');
  }
}

function refreshStatus(tip) {
  loadStatus();
  if (tip) toast(tip);
}

/* ------------------------------------------------------------ 交互 */

el.search.addEventListener('input', (event) => {
  state.filter = event.target.value;
  applyFilter();
});

el.refresh.addEventListener('click', () => refreshStatus());
el.sideRefresh.addEventListener('click', () => refreshStatus('已刷新状态'));

el.actReload.addEventListener('click', () => {
  mount(true); // 重建 iframe 节点，跨源也能真正刷新
  toast('已重新加载');
});

el.actCopy.addEventListener('click', async () => {
  const service = activeService();
  if (!service) return;
  const ok = await copyText(resolveUrl(service));
  toast(ok ? '地址已复制' : '复制失败');
});

el.actNewtab.addEventListener('click', () => {
  const service = activeService();
  if (service) window.open(resolveUrl(service), '_blank', 'noopener');
});

window.addEventListener('hashchange', applyRoute);

document.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLInputElement;

  if (event.key === '/' && !typing && !state.activeId) {
    event.preventDefault();
    el.search.focus();
    el.search.select();
    return;
  }

  if (event.key === 'Escape') {
    if (typing) {
      if (state.filter) {
        state.filter = '';
        el.search.value = '';
        applyFilter();
      }
      el.search.blur();
      return;
    }
    // 注意：焦点落在 iframe 里时父页面收不到键盘事件，这里只覆盖焦点还在壳上的情况
    if (state.activeId) {
      goHome();
      toast('已回到首页');
    }
    return;
  }

  if (typing && event.key === 'Enter') {
    event.preventDefault();
    const target = state.visible[0];
    if (target) enterService(target.id);
    return;
  }

  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key.toLowerCase() === 'r') {
    refreshStatus('已刷新状态');
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    const target = state.visible[Number(event.key) - 1];
    if (target) {
      event.preventDefault();
      enterService(target.id);
    }
  }
});

let pollTimer = null;

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!document.hidden) loadStatus();
  }, REFRESH_MS);
}

// 标签页切回来立刻刷新一次，避免看到过期状态
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadStatus();
});

/* ------------------------------------------------------------ 启动 */

(async function main() {
  try {
    await loadConfig();
  } catch (err) {
    el.checkedAt.textContent = `加载配置失败：${err.message}`;
    return;
  }
  applyRoute();
  await loadStatus();
  startPolling();
})();
