import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Rules from the n8n verification guidelines for community nodes.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('package.json', () => {
	it('uses a scoped n8n community node name', () => {
		expect(pkg.name).toMatch(/^@[a-z0-9.-]+\/n8n-nodes-[a-z0-9-]+$/);
	});

	it('declares the community node keyword', () => {
		expect(pkg.keywords).toContain('n8n-community-node-package');
	});

	it('is MIT licensed', () => {
		expect(pkg.license).toBe('MIT');
	});

	it('has no run-time dependencies', () => {
		expect(pkg.dependencies ?? {}).toEqual({});
	});

	it('points npm at the public GitHub repository', () => {
		expect(pkg.repository.url).toBe('git+https://github.com/Octen-Team/n8n-nodes-octen.git');
	});
});
