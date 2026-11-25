import type { IDataObject } from 'n8n-workflow';
import { getOperation, type OctenOperation, type OptionSpec } from './operations';

/** A parameter value the node cannot send */
export class OctenInputError extends Error {}

function splitList(value: unknown): string[] {
	const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,\n]/);
	return parts.map((part) => String(part).trim()).filter((part) => part !== '');
}

/** URLs may contain commas, even other URLs, so only a new line or a comma followed by a space separates two */
function splitUrls(value: unknown): string[] {
	if (Array.isArray(value)) return splitList(value);
	return String(value ?? '')
		.split(/\n|,\s+/)
		.map((url) => url.trim())
		.filter((url) => url !== '');
}

function setPath(body: IDataObject, path: string[], value: unknown): void {
	let target = body;
	for (const key of path.slice(0, -1)) {
		if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
		target = target[key] as IDataObject;
	}
	target[path[path.length - 1]] = value as IDataObject[string];
}

/** Converts one option value; undefined means "leave it out of the request" */
function convert(spec: OptionSpec, value: unknown): unknown {
	if (value === undefined || value === null) return undefined;
	switch (spec.kind) {
		case 'list':
		case 'multiOptions': {
			const list = splitList(value);
			return list.length > 0 ? list : undefined;
		}
		case 'number': {
			if (typeof value === 'string' && value.trim() === '') return undefined;
			const number = typeof value === 'number' ? value : Number(String(value).trim());
			if (!Number.isFinite(number)) {
				throw new OctenInputError(
					`${spec.displayName} must be a number, but got "${String(value)}"`,
				);
			}
			return number;
		}
		case 'boolean':
			if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
			return Boolean(value);
		default: {
			const text = String(value).trim();
			return text === '' ? undefined : text;
		}
	}
}

function requireText(value: unknown, what: string): string {
	const text = String(value ?? '').trim();
	if (text === '') throw new OctenInputError(`${what} is required`);
	return text;
}

function primaryBody(
	operation: OctenOperation,
	primary: IDataObject,
	options: IDataObject,
): IDataObject {
	switch (operation) {
		case 'extract': {
			const urls = splitUrls(primary.urls);
			if (urls.length === 0) throw new OctenInputError('At least one URL is required');
			return { urls };
		}
		case 'imageSearch':
			return primary.inputType === 'image'
				? { inputs: [{ type: 'image', url: requireText(primary.imageUrl, 'Image URL') }] }
				: { inputs: [{ type: 'text', data: requireText(primary.query, 'Query') }] };
		case 'videoSearch':
			return { inputs: [{ type: 'text', data: requireText(primary.query, 'Query') }] };
		case 'designSearch': {
			const query = String(primary.query ?? '').trim();
			if (query === '' && String(options.groupId ?? '').trim() === '') {
				throw new OctenInputError('Query is required unless a Group ID is set');
			}
			return query === '' ? {} : { query };
		}
		default:
			return { query: requireText(primary.query, 'Query') };
	}
}

/**
 * Builds the request body for an operation. Options left empty are not sent, so the API defaults apply.
 * Field names and nesting follow the public OpenAPI spec (testdata/openapi.json).
 */
export function buildBody(
	operation: OctenOperation,
	primary: IDataObject,
	options: IDataObject,
): IDataObject {
	const spec = getOperation(operation);
	const body = primaryBody(operation, primary, options);
	const turnedOff: string[][] = [];
	for (const option of spec.options) {
		const value = convert(option, options[option.name]);
		// The sub-options of a toggle (such as the link scope) only apply while the toggle is on
		if (option.togglesObject) {
			if (value === true) setPath(body, option.path, (body[option.path[0]] as IDataObject) ?? {});
			else turnedOff.push(option.path);
			continue;
		}
		if (value === undefined) continue;
		setPath(body, option.path, value);
		if (option.implies) setPath(body, option.implies.path, option.implies.value);
	}
	for (const path of turnedOff) delete body[path[0]];
	return body;
}
