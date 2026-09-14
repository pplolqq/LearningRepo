#!/usr/bin/env node
'use strict';

/**
 * 本地服务网关 —— 零依赖 Node 后端
 *
 *   GET /                -> public/index.html
 *   GET /api/config      -> 网关信息 + 服务列表（已套用环境变量端口覆盖）
 *   GET /api/status      -> 逐个 TCP 探活，返回每个服务的在线状态与耗时
 *   GET /api/health      -> 网关自身存活检查
 *   GET /api/embed?id=x  -> 目标页面是否允许被 iframe 嵌入（看 X-Frame-Options / CSP）
 *   POST /api/start?id=x -> 调启动脚本把某个服务拉起来（复用 run_wsl.sh 的参数分发）
 *
 * 探活放在后端做：浏览器直连另一个端口会被 CORS 拦，后端探活不受影响，
 * 也不依赖页面是从 localhost 还是局域网 IP 打开的。
 */

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = process.env.GATEWAY_CONFIG || path.join(ROOT, 'services.json');

const PORT = Number(process.env.GATEWAY_PORT || 0);
const HOST = process.env.GATEWAY_HOST || '127.0.0.1';

const PROBE_TIMEOUT_MS = Number(process.env.GATEWAY_PROBE_TIMEOUT || 1200);
const STATUS_CACHE_MS = 1500;
const EMBED_CACHE_MS = Number(process.env.GATEWAY_EMBED_CACHE || 30000);
const START_WAIT_MS = Number(process.env.GATEWAY_START_WAIT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

/* ---------------------------------------------------------------- 配置 */

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeService(service) {
  if (!service || !service.name) return null;

  // 端口可以写死在 JSON 里，也可以用 envPort 让环境变量覆盖，
  // 这样 `export NOTE_PORT=5202` 之后不用改配置文件。
  const fromEnv = service.envPort ? Number(process.env[service.envPort]) : NaN;
  const port = Number.isFinite(fromEnv) ? fromEnv : Number(service.port);
  const url = service.url || '';

  if (!url && !Number.isFinite(port)) {
    console.warn(`[warn] 服务「${service.name}」既没有 url 也没有合法 port，已跳过`);
    return null;
  }

  return {
    id: service.id || slugify(service.name),
    name: service.name,
    description: service.description || '',
    port: Number.isFinite(port) ? port : null,
    path: service.path || '/',
    url,
    scheme: service.scheme === 'https' ? 'https' : 'http',
    probeHost: service.probeHost || '127.0.0.1',
    color: service.color || '#6ea8fe',
    tags: Array.isArray(service.tags) ? service.tags : [],
    envPort: service.envPort || null,
    startArgs: Array.isArray(service.startArgs) ? service.startArgs : null
  };
}

function readConfig() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[warn] 读取配置失败（${CONFIG_PATH}）：${err.message}`);
  }

  const gateway = Object.assign(
    { title: '本地服务网关', subtitle: '', port: 5200, startScript: 'run_wsl.sh', bash: '' },
    raw.gateway || {}
  );
  const services = (raw.services || []).map(normalizeService).filter(Boolean);

  return { gateway, services };
}

/* -------------------------------------------------------------- 端口探活 */

let statusCache = { at: 0, data: null };

function probePort(host, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (online, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ online, ms: Date.now() - started, error: error || null });
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (err) => finish(false, err.code || 'error'));
  });
}

async function collectStatus(services) {
  const entries = await Promise.all(
    services.map(async (service) => {
      if (service.url) {
        // 外部链接不做探活，交给浏览器点开时自己判断
        return [service.id, { kind: 'external', online: null, ms: null, error: null }];
      }
      const result = await probePort(service.probeHost, service.port);
      return [service.id, Object.assign({ kind: 'port' }, result)];
    })
  );
  return Object.fromEntries(entries);
}

/* ------------------------------------------------- 目标页面能否被 iframe 嵌入 */

const embedCache = new Map(); // service id -> { at, embeddable, reason }

function fetchHead(url, timeout) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    let settled = false;
    const done = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    let request;
    try {
      request = client.get(url, { timeout }, (response) => {
        const headers = response.headers;
        response.destroy();
        done({ ok: true, headers });
      });
    } catch (err) {
      done({ ok: false, error: err.code || err.message });
      return;
    }

    request.on('timeout', () => {
      request.destroy();
      done({ ok: false, error: 'timeout' });
    });
    request.on('error', (err) => done({ ok: false, error: err.code || err.message }));
  });
}

// 返回 null 表示可以嵌入，否则返回被拦住的原因
function judgeEmbeddable(headers) {
  const xfo = String(headers['x-frame-options'] || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return 'x-frame-options';

  const csp = String(headers['content-security-policy'] || '').toLowerCase();
  const match = csp.match(/frame-ancestors([^;]*)/);
  // 只认显式通配；'self' 之类一律当成拦我们（不同端口 = 不同源）
  if (match && match[1].trim() && !match[1].includes('*')) return 'csp-frame-ancestors';

  return null;
}

async function checkEmbed(service) {
  const cached = embedCache.get(service.id);
  if (cached && Date.now() - cached.at < EMBED_CACHE_MS) return cached;

  const url = `${service.scheme}://${service.probeHost}:${service.port}/`;
  const response = await fetchHead(url, PROBE_TIMEOUT_MS);
  const reason = response.ok ? judgeEmbeddable(response.headers) : 'unreachable';
  // 探不到就当我们没有证据证明它被拦，交给浏览器去试
  const result = { at: Date.now(), embeddable: reason === null || reason === 'unreachable', reason };

  embedCache.set(service.id, result);
  return result;
}

