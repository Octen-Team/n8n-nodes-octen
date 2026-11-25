import { describe, expect, it } from 'vitest';
import { buildBody, OctenInputError } from '../nodes/Octen/request';

// Field names and nesting follow testdata/openapi.json (public spec, downloaded 2026-11-21, checked unchanged 2026-11-25).
describe('buildBody', () => {
	it('sends only the query when no options are set', () => {
		expect(buildBody('search', { query: 'rust' }, {})).toEqual({ query: 'rust' });
		expect(buildBody('newsSearch', { query: 'rust' }, {})).toEqual({ query: 'rust' });
	});

	it('maps every web search option to its API field', () => {
		const body = buildBody(
			'search',
			{ query: 'rust' },
			{
				resultType: 'dynamic',
				count: 10,
				includeDomains: 'a.com, b.com',
				excludeDomains: 'c.com',
				includeText: 'release',
				excludeText: 'beta\nalpha',
				timeBasis: 'published',
				timeRange: 'week',
				language: ['en', 'zh'],
				highlight: false,
				highlightMaxTokens: 300,
				fullContent: true,
				fullContentMaxTokens: 4000,
				format: 'markdown',
				safesearch: 'off',
				includeImages: true,
			},
		);
		expect(body).toEqual({
			query: 'rust',
			result_type: 'dynamic',
			count: 10,
			include_domains: ['a.com', 'b.com'],
			exclude_domains: ['c.com'],
			include_text: ['release'],
			exclude_text: ['beta', 'alpha'],
			time_basis: 'published',
			time_range: 'week',
			language: ['en', 'zh'],
			highlight: { enable: false, max_tokens: 300 },
			full_content: { enable: true, max_tokens: 4000 },
			format: 'markdown',
			safesearch: 'off',
			include_images: true,
		});
	});

	it('sends a start and end time as given', () => {
		expect(
			buildBody(
				'search',
				{ query: 'q' },
				{ startTime: '2026-01-01T00:00:00Z', endTime: '2026-02-01T00:00:00Z' },
			),
		).toEqual({ query: 'q', start_time: '2026-01-01T00:00:00Z', end_time: '2026-02-01T00:00:00Z' });
	});

	it('nests Broad Search options under search_options', () => {
		expect(
			buildBody('broadSearch', { query: 'q' }, { maxQueries: 8, count: 3, language: ['en'] }),
		).toEqual({
			query: 'q',
			max_queries: 8,
			search_options: { count: 3, language: ['en'] },
		});
	});

	it('maps the news subject options', () => {
		expect(
			buildBody('newsSearch', { query: 'q' }, { subjects: true, subjectCount: 3, maxSubNews: 10 }),
		).toEqual({
			query: 'q',
			subjects: { enable: true, count: 3, max_sub_news: 10 },
		});
	});

	it('maps the business entity options', () => {
		expect(
			buildBody(
				'businessSearch',
				{ query: 'q' },
				{ entities: false, entityCount: 4, maxActivities: 6, maxNews: 7 },
			),
		).toEqual({
			query: 'q',
			entities: { enable: false, count: 4, max_activities: 6, max_news: 7 },
		});
	});

	it('maps the Pulse Search options', () => {
		expect(buildBody('pulseSearch', { query: 'q' }, { mode: 'standard', count: 3 })).toEqual({
			query: 'q',
			mode: 'standard',
			count: 3,
		});
	});

	it('maps the place, web result and location options', () => {
		expect(
			buildBody(
				'placeSearch',
				{ query: 'coffee' },
				{
					placeCount: 8,
					webResults: true,
					webCount: 3,
					city: 'Seattle',
					country: 'US',
					latitude: 47.6,
					longitude: -122.3,
					radius: 2000,
				},
			),
		).toEqual({
			query: 'coffee',
			places: { count: 8 },
			web_search: { enable: true, count: 3 },
			user_location: { type: 'approximate', city: 'Seattle', country: 'US' },
			latitude: 47.6,
			longitude: -122.3,
			radius: 2000,
		});
	});

	it('builds the Image Search input from text or an image URL', () => {
		expect(
			buildBody('imageSearch', { inputType: 'text', query: 'red sofa' }, { count: 3 }),
		).toEqual({
			inputs: [{ type: 'text', data: 'red sofa' }],
			count: 3,
		});
		expect(
			buildBody('imageSearch', { inputType: 'image', imageUrl: 'https://x.com/a.png' }, {}),
		).toEqual({
			inputs: [{ type: 'image', url: 'https://x.com/a.png' }],
		});
	});

	it('builds the Video Search input from the query', () => {
		expect(buildBody('videoSearch', { query: 'drone shots' }, { timeRange: 'month' })).toEqual({
			inputs: [{ type: 'text', data: 'drone shots' }],
			time_range: 'month',
		});
	});

	it('maps the Design Search image and web options', () => {
		expect(
			buildBody(
				'designSearch',
				{ query: 'pricing page' },
				{
					imageCount: 6,
					designFacts: false,
					snippet: true,
					snippetMaxTokens: 800,
					groupId: 'g1',
					webResults: false,
				},
			),
		).toEqual({
			query: 'pricing page',
			images: {
				count: 6,
				design_facts: false,
				snippet: { enable: true, max_tokens: 800 },
				group_id: 'g1',
			},
			web_search: { enable: false },
		});
	});

	it('allows Design Search without a query when a group ID is set', () => {
		expect(buildBody('designSearch', { query: '' }, { groupId: 'g1' })).toEqual({
			images: { group_id: 'g1' },
		});
	});

	it('splits Extract URLs on commas and new lines', () => {
		expect(
			buildBody(
				'extract',
				{ urls: 'https://a.com, https://b.com\nhttps://c.com' },
				{
					mode: 'auto',
					query: 'pricing',
					includeLinks: true,
					linkScope: 'prefer_external',
					maxLinks: 50,
				},
			),
		).toEqual({
			urls: ['https://a.com', 'https://b.com', 'https://c.com'],
			mode: 'auto',
			query: 'pricing',
			include_links: { scope: 'prefer_external', max_links: 50 },
		});
	});

	it('keeps commas that are part of an Extract URL', () => {
		expect(buildBody('extract', { urls: 'https://example.com/map?center=47.6062,-122.3321' }, {})).toEqual({
			urls: ['https://example.com/map?center=47.6062,-122.3321'],
		});
		expect(buildBody('extract', { urls: 'https://a.com/x?p=1,2, https://b.com\nhttp://c.com/a,b' }, {})).toEqual({
			urls: ['https://a.com/x?p=1,2', 'https://b.com', 'http://c.com/a,b'],
		});
		expect(
			buildBody('extract', { urls: 'https://example.com/?sources=https://a.example,https://b.example' }, {}),
		).toEqual({ urls: ['https://example.com/?sources=https://a.example,https://b.example'] });
		expect(buildBody('extract', { urls: 'https://a.com/x,\nhttps://b.com' }, {})).toEqual({
			urls: ['https://a.com/x,', 'https://b.com'],
		});
		expect(buildBody('extract', { urls: 'https://a.com/x, \t\nhttps://b.com' }, {})).toEqual({
			urls: ['https://a.com/x,', 'https://b.com'],
		});
	});

	it('leaves out the link options while Include Links is off', () => {
		expect(
			buildBody(
				'extract',
				{ urls: 'https://a.com' },
				{ linkScope: 'prefer_external', maxLinks: 5 },
			),
		).toEqual({
			urls: ['https://a.com'],
		});
		expect(
			buildBody('extract', { urls: 'https://a.com' }, { includeLinks: false, maxLinks: 5 }),
		).toEqual({
			urls: ['https://a.com'],
		});
		expect(buildBody('extract', { urls: 'https://a.com' }, { includeLinks: true })).toEqual({
			urls: ['https://a.com'],
			include_links: {},
		});
	});

	it('drops empty strings and empty lists', () => {
		expect(
			buildBody('search', { query: 'q' }, { includeDomains: ' , ', timeRange: '', language: [] }),
		).toEqual({
			query: 'q',
		});
	});

	it('accepts numbers given as strings, as AI agents often send them', () => {
		expect(buildBody('search', { query: 'q' }, { count: '7' })).toEqual({ query: 'q', count: 7 });
	});

	it('rejects a number that is not numeric', () => {
		expect(() => buildBody('search', { query: 'q' }, { count: 'five' })).toThrow(OctenInputError);
	});

	it('requires a query for the search operations', () => {
		expect(() => buildBody('search', { query: '  ' }, {})).toThrow(OctenInputError);
		expect(() => buildBody('designSearch', { query: '' }, {})).toThrow(OctenInputError);
	});

	it('requires at least one URL for Extract', () => {
		expect(() => buildBody('extract', { urls: ' ' }, {})).toThrow(OctenInputError);
	});
});
