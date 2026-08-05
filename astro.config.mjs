// @ts-check
import path from "path";

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import { defineConfig } from 'astro/config';

import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // astro-icon → @iconify/utils needs Node (tty, etc.) during prerender/dev
    prerenderEnvironment: 'node',
  }),
  compressHTML: true,
  integrations: [
    react(),
    vue(),
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
        'lodash-es/startCase',
        'lodash-es/partition',
        'lodash-es/camelCase',
        'lodash-es/snakeCase',
        'lodash-es/throttle',
        'lodash-es/clamp',
        'path-data-polyfill',
        '@fortawesome/react-fontawesome',
        '@fortawesome/fontawesome-svg-core',
        '@fortawesome/free-solid-svg-icons',
        '@fortawesome/free-regular-svg-icons',
        'svgo/browser',
        'vue',
        '@astrojs/vue/client.js',
        'three',
        // Deep three/addons imports — discover-on-demand leaves stale hashed
        // entries in .vite/deps after HMR/re-optimize (browser keeps old ?v=).
        'three/addons/loaders/GLTFLoader.js',
        'three/addons/renderers/CSS2DRenderer.js',
        'three/addons/libs/meshopt_decoder.module.js',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'vue'],
      alias: [
        // Deep paths (`lodash/startCase`) must rewrite too — a bare `lodash`
        // alias only covers the package root.
        { find: /^lodash$/, replacement: 'lodash-es' },
        { find: /^lodash\/(.+)$/, replacement: 'lodash-es/$1' },
        // Only `@/…` — a bare `@` would also match scoped pkgs like `@astrojs`.
        {
          find: /^@\//,
          replacement: `${path.resolve(import.meta.dirname, './src')}/`,
        },
      ],
    },
  },
});