/* ------------------------------------------------------------ 拉起服务 */

const starting = new Set();

// 剥掉 ANSI 颜色码，日志直接显示在页面上
function cleanOutput(text) {
  return text
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\r/g, '')
    .trim()
    .split('\n')
    .slice(-12)
    .join('\n');
}

function startService(service, gateway) {
  const script = process.env.GATEWAY_START_SCRIPT || gateway.startScript || 'run_wsl.sh';
  const bash = String(process.env.GATEWAY_BASH || gateway.bash || 'bash').trim();
  const args = [script, ...service.startArgs];

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bash, args, { cwd: ROOT, windowsHide: true, detached: true });
    } catch (err) {
      resolve({ ok: false, error: `无法执行 ${bash}：${err.message}` });
      return;
    }

    let output = '';
    const collect = (chunk) => {
      output = (output + chunk).slice(-8000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    let timer = null;
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Object.assign({ command: `${bash} ${args.join(' ')}` }, payload));
    };

    // 还在跑 = 服务常驻，就当启动成功，随后靠端口探活确认它真的起来了
    timer = setTimeout(() => {
      child.unref();
      finish({ ok: true, running: true, pid: child.pid, output: cleanOutput(output) });
    }, START_WAIT_MS);

    child.on('error', (err) => finish({ ok: false, error: `无法执行 ${bash}：${err.message}` }));
    child.on('exit', (code, signal) => {
      const log = cleanOutput(output);
      if (code === 0) {
        finish({ ok: true, exited: true, output: log });
        return;
      }
      const how = code === null ? signal : `退出码 ${code}`;
      finish({ ok: false, error: `启动脚本异常退出（${how}）`, output: log });
    });
  });
}

/* ------------------------------------------------------------------ HTTP */

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, relative);

  // 防目录穿越
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      // 单页应用兜底
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }).end(html);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const config = readConfig(); // 每次请求都重读，改完 services.json 刷新即生效

  if (url.pathname === '/api/config') {
    sendJson(res, 200, { gateway: config.gateway, services: config.services });
    return;
  }

  if (url.pathname === '/api/status') {
    const now = Date.now();
    if (!statusCache.data || now - statusCache.at > STATUS_CACHE_MS) {
      statusCache = { at: now, data: await collectStatus(config.services) };
    }
    sendJson(res, 200, {
      checkedAt: new Date(statusCache.at).toISOString(),
      status: statusCache.data
    });
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/embed') {
    const id = url.searchParams.get('id');
    const service = config.services.find((item) => item.id === id);
    if (!service) {
      sendJson(res, 404, { error: 'unknown service' });
      return;
    }
    const result = await checkEmbed(service);
    sendJson(res, 200, {
      id: service.id,
      embeddable: result.embeddable,
      reason: result.reason
    });
    return;
  }

  if (url.pathname === '/api/start') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: '这个接口要 POST' });
      return;
    }
    const id = url.searchParams.get('id');
    const service = config.services.find((item) => item.id === id);
    if (!service) {
      sendJson(res, 404, { error: 'unknown service' });
      return;
    }
    if (!service.startArgs) {
      sendJson(res, 400, { error: '这个服务没配置 startArgs，网关不知道该怎么启动它' });
      return;
    }
    if (starting.has(service.id)) {
      sendJson(res, 200, { ok: false, busy: true, error: '这个服务正在启动中，稍等一下' });
      return;
    }

    starting.add(service.id);
    console.log(`[start] 拉起 ${service.name}…`);
    const result = await startService(service, config.gateway);
    // 常驻的进程再多锁一会儿，避免连点拉起第二份；已经退出的立刻放锁
    if (result.running) setTimeout(() => starting.delete(service.id), 5000);
    else starting.delete(service.id);

    if (result.ok) console.log(`[start] ${service.name} ${result.running ? '进程常驻中' : '脚本执行完毕'}`);
    else console.warn(`[start] ${service.name} 启动失败：${result.error}`);

    sendJson(res, result.ok ? 200 : 500, result);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  serveStatic(res, url.pathname);
});

/* ------------------------------------------------------------------ 启动 */

const initial = readConfig();
const port = PORT || Number(initial.gateway.port) || 5200;

server.listen(port, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`本地服务网关已启动: http://${shown}:${port}`);
  for (const service of initial.services) {
    const hint = service.envPort ? `  (env ${service.envPort})` : '';
    console.log(`  · ${service.name} -> ${service.url || `http://localhost:${service.port}/`}${hint}`);
  }
  if (!initial.services.length) {
    console.warn('  ! services.json 里还没有配置任何服务');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，可用 GATEWAY_PORT=5201 node run_gateway_server.js 换一个端口。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n网关已停止');
    server.close(() => process.exit(0));
  });
}
