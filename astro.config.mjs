// @ts-check
import path from "path";

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

import { httpToHttpsRedirect } from './plugins/httpToHttpsRedirect.mjs';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // astro-icon → @iconify/utils needs Node (tty, etc.) during prerender/dev
    prerenderEnvironment: 'node',
  }),
  compressHTML: true,
  server: {
    host: true,
    allowedHosts: true,
  },
  integrations: [
    react(),
    icon({
      include: {
        lucide: ['external-link', 'plus', 'upload', 'x'],
      },
      // Keep gradient/filter IDs unique across inlined icons (SVGO's cleanupIds
      // collapses every icon to a/b/c and they steal each other's fills).
      svgoOptions: {
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                cleanupIds: false,
              },
            },
          },
        ],
      },
    }),
  ],

  vite: {
    plugins: [basicSsl(), httpToHttpsRedirect()],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@astrojs/react/client.js',
        '@reduxjs/toolkit',
        'react-redux',
        'redux-undo',
        'uuid',
        'classnames',
        'lodash-es',
        'lodash-es/chunk',
        'path-data-polyfill',
        '@fortawesome/react-fontawesome',
        '@fortawesome/fontawesome-svg-core',
        '@fortawesome/free-solid-svg-icons',
        '@fortawesome/free-regular-svg-icons',
        'svgo/browser',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        lodash: 'lodash-es',
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  },
});
