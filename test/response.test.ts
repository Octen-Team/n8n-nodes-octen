import { describe, expect, it } from 'vitest';
import { assertOk, OctenResponseError, toItems } from '../nodes/Octen/response';

// Response shapes follow the 200 schemas in testdata/openapi.json; the sample values are made up.
const web = {
	title: 'Rust 1.99.1',
	url: 'https://blog.rust-lang.org/',
	highlight: 'Rust 1.99.1 is out',
	authors: 'The Rust Team',
	time_published: '2026-11-20T00:00:00Z',
	time_last_crawled: '2026-11-21T00:00:00Z',
	favicon: 'https://blog.rust-lang.org/favicon.ico',
};
const simpleWeb = {
	type: 'web',
	title: 'Rust 1.99.1',
	url: 'https://blog.rust-lang.org/',
	highlight: 'Rust 1.99.1 is out',
	time_published: '2026-11-20T00:00:00Z',
};
const ok = (data: object) => ({ code: 0, msg: 'success', request_id: 'r1', data, meta: { latency: 1 } });

describe('assertOk', () => {
	it('accepts code 0', () => {
		expect(() => assertOk(200, ok({}))).not.toThrow();
	});

	it('rejects HTTP 200 with a non-zero code and keeps the message and request ID', () => {
		try {
			assertOk(200, { code: 1001, msg: 'Quota exceeded', request_id: 'r9' });
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(OctenResponseError);
			expect((e as OctenResponseError).message).toBe('Quota exceeded');
			expect((e as OctenResponseError).requestId).toBe('r9');
			expect((e as OctenResponseError).httpCode).toBe(200);
		}
	});

	it('rejects HTTP errors even when the body has no code', () => {
		expect(() => assertOk(502, 'Bad Gateway')).toThrow(OctenResponseError);
	});

	it('rejects a body that is not an Octen envelope', () => {
		expect(() => assertOk(200, 'not json')).toThrow(OctenResponseError);
	});
});

describe('toItems', () => {
	it('returns the whole body when simplify is off', () => {
		const body = ok({ query: 'q', results: [web] });
		expect(toItems('search', body, false)).toEqual([body]);
	});

	it('returns one simplified item per web result', () => {
		expect(toItems('search', ok({ query: 'q', results: [web, web] }), true)).toEqual([simpleWeb, simpleWeb]);
	});

	it('keeps the full content when the API returned it', () => {
		expect(toItems('pulseSearch', ok({ results: [{ ...web, highlight: undefined, full_content: 'long text' }] }), true)).toEqual([
			{ type: 'web', title: web.title, url: web.url, full_content: 'long text', time_published: web.time_published },
		]);
	});

	it('adds the sub-query to Broad Search results', () => {
		const body = ok({ query: 'q', queries: ['a', 'b'], search_results: [{ query: 'a', results: [web] }, { query: 'b', results: [] }] });
		expect(toItems('broadSearch', body, true)).toEqual([{ ...simpleWeb, query: 'a' }]);
	});

	it('returns news subjects before the articles', () => {
		const subject = { name: 'Rust release', summary: 'New version', time_start: 's', time_latest: 'l', top_news: { title: 't', url: 'u' }, sub_news: [] };
		expect(toItems('newsSearch', ok({ results: [web], subjects: [subject] }), true)).toEqual([
			{ type: 'subject', name: 'Rust release', summary: 'New version', time_latest: 'l', top_news: { title: 't', url: 'u' } },
			simpleWeb,
		]);
	});

	it('returns business entity cards as they are, before the articles', () => {
		const entity = { type: 'company', name: 'Acme', website: 'https://acme.com' };
		expect(toItems('businessSearch', ok({ results: [web], entities: [entity] }), true)).toEqual([
			{ ...entity, type: 'entity', entity_type: 'company' },
			simpleWeb,
		]);
	});

	it('returns places before the web results', () => {
		const place = { name: 'Cafe', category: 'cafe', address: '1 Main St', latitude: 1, longitude: 2, rating: 4.5, review_count: 10, phone: 'p', website: 'w', distance: 120, opening_hours: ['Mon 8-5'], status: 'open', attributes: {} };
		expect(toItems('placeSearch', ok({ places: [place], results: [web] }), true)).toEqual([
			{ type: 'place', name: 'Cafe', category: 'cafe', address: '1 Main St', rating: 4.5, review_count: 10, distance: 120, phone: 'p', website: 'w', status: 'open', latitude: 1, longitude: 2 },
			simpleWeb,
		]);
	});

	it('returns media results for Image, Video and Design Search', () => {
		const image = { title: 'Sofa', url: 'https://i/1.jpg', source_page: 'https://p', width: 800, height: 600, thumbnail: 't' };
		expect(toItems('imageSearch', ok({ results: [image] }), true)).toEqual([
			{ type: 'image', title: 'Sofa', url: 'https://i/1.jpg', source_page: 'https://p', width: 800, height: 600 },
		]);
		const video = { title: 'Clip', url: 'https://v/1', source_page: 'https://p', cover_url: 'c', duration_seconds: 30, authors: 'a', time_published: 'tp' };
		expect(toItems('videoSearch', ok({ results: [video] }), true)).toEqual([
			{ type: 'video', title: 'Clip', url: 'https://v/1', source_page: 'https://p', duration_seconds: 30, time_published: 'tp' },
		]);
		const design = { type: 'web_page', title: 'Pricing', url: 'https://d/1.png', source_page: 'https://p', width: 1, height: 2, design_facts: { colors: [] }, snippet: '<div/>' };
		expect(toItems('designSearch', ok({ images: [design], results: [web] }), true)).toEqual([
			{ type: 'design', image_type: 'web_page', title: 'Pricing', url: 'https://d/1.png', source_page: 'https://p', width: 1, height: 2, design_facts: { colors: [] }, snippet: '<div/>' },
			simpleWeb,
		]);
	});

	it('returns one page per Extract URL, including the failed ones', () => {
		const page = { url: 'https://a.com', status: 'success', title: 'A', full_content: 'text', time_published: 'tp', favicon: 'f' };
		const failed = { url: 'https://b.com', status: 'failed', error_message: 'Timeout' };
		expect(toItems('extract', ok({ results: [page, failed] }), true)).toEqual([
			{ type: 'page', url: 'https://a.com', status: 'success', title: 'A', full_content: 'text', time_published: 'tp' },
			{ type: 'page', url: 'https://b.com', status: 'failed', error_message: 'Timeout' },
		]);
	});

	it('returns the highlights Extract gives for a query', () => {
		const page = { url: 'https://a.com', status: 'success', title: 'A', highlights: ['price is 5'] };
		expect(toItems('extract', ok({ results: [page] }), true)).toEqual([{ type: 'page', ...page }]);
	});

	it('returns no items when there are no results', () => {
		expect(toItems('search', ok({ query: 'q', results: [] }), true)).toEqual([]);
	});

	it('ignores fields it does not know', () => {
		expect(toItems('search', ok({ results: [{ ...web, new_field: 1 }], new_section: [1] }), true)).toEqual([simpleWeb]);
	});
});
