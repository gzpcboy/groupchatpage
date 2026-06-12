#!/usr/bin/env node

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distRoot = path.join(repoRoot, 'dist');
const localConfigPath = process.env.LOCAL_VITE_CONFIG_PATH
  ? path.resolve(repoRoot, process.env.LOCAL_VITE_CONFIG_PATH)
  : path.join(repoRoot, '.local', 'vite.json');

if (!fs.existsSync(localConfigPath)) {
  throw new Error(`Missing local server config: ${localConfigPath}`);
}

if (!fs.existsSync(distRoot)) {
  throw new Error(`Missing build output: ${distRoot}. Run "npm run build" first.`);
}

const config = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
const serverConfig = config.preview ?? config.server;

if (!serverConfig?.https?.keyPath || !serverConfig.https.certPath) {
  throw new Error(`Missing HTTPS key/cert paths in ${localConfigPath}`);
}

const keyPath = path.resolve(repoRoot, serverConfig.https.keyPath);
const certPath = path.resolve(repoRoot, serverConfig.https.certPath);
const host = serverConfig.host === true ? '0.0.0.0' : (serverConfig.host ?? '0.0.0.0');
const port = Number(serverConfig.port ?? 4333);
const fqdn = config.fqdn ?? 'localhost';
const indexPath = path.join(distRoot, 'index.html');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const proxyRoutes = [
  { path: '/api/auth/device/code', target: 'https://github.com', upstreamPath: '/login/device/code' },
  { path: '/api/auth/access-token', target: 'https://github.com', upstreamPath: '/login/oauth/access_token' },
  { path: '/api/github/user', target: 'https://api.github.com', upstreamPath: '/user' },
  { path: '/api/copilot/token', target: 'https://api.github.com', upstreamPath: '/copilot_internal/v2/token' },
  { path: '/api/copilot/chat/completions', target: 'https://api.githubcopilot.com', upstreamPath: '/chat/completions' },
  { path: '/api/copilot/responses', target: 'https://api.githubcopilot.com', upstreamPath: '/responses' },
];

function resolveRequestPath(requestUrl = '/') {
  const url = new URL(requestUrl, `https://${fqdn}`);
  const requestedPath = path.resolve(distRoot, `.${url.pathname}`);

  if (!requestedPath.startsWith(distRoot)) {
    return null;
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isDirectory()) {
    const nestedIndex = path.join(requestedPath, 'index.html');
    if (fs.existsSync(nestedIndex)) {
      return nestedIndex;
    }
  }

  return indexPath;
}

function matchProxyRoute(requestUrl = '/') {
  const url = new URL(requestUrl, `https://${fqdn}`);
  return proxyRoutes.find((route) => route.path === url.pathname);
}

function proxyRequest(req, res, route) {
  const incomingUrl = new URL(req.url ?? '/', `https://${fqdn}`);
  const targetUrl = new URL(route.upstreamPath, route.target);
  targetUrl.search = incomingUrl.search;

  const upstream = https.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: targetUrl.host,
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Proxy request failed: ${error.message}`);
  });

  req.pipe(upstream);
}

const server = https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  },
  (req, res) => {
    const proxyRoute = matchProxyRoute(req.url);
    if (proxyRoute) {
      proxyRequest(req, res, proxyRoute);
      return;
    }

    const filePath = resolveRequestPath(req.url);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const extension = path.extname(filePath);
    const contentType = contentTypes.get(extension) ?? 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  },
);

server.listen(port, host, () => {
  console.log(`Serving ${distRoot} at https://${fqdn}:${port}`);
});
