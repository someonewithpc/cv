// @ts-check
import path from "path";

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
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
    icon({
      include: {
        lucide: ['external-link'],
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
