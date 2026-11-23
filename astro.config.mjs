// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://kyleduponte.com',
	integrations: [sitemap()],
	redirects: {
		'/resume': '/experience',
	},
	vite: {
		plugins: [tailwindcss()],
		// Pre-bundle the lazily imported 3D and chart libraries when the dev server starts. Otherwise
		// Vite discovers them one page at a time, re-optimizes, and serves "504 Outdated Optimize Dep"
		// to tabs that are already open, which leaves the 3D viewers on their static fallbacks.
		optimizeDeps: {
			include: [
				'three',
				'three/examples/jsm/environments/RoomEnvironment.js',
				'three/examples/jsm/utils/BufferGeometryUtils.js',
				'@observablehq/plot',
			],
		},
	},
});
