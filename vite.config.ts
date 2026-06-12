import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';

type LocalHttpsConfig = {
  certPath: string;
  keyPath: string;
};

type LocalServerConfig = {
  host?: string | boolean;
  port?: number;
  https?: LocalHttpsConfig;
};

type LocalViteConfig = {
  fqdn?: string;
  server?: LocalServerConfig;
  preview?: LocalServerConfig;
};

const localConfigPath = process.env.LOCAL_VITE_CONFIG_PATH
  ? path.resolve(__dirname, process.env.LOCAL_VITE_CONFIG_PATH)
  : path.resolve(__dirname, '.local/vite.json');
const skipLocalConfig = process.env.VITE_SKIP_LOCAL_CONFIG === '1';

function loadLocalConfig(): LocalViteConfig | undefined {
  if (skipLocalConfig) {
    return undefined;
  }

  if (!fs.existsSync(localConfigPath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(localConfigPath, 'utf8')) as LocalViteConfig;
}

function loadHttpsConfig(httpsConfig?: LocalHttpsConfig) {
  if (!httpsConfig) {
    return undefined;
  }

  const certPath = path.resolve(__dirname, httpsConfig.certPath);
  const keyPath = path.resolve(__dirname, httpsConfig.keyPath);

  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
}

const localConfig = loadLocalConfig();
const fqdn = localConfig?.fqdn;
const proxyConfig = {
  '/api/auth/device/code': proxy('https://github.com', () => '/login/device/code'),
  '/api/auth/access-token': proxy('https://github.com', () => '/login/oauth/access_token'),
  '/api/github/user': proxy('https://api.github.com', () => '/user'),
  '/api/copilot/token': proxy('https://api.github.com', () => '/copilot_internal/v2/token'),
  '/api/copilot/chat/completions': proxy('https://api.githubcopilot.com', () => '/chat/completions'),
  '/api/copilot/responses': proxy('https://api.githubcopilot.com', () => '/responses'),
};

function proxy(target: string, rewrite: (pathName: string) => string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    rewrite,
  };
}

export default defineConfig({
  server: {
    host: localConfig?.server?.host,
    port: localConfig?.server?.port,
    strictPort: localConfig?.server?.port !== undefined,
    https: loadHttpsConfig(localConfig?.server?.https),
    allowedHosts: fqdn ? [fqdn] : undefined,
    hmr:
      fqdn && localConfig?.server?.port && localConfig?.server?.https
        ? {
            host: fqdn,
            port: localConfig.server.port,
            protocol: 'wss',
          }
        : undefined,
    proxy: proxyConfig,
  },
  preview: localConfig?.preview
    ? {
        host: localConfig.preview.host,
        port: localConfig.preview.port,
        strictPort: localConfig.preview.port !== undefined,
        https: loadHttpsConfig(localConfig.preview.https),
      }
    : undefined,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Single bundle — no dynamic chunks needed for a one-pager
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
