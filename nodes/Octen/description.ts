import type { INodeProperties, NodePropertyTypes } from 'n8n-workflow';
import { OPERATIONS, type OctenOperation, type OptionSpec } from './operations';

const show = (operation: OctenOperation[], extra: Record<string, string[]> = {}) => ({
	displayOptions: { show: { operation, ...extra } },
});

const QUERY_REQUIRED: OctenOperation[] = [
	'search',
	'searchPremier',
	'broadSearch',
	'newsSearch',
	'businessSearch',
	'pulseSearch',
	'placeSearch',
	'videoSearch',
];

const KIND_TO_TYPE: Record<OptionSpec['kind'], NodePropertyTypes> = {
	string: 'string',
	list: 'string',
	number: 'number',
	boolean: 'boolean',
	options: 'options',
	multiOptions: 'multiOptions',
	dateTime: 'dateTime',
};

function optionProperty(option: OptionSpec): INodeProperties {
	const property: INodeProperties = {
		displayName: option.displayName,
		name: option.name,
		type: KIND_TO_TYPE[option.kind],
		default: option.default,
		description: option.description,
	};
	if (option.options)
		property.options = [...option.options].sort((a, b) => a.name.localeCompare(b.name));
	if (option.kind === 'number') {
		property.typeOptions = {
			...(option.min !== undefined && { minValue: option.min }),
			...(option.max !== undefined && { maxValue: option.max }),
			numberPrecision: option.decimals ?? 0,
		};
	}
	return property;
}

export const properties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'search',
		options: OPERATIONS.map((o) => ({
			name: o.name,
			value: o.value,
			action: o.action,
			description: o.description,
		})).sort((a, b) => a.name.localeCompare(b.name)),
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. latest Rust release',
		description: 'What to search for, in plain language',
		...show(QUERY_REQUIRED),
	},
	{
		displayName: 'Input Type',
		name: 'inputType',
		type: 'options',
		default: 'text',
		options: [
			{ name: 'Image URL', value: 'image', description: 'Find images similar to an image' },
			{ name: 'Text', value: 'text', description: 'Find images that match a description' },
		],
		description: 'Whether to search by text or by a similar image',
		...show(['imageSearch']),
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. mid-century modern sofa',
		description: 'A description of the images to find',
		...show(['imageSearch'], { inputType: ['text'] }),
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/image.jpg',
		description: 'A public URL of the image to find similar images for',
		...show(['imageSearch'], { inputType: ['image'] }),
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'e.g. SaaS pricing page',
		description: 'The designs to search for. Optional when a Group ID is set in the options.',
		...show(['designSearch']),
	},
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/a, https://example.com/b',
		description:
			'The pages to extract (up to 20), one per line or separated by commas. Commas inside a URL are kept.',
		...show(['extract']),
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return one item per result with the main fields, instead of the full API response',
	},
	...OPERATIONS.map(
		(operation): INodeProperties => ({
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			options: operation.options
				.map(optionProperty)
				.sort((a, b) => a.displayName.localeCompare(b.displayName)),
			...show([operation.value]),
		}),
	),
];
