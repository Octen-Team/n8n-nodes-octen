import { describe, expect, it } from 'vitest';
import { OctenApi } from '../credentials/OctenApi.credentials';

// The credential test was checked against the live API on 2026-11-25: an empty POST /search answers
// HTTP 400 with code 400 for a valid key and HTTP 401 with code 401 for an invalid one.
const credential = new OctenApi();
const field = (name: string) => credential.properties.find((p) => p.name === name);

describe('OctenApi credential', () => {
	it('is named octenApi', () => {
		expect(credential.name).toBe('octenApi');
		expect(credential.displayName).toBe('Octen API');
	});

	it('stores the API key in a password field', () => {
		expect(field('apiKey')?.type).toBe('string');
		expect(field('apiKey')?.typeOptions?.password).toBe(true);
	});

	it('defaults the base URL to the public API', () => {
		expect(field('baseUrl')?.type).toBe('hidden');
		expect(field('baseUrl')?.default).toBe('https://api.octen.ai');
	});

	it('sends the trimmed key in the x-api-key header', () => {
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { 'x-api-key': '={{ $credentials.apiKey.trim() }}' } },
		});
	});

	it('tests the key with a read-only request that only a valid key gets a 2xx answer to', () => {
		expect(credential.test.request).toEqual({
			baseURL: '={{ $credentials.baseUrl }}',
			url: '/monitors',
			method: 'GET',
			qs: { limit: 1 },
		});
		expect(credential.test.rules).toEqual([
			{ type: 'responseCode', properties: { value: 401, message: 'The API key is not valid' } },
		]);
		expect(credential.test.request.ignoreHttpStatusErrors).toBeUndefined();
	});
});
