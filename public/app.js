'use strict';

const REFRESH_MS = 5000;

const state = {
  services: [],
  status: {},
  visible: [],
  filter: ''
};

const el = {
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  onlineCount: document.getElementById('online-count'),
  refresh: document.getElementById('refresh'),
  search: document.getElementById('search'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  checkedAt: document.getElementById('checked-at'),
  tpl: document.getElementById('card-tpl')
};

/* ------------------------------------------------------------- 小工具 */

function cardOf(id) {
  return el.grid.querySelector(`[data-id="${CSS.escape(id)}"]`);
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

/* -------------------------------------------------------------- 渲染 */

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

  node.querySelector('.copy').addEventListener('click', async (event) => {
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

function paintStatus(card, info) {
  const dot = card.querySelector('.dot');
  const label = card.querySelector('.state');

  if (!info) {
    label.textContent = '检测中…';
    return;
  }

  if (info.online === null) {
    dot.dataset.state = 'external';
    label.removeAttribute('data-state');
    label.textContent = '外部链接';
    card.classList.remove('offline');
    return;
  }

  dot.dataset.state = info.online ? 'online' : 'offline';
  label.dataset.state = info.online ? 'online' : 'offline';
  label.textContent = info.online ? `在线 ${info.ms}ms` : '未启动';
  card.classList.toggle('offline', !info.online);
}

function updateCounter() {
  const probes = state.services.filter((service) => state.status[service.id]?.online !== null
    && state.status[service.id] !== undefined);
  const online = probes.filter((service) => state.status[service.id].online).length;

  if (!probes.length) {
    el.onlineCount.textContent = '在线 –';
    el.onlineCount.classList.remove('ready');
    return;
  }
  el.onlineCount.textContent = `在线 ${online} / ${probes.length}`;
  el.onlineCount.classList.toggle('ready', online > 0);
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
    const card = cardOf(service.id);
    if (card) paintStatus(card, state.status[service.id]);
  }

  updateCounter();
}

/* -------------------------------------------------------------- 数据 */

async function loadConfig() {
  const res = await fetch('/api/config', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  state.services = data.services || [];
  el.title.textContent = data.gateway?.title || '本地服务网关';
  el.subtitle.textContent = data.gateway?.subtitle || '';
  document.title = el.title.textContent;

  el.grid.replaceChildren(...state.services.map(buildCard));
  applyFilter();
}

async function loadStatus() {
  el.refresh.classList.add('busy');
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.status = data.status || {};
    el.checkedAt.textContent = `状态更新于 ${formatTime(data.checkedAt)}`;
    applyFilter();
  } catch (err) {
    el.checkedAt.textContent = `状态获取失败：${err.message}`;
  } finally {
    el.refresh.classList.remove('busy');
  }
}

function openService(service) {
  if (!service) return;
  window.open(resolveUrl(service), '_blank', 'noopener');
}

/* -------------------------------------------------------------- 交互 */

el.search.addEventListener('input', (event) => {
  state.filter = event.target.value;
  applyFilter();
});

el.refresh.addEventListener('click', () => {
  loadStatus();
  toast('已刷新状态');
});

document.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLInputElement;

  if (event.key === '/' && !typing) {
    event.preventDefault();
    el.search.focus();
    el.search.select();
    return;
  }

  if (event.key === 'Escape') {
    if (state.filter) {
      state.filter = '';
      el.search.value = '';
      applyFilter();
    }
    el.search.blur();
    return;
  }

  if (typing && event.key === 'Enter') {
    event.preventDefault();
    openService(state.visible[0]);
    return;
  }

  if (typing && event.key === 'ArrowDown') {
    event.preventDefault();
    el.grid.querySelector('.card:not([hidden])')?.focus();
    return;
  }

  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key.toLowerCase() === 'r') {
    loadStatus();
    toast('已刷新状态');
    return;
  }

  if (/^[1-9]$/.test(event.key)) {
    const target = state.visible[Number(event.key) - 1];
    if (target) {
      event.preventDefault();
      openService(target);
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

/* -------------------------------------------------------------- 启动 */

(async function main() {
  try {
    await loadConfig();
  } catch (err) {
    el.checkedAt.textContent = `加载配置失败：${err.message}`;
    return;
  }
  await loadStatus();
  startPolling();
})();
