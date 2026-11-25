import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPERATIONS } from '../nodes/Octen/operations';

// Every option must name a real request field, and its choices and bounds must match the public spec.
type Schema = Record<string, any>;
const spec: Schema = JSON.parse(
	readFileSync(new URL('../testdata/openapi.json', import.meta.url), 'utf8'),
);

function resolve(schema: Schema): Schema {
	let current = schema;
	while (current && current.$ref) {
		current = current.$ref
			.replace(/^#\//, '')
			.split('/')
			.reduce((node: Schema, key: string) => node[key], spec);
	}
	return current;
}

function properties(schema: Schema): Schema {
	const s = resolve(schema);
	const merged: Schema = { ...(s.properties ?? {}) };
	for (const part of [...(s.allOf ?? []), ...(s.anyOf ?? []), ...(s.oneOf ?? [])])
		Object.assign(merged, properties(part));
	return merged;
}

function fieldAt(endpoint: string, path: string[]): Schema | undefined {
	let schema: Schema | undefined =
		spec.paths[endpoint].post.requestBody.content['application/json'].schema;
	for (const key of path) {
		if (!schema) return undefined;
		schema = properties(schema)[key];
	}
	return schema ? resolve(schema) : undefined;
}

describe.each(OPERATIONS.map((o) => [o.value, o] as const))('%s', (_name, operation) => {
	it('calls an endpoint the spec has', () => {
		expect(spec.paths[operation.endpoint]?.post).toBeDefined();
	});

	it.each(operation.options.map((o) => [o.name, o] as const))(
		'option %s matches the spec',
		(_n, option) => {
			const field = fieldAt(operation.endpoint, option.path);
			expect(field, option.path.join('.')).toBeDefined();
			if (option.togglesObject) {
				expect(properties(field!)).toBeTypeOf('object');
				return;
			}
			const scalar = field!.type === 'array' ? resolve(field!.items) : field!;
			if (option.options) {
				const allowed = scalar.enum as string[];
				for (const choice of option.options.filter((c) => c.value !== ''))
					expect(allowed).toContain(choice.value);
			}
			if (option.min !== undefined) expect(option.min).toBe(field!.minimum);
			if (option.max !== undefined) expect(option.max).toBe(field!.maximum);
			if (option.implies)
				expect(resolve(fieldAt(operation.endpoint, option.implies.path)!).enum).toContain(
					option.implies.value,
				);
		},
	);
});
