#!/usr/bin/env node
'use strict';

/**
 * 本地服务网关 —— 零依赖 Node 后端
 *
 *   GET /                -> public/index.html
 *   GET /api/config      -> 网关信息 + 服务列表（已套用环境变量端口覆盖）
 *   GET /api/status      -> 逐个 TCP 探活，返回每个服务的在线状态与耗时
 *   GET /api/health      -> 网关自身存活检查
 *
 * 探活放在后端做：浏览器直连另一个端口会被 CORS 拦，后端探活不受影响，
 * 也不依赖页面是从 localhost 还是局域网 IP 打开的。
 */

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = process.env.GATEWAY_CONFIG || path.join(ROOT, 'services.json');

const PORT = Number(process.env.GATEWAY_PORT || 0);
const HOST = process.env.GATEWAY_HOST || '127.0.0.1';

const PROBE_TIMEOUT_MS = Number(process.env.GATEWAY_PROBE_TIMEOUT || 1200);
const STATUS_CACHE_MS = 1500;

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
    probeHost: service.probeHost || '127.0.0.1',
    color: service.color || '#6ea8fe',
    tags: Array.isArray(service.tags) ? service.tags : [],
    envPort: service.envPort || null
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
    { title: '本地服务网关', subtitle: '', port: 5200 },
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
    console.error(`端口 ${port} 已被占用，可用 GATEWAY_PORT=5201 node server.js 换一个端口。`);
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
