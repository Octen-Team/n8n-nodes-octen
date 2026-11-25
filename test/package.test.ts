import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Rules from the n8n verification guidelines for community nodes.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('package.json', () => {
	it('uses an n8n community node name without a dot in the package part', () => {
		// n8n splits a node type such as "<package>.octen" at the first dot, so the package name must not contain one
		expect(pkg.name).toBe('n8n-nodes-octen-official');
		expect(pkg.name).not.toContain('.');
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
