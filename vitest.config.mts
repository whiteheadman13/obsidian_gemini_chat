import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const obsidianMockPath = fileURLToPath(new URL('./src/test/mocks/obsidian.ts', import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: obsidianMockPath,
		},
	},
});
