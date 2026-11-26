import {
	NodeApiError,
	NodeOperationError,
	type IExecuteFunctions,
	type IHttpRequestOptions,
} from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { Octen } from '../nodes/Octen/Octen.node';

type Params = Record<string, unknown>;
interface Call {
	credential: string;
	url: string;
	body: unknown;
	timeout?: number;
}

function context(
	itemParams: Params[],
	responses: Array<{ statusCode: number; body: unknown }>,
	continueOnFail = false,
) {
	const calls: Call[] = [];
	const ctx = {
		getInputData: () => itemParams.map(() => ({ json: {} })),
		getCredentials: async () => ({ apiKey: 'your-api-key', baseUrl: 'https://api.octen.ai' }),
		getNodeParameter: (name: string, index: number, fallback?: unknown) =>
			itemParams[index][name] ?? fallback,
		getNode: () => ({ name: 'Octen', type: 'octen', typeVersion: 1, parameters: {} }),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential: string, request: IHttpRequestOptions) => {
				calls.push({ credential, url: request.url, body: request.body, timeout: request.timeout });
				const response = responses[calls.length - 1];
				if (!response) throw new Error('unexpected request');
				return response;
			},
		},
	};
	return { ctx, calls };
}

const success = (results: object[]) => ({
	statusCode: 200,
	body: { code: 0, msg: 'success', request_id: 'r1', data: { query: 'q', results } },
});
const result = { title: 'T', url: 'https://u' };

describe('Octen node', () => {
	it('lets users enter one URL per line for Extract', () => {
		const urls = new Octen().description.properties.find((p) => p.name === 'urls');
		expect(urls?.typeOptions?.rows).toBeGreaterThan(1);
	});

	it('sends one request per input item and pairs the output items', async () => {
		const { ctx, calls } = context(
			[
				{ operation: 'search', query: 'a', options: {}, simplify: true },
				{ operation: 'newsSearch', query: 'b', options: { count: 2 }, simplify: true },
			],
			[success([result]), success([result, result])],
		);
		const [out] = await new Octen().execute.call(ctx as unknown as IExecuteFunctions);
		expect(calls).toEqual([
			{
				credential: 'octenApi',
				url: 'https://api.octen.ai/search',
				body: { query: 'a' },
				timeout: undefined,
			},
			{
				credential: 'octenApi',
				url: 'https://api.octen.ai/news-search',
				body: { query: 'b', count: 2 },
				timeout: undefined,
			},
		]);
		expect(out.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }, { item: 1 }]);
		expect(out[0].json).toEqual({ type: 'web', title: 'T', url: 'https://u' });
	});

	it('reads only the inputs the selected operation uses', async () => {
		// A hidden field can still hold an expression that fails, such as one that points at a deleted node
		const failing = (name: string) => () => {
			throw new Error(`${name} should not be read`);
		};
		for (const [params, unused] of [
			[
				{ operation: 'search', query: 'a', options: {}, simplify: true },
				['inputType', 'imageUrl', 'urls'],
			],
			[
				{ operation: 'imageSearch', inputType: 'text', query: 'a', options: {}, simplify: true },
				['imageUrl', 'urls'],
			],
			[
				{
					operation: 'imageSearch',
					inputType: 'image',
					imageUrl: 'https://i/1.png',
					options: {},
					simplify: true,
				},
				['query', 'urls'],
			],
			[
				{ operation: 'extract', urls: 'https://a.com', options: {}, simplify: true },
				['query', 'inputType', 'imageUrl'],
			],
		] as const) {
			const { ctx } = context([params], [success([result])]);
			const read = ctx.getNodeParameter;
			ctx.getNodeParameter = (name: string, index: number, fallback?: unknown) =>
				(unused as readonly string[]).includes(name)
					? failing(name)()
					: read(name, index, fallback);
			await expect(
				new Octen().execute.call(ctx as unknown as IExecuteFunctions),
				params.operation,
			).resolves.toBeDefined();
		}
	});

	it('gives Broad Search a longer timeout', async () => {
		const { ctx, calls } = context(
			[{ operation: 'broadSearch', query: 'a', options: {}, simplify: false }],
			[{ statusCode: 200, body: { code: 0, data: { search_results: [] } } }],
		);
		await new Octen().execute.call(ctx as unknown as IExecuteFunctions);
		expect(calls[0].timeout).toBe(120000);
	});

	it('fails on HTTP 200 with a non-zero code and shows the message and request ID', async () => {
		const { ctx } = context(
			[{ operation: 'search', query: 'a', options: {}, simplify: true }],
			[{ statusCode: 200, body: { code: 1001, msg: 'Quota exceeded', request_id: 'r9' } }],
		);
		const error = await new Octen().execute
			.call(ctx as unknown as IExecuteFunctions)
			.catch((e) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Quota exceeded');
		expect(error.description).toBe('Request ID: r9');
		expect(error.httpCode).toBe('200');
	});

	it('reports a missing query without calling the API', async () => {
		const { ctx, calls } = context(
			[{ operation: 'search', query: ' ', options: {}, simplify: true }],
			[],
		);
		const error = await new Octen().execute
			.call(ctx as unknown as IExecuteFunctions)
			.catch((e) => e);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect(calls).toEqual([]);
	});

	it('keeps going after a failed item when Continue On Fail is set', async () => {
		const { ctx } = context(
			[
				{ operation: 'search', query: 'a', options: {}, simplify: true },
				{ operation: 'search', query: 'b', options: {}, simplify: true },
			],
			[
				success([result]),
				{ statusCode: 401, body: { code: 401, msg: 'Invalid API Key.', request_id: 'r2' } },
			],
			true,
		);
		const [out] = await new Octen().execute.call(ctx as unknown as IExecuteFunctions);
		expect(out).toEqual([
			{ json: { type: 'web', title: 'T', url: 'https://u' }, pairedItem: { item: 0 } },
			{ json: { error: 'Invalid API Key.' }, pairedItem: { item: 1 } },
		]);
	});
});
