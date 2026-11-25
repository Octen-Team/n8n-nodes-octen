import { describe, expect, it } from 'vitest';
import { OctenApi } from '../credentials/OctenApi.credentials';
import { checkCredentialResponse, octenApiTest } from '../credentials/credentialTest';

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

	it('tests the key with octenApiTest', () => {
		expect(credential.test).toBe(octenApiTest);
	});
});

describe('checkCredentialResponse', () => {
	// Live responses to an empty POST /search, recorded 2026-11-25.
	const valid = { code: 400, msg: 'Invalid params. Missing parameter query', request_id: 'r1' };
	const invalid = { code: 401, msg: 'Invalid API Key.', request_id: 'r2' };

	it('accepts only the validation answer a valid key gets', () => {
		expect(checkCredentialResponse(400, valid)).toEqual({
			status: 'OK',
			message: 'Connection successful',
		});
	});

	it('rejects an invalid key', () => {
		expect(checkCredentialResponse(401, invalid)).toEqual({
			status: 'Error',
			message: 'The API key is not valid',
		});
	});

	it('does not report success when the key could not be checked', () => {
		for (const [status, body] of [
			[429, { code: 429, msg: 'Too many requests', request_id: 'r3' }],
			[500, { code: 500, msg: 'Internal error', request_id: 'r4' }],
			[200, { code: 0, data: {} }],
			[502, 'Bad Gateway'],
			[400, { code: 400, msg: 'Invalid params. Something else' }],
		] as const) {
			const result = checkCredentialResponse(status, body);
			expect(result.status, JSON.stringify(body)).toBe('Error');
			expect(result.message).toMatch(/could not be checked/);
		}
	});
});
