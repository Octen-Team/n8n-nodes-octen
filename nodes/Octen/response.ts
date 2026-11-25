import type { IDataObject } from 'n8n-workflow';
import type { OctenOperation } from './operations';

/** The API did not return a usable result */
export class OctenResponseError extends Error {
	constructor(
		message: string,
		readonly httpCode: number,
		readonly requestId?: string,
		readonly code?: number,
	) {
		super(message);
	}
}

const isObject = (value: unknown): value is IDataObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Throws unless the response is a success. The API can answer HTTP 200 with a non-zero `code`,
 * so both the status and the code are checked.
 */
export function assertOk(httpCode: number, body: unknown): asserts body is IDataObject {
	const okStatus = httpCode >= 200 && httpCode < 300;
	if (!isObject(body) || typeof body.code !== 'number') {
		throw new OctenResponseError(
			okStatus
				? 'The Octen API returned a response the node cannot read'
				: `The Octen API answered HTTP ${httpCode}`,
			httpCode,
		);
	}
	if (okStatus && body.code === 0) return;
	const message =
		typeof body.msg === 'string' && body.msg !== ''
			? body.msg
			: `The Octen API answered code ${body.code}`;
	const requestId = typeof body.request_id === 'string' ? body.request_id : undefined;
	throw new OctenResponseError(message, httpCode, requestId, body.code);
}

function pick(source: IDataObject, keys: string[]): IDataObject {
	const out: IDataObject = {};
	for (const key of keys) {
		const value = source[key];
		if (value !== undefined && value !== null && value !== '') out[key] = value;
	}
	return out;
}

const list = (value: unknown): IDataObject[] =>
	Array.isArray(value) ? value.filter(isObject) : [];

const web = (result: IDataObject): IDataObject => ({
	type: 'web',
	// Content the user can turn on (full content, images) is kept whenever the API returns it
	...pick(result, [
		'title',
		'url',
		'highlight',
		'full_content',
		'time_published',
		'cover_image',
		'images',
	]),
});

/**
 * Turns a successful response into n8n items. With simplify off, the whole response is one item.
 * With simplify on, each result is one item with a `type`, keeping the fields most workflows use.
 */
export function toItems(
	operation: OctenOperation,
	body: IDataObject,
	simplify: boolean,
): IDataObject[] {
	if (!simplify) return [body];
	const data = isObject(body.data) ? body.data : {};
	const results = list(data.results);
	switch (operation) {
		case 'broadSearch':
			return list(data.search_results).flatMap((group) =>
				list(group.results).map((result) => ({ ...web(result), query: group.query })),
			);
		case 'newsSearch':
			return [
				...list(data.subjects).map((subject) => ({
					type: 'subject',
					...pick(subject, ['name', 'summary', 'time_latest', 'top_news', 'sub_news']),
				})),
				...results.map(web),
			];
		case 'businessSearch':
			return [
				...list(data.entities).map((entity) => ({
					...entity,
					type: 'entity',
					entity_type: entity.type,
				})),
				...results.map(web),
			];
		case 'placeSearch':
			return [
				...list(data.places).map((place) => ({
					type: 'place',
					...pick(place, [
						'name',
						'category',
						'address',
						'rating',
						'review_count',
						'distance',
						'phone',
						'website',
						'status',
						'latitude',
						'longitude',
					]),
				})),
				...results.map(web),
			];
		case 'imageSearch':
			return results.map((r) => ({
				type: 'image',
				...pick(r, ['title', 'url', 'source_page', 'width', 'height']),
			}));
		case 'videoSearch':
			return results.map((r) => ({
				type: 'video',
				...pick(r, ['title', 'url', 'source_page', 'duration_seconds', 'time_published']),
			}));
		case 'designSearch':
			return [
				...list(data.images).map((image) => ({
					type: 'design',
					image_type: image.type,
					// group carries the group_id that a follow-up Design Search takes
					...pick(image, [
						'title',
						'url',
						'source_page',
						'width',
						'height',
						'group',
						'design_facts',
						'snippet',
					]),
				})),
				...results.map(web),
			];
		case 'extract':
			return results.map((r) => ({
				type: 'page',
				...pick(r, [
					'url',
					'status',
					'title',
					'full_content',
					'highlights',
					'time_published',
					'error_message',
					// Only returned when the matching Include option is on
					'cover_image',
					'images',
					'videos',
					'audio',
					'links',
				]),
			}));
		default:
			return results.map(web);
	}
}
