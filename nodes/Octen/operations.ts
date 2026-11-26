export type OctenOperation =
	| 'search'
	| 'searchPremier'
	| 'broadSearch'
	| 'newsSearch'
	| 'businessSearch'
	| 'pulseSearch'
	| 'placeSearch'
	| 'imageSearch'
	| 'videoSearch'
	| 'designSearch'
	| 'extract';

export type OptionKind =
	| 'string'
	| 'number'
	| 'boolean'
	| 'options'
	| 'multiOptions'
	| 'list'
	| 'dateTime';

export interface OptionSpec {
	name: string;
	displayName: string;
	/** Where the value goes in the request body */
	path: string[];
	kind: OptionKind;
	default: string | number | boolean | string[];
	description: string;
	options?: Array<{ name: string; value: string }>;
	min?: number;
	max?: number;
	decimals?: number;
	/** Another field the API needs whenever this one is sent */
	implies?: { path: string[]; value: string };
	/** For a boolean that switches a whole object on or off */
	togglesObject?: boolean;
}

export interface OperationSpec {
	value: OctenOperation;
	name: string;
	action: string;
	description: string;
	endpoint: string;
	timeoutMs?: number;
	options: OptionSpec[];
}

const LANGUAGES: Array<[string, string]> = [
	['Arabic', 'ar'],
	['Chinese', 'zh'],
	['Dutch', 'nl'],
	['English', 'en'],
	['French', 'fr'],
	['German', 'de'],
	['Hindi', 'hi'],
	['Indonesian', 'id'],
	['Italian', 'it'],
	['Japanese', 'ja'],
	['Korean', 'ko'],
	['Polish', 'pl'],
	['Portuguese', 'pt'],
	['Russian', 'ru'],
	['Spanish', 'es'],
	['Thai', 'th'],
	['Turkish', 'tr'],
	['Vietnamese', 'vi'],
];

const choices = (...values: Array<[string, string]>) =>
	values.map(([name, value]) => ({ name, value }));

const count = (
	path: string[],
	max: number,
	displayName = 'Count',
	what = 'results',
): OptionSpec => ({
	name:
		displayName === 'Count'
			? 'count'
			: displayName.replace(/\s+/g, '').replace(/^./, (c) => c.toLowerCase()),
	displayName,
	path,
	kind: 'number',
	default: 5,
	min: 1,
	max,
	description: `Number of ${what} to return, from 1 to ${max}`,
});

const domainOptions = (prefix: string[], maxItems = 1200): OptionSpec[] => [
	{
		name: 'includeDomains',
		displayName: 'Include Domains',
		path: [...prefix, 'include_domains'],
		kind: 'list',
		default: '',
		description: `Only return results from these domains, separated by commas (up to ${maxItems})`,
	},
	{
		name: 'excludeDomains',
		displayName: 'Exclude Domains',
		path: [...prefix, 'exclude_domains'],
		kind: 'list',
		default: '',
		description: `Never return results from these domains, separated by commas (up to ${maxItems})`,
	},
];

const textOptions = (prefix: string[]): OptionSpec[] => [
	{
		name: 'includeText',
		displayName: 'Include Text',
		path: [...prefix, 'include_text'],
		kind: 'list',
		default: '',
		description: 'Strings that must appear in the page text, separated by commas (up to 5)',
	},
	{
		name: 'excludeText',
		displayName: 'Exclude Text',
		path: [...prefix, 'exclude_text'],
		kind: 'list',
		default: '',
		description: 'Strings that must not appear in the page text, separated by commas (up to 5)',
	},
];

const timeRange = (path: string[], basis: string): OptionSpec => ({
	name: 'timeRange',
	displayName: 'Time Range',
	path,
	kind: 'options',
	default: '',
	options: choices(
		['Any Time', ''],
		['Past Day', 'day'],
		['Past Week', 'week'],
		['Past Month', 'month'],
		['Past Year', 'year'],
	),
	description: `Only return results from this window, counted back from now by ${basis}. Do not combine with a start or end time.`,
});

const startEnd = (prefix: string[], basis: string): OptionSpec[] => [
	{
		name: 'startTime',
		displayName: 'Start Time',
		path: [...prefix, 'start_time'],
		kind: 'dateTime',
		default: '',
		description: `Only return results with a ${basis} at or after this time (ISO 8601)`,
	},
	{
		name: 'endTime',
		displayName: 'End Time',
		path: [...prefix, 'end_time'],
		kind: 'dateTime',
		default: '',
		description: `Only return results with a ${basis} at or before this time (ISO 8601)`,
	},
];

const timeOptions = (prefix: string[]): OptionSpec[] => [
	{
		name: 'timeBasis',
		displayName: 'Time Basis',
		path: [...prefix, 'time_basis'],
		kind: 'options',
		default: 'auto',
		options: choices(
			['Auto', 'auto'],
			['Published Time', 'published'],
			['Crawled Time', 'crawled'],
		),
		description: 'Which time the time filters use',
	},
	timeRange([...prefix, 'time_range'], 'the time basis'),
	...startEnd(prefix, 'time'),
];

const language = (path: string[]): OptionSpec => ({
	name: 'language',
	displayName: 'Language',
	path,
	kind: 'multiOptions',
	default: [],
	options: choices(...LANGUAGES),
	description: 'Only return results in these languages. Leave empty for any language.',
});

const contentOptions = (prefix: string[]): OptionSpec[] => [
	{
		name: 'highlight',
		displayName: 'Highlight',
		path: [...prefix, 'highlight', 'enable'],
		kind: 'boolean',
		default: true,
		description: 'Whether to return the passage of each page that best matches the query',
	},
	{
		name: 'highlightMaxTokens',
		displayName: 'Highlight Max Tokens',
		path: [...prefix, 'highlight', 'max_tokens'],
		kind: 'number',
		default: 512,
		min: 100,
		max: 20000,
		description: 'Maximum tokens per highlight, from 100 to 20000',
	},
	{
		name: 'fullContent',
		displayName: 'Full Content',
		path: [...prefix, 'full_content', 'enable'],
		kind: 'boolean',
		default: false,
		description: 'Whether to return the full text of each page',
	},
	{
		name: 'fullContentMaxTokens',
		displayName: 'Full Content Max Tokens',
		path: [...prefix, 'full_content', 'max_tokens'],
		kind: 'number',
		default: 2048,
		min: 100,
		max: 100000,
		description: 'Maximum tokens of full text per page, from 100 to 100000',
	},
];

const safesearch = (path: string[]): OptionSpec => ({
	name: 'safesearch',
	displayName: 'Safe Search',
	path,
	kind: 'options',
	default: 'strict',
	options: choices(['Strict', 'strict'], ['Off', 'off']),
	description: 'Whether to drop adult content',
});

const includeImages = (path: string[]): OptionSpec => ({
	name: 'includeImages',
	displayName: 'Include Images',
	path,
	kind: 'boolean',
	default: false,
	description: 'Whether to return the images found on each page',
});

/** The options /search takes, which /search-premier and the Broad Search search_options share */
const webSearchOptions = (prefix: string[]): OptionSpec[] => [
	{
		name: 'resultType',
		displayName: 'Result Type',
		path: [...prefix, 'result_type'],
		kind: 'options',
		default: 'standard',
		options: choices(['Standard', 'standard'], ['Dynamic', 'dynamic']),
		description:
			'Standard returns results as the options say. Dynamic lets Octen choose how many results and how much text to return, up to the count.',
	},
	count([...prefix, 'count'], 100),
	...domainOptions(prefix),
	...textOptions(prefix),
	...timeOptions(prefix),
	language([...prefix, 'language']),
	...contentOptions(prefix),
	{
		name: 'format',
		displayName: 'Format',
		path: [...prefix, 'format'],
		kind: 'options',
		default: 'text',
		options: choices(['Text', 'text'], ['Markdown', 'markdown']),
		description: 'Format of the highlights',
	},
	safesearch([...prefix, 'safesearch']),
	includeImages([...prefix, 'include_images']),
];

/** The web result options of Place Search and Design Search, under web_search */
const webResultOptions = (enabledByDefault: boolean): OptionSpec[] => {
	const options: OptionSpec[] = [
		{
			name: 'webResults',
			displayName: 'Web Results',
			path: ['web_search', 'enable'],
			kind: 'boolean',
			default: enabledByDefault,
			description: 'Whether to also return web results',
		},
		count(['web_search', 'count'], 100, 'Web Count', 'web results'),
		...contentOptions(['web_search']),
		...domainOptions(['web_search']),
		language(['web_search', 'language']),
		...timeOptions(['web_search']),
	];
	const note = enabledByDefault
		? 'Applies to the web results only'
		: 'Applies to the web results only, which Web Results turns on';
	return options.map((option) =>
		option.name === 'webResults'
			? option
			: { ...option, description: `${option.description.replace(/\.$/, '')}. ${note}` },
	);
};

const newsOrBusinessBase = (): OptionSpec[] => [
	count(['count'], 100),
	...domainOptions([]),
	...timeOptions([]),
	language(['language']),
	...contentOptions([]),
];

/** Adds a note to the descriptions of some options, for limits that only apply to one operation */
const withNote = (options: OptionSpec[], names: string[], note: string): OptionSpec[] =>
	options.map((option) =>
		names.includes(option.name)
			? { ...option, description: `${option.description.replace(/\.$/, '')}. ${note}` }
			: option,
	);

export const OPERATIONS: OperationSpec[] = [
	{
		value: 'search',
		name: 'Web Search',
		action: 'Search the web',
		description: 'Search the web and return ranked pages with highlights',
		endpoint: '/search',
		options: webSearchOptions([]),
	},
	{
		value: 'searchPremier',
		name: 'Web Search Premier',
		action: 'Search the web with Premier',
		description: 'Search the web with the Premier engine for harder queries',
		endpoint: '/search-premier',
		options: webSearchOptions([]),
	},
	{
		value: 'broadSearch',
		name: 'Broad Search',
		action: 'Search the web with several sub-queries',
		description:
			'Split the query into sub-queries, search each one and return the results by sub-query',
		endpoint: '/broad-search',
		timeoutMs: 120_000,
		options: [
			{
				name: 'maxQueries',
				displayName: 'Max Queries',
				path: ['max_queries'],
				kind: 'number',
				default: 5,
				min: 1,
				max: 30,
				description: 'Maximum number of sub-queries, from 1 to 30',
			},
			...webSearchOptions(['search_options']),
		],
	},
	{
		value: 'newsSearch',
		name: 'News Search',
		action: 'Search news',
		description: 'Search recent news articles, grouped into subjects',
		endpoint: '/news-search',
		options: [
			...withNote(
				newsOrBusinessBase(),
				['includeDomains', 'excludeDomains'],
				'Applies to the articles, not to the subjects',
			),
			{
				name: 'subjects',
				displayName: 'Subjects',
				path: ['subjects', 'enable'],
				kind: 'boolean',
				default: true,
				description: 'Whether to group related articles into subjects',
			},
			count(['subjects', 'count'], 5, 'Subject Count', 'subjects'),
			{
				name: 'maxSubNews',
				displayName: 'Max Sub News',
				path: ['subjects', 'max_sub_news'],
				kind: 'number',
				default: 5,
				min: 1,
				max: 20,
				description: 'Maximum related articles per subject, from 1 to 20',
			},
		],
	},
	{
		value: 'businessSearch',
		name: 'Business Search',
		action: 'Search companies and people',
		description: 'Search the web about companies and people, with entity cards',
		endpoint: '/business-search',
		options: [
			...withNote(
				newsOrBusinessBase(),
				[
					'includeDomains',
					'excludeDomains',
					'timeBasis',
					'timeRange',
					'startTime',
					'endTime',
					'language',
				],
				'Applies to the web results, not to the entity cards',
			),
			{
				name: 'entities',
				displayName: 'Entity Cards',
				path: ['entities', 'enable'],
				kind: 'boolean',
				default: true,
				description: 'Whether to return cards for the companies and people found',
			},
			count(['entities', 'count'], 20, 'Entity Count', 'entity cards'),
			{
				name: 'maxActivities',
				displayName: 'Max Activities',
				path: ['entities', 'max_activities'],
				kind: 'number',
				default: 5,
				min: 1,
				max: 20,
				description: 'Maximum recent activities per entity card, from 1 to 20',
			},
			{
				name: 'maxNews',
				displayName: 'Max News',
				path: ['entities', 'max_news'],
				kind: 'number',
				default: 5,
				min: 1,
				max: 20,
				description: 'Maximum related news items per entity card, from 1 to 20',
			},
		],
	},
	{
		value: 'pulseSearch',
		name: 'Pulse Search',
		action: 'Search the web fast with Pulse',
		description: 'Fast web search for real-time use',
		endpoint: '/pulse-search',
		options: [
			{
				name: 'mode',
				displayName: 'Mode',
				path: ['mode'],
				kind: 'options',
				default: 'lite',
				options: choices(['Lite', 'lite'], ['Standard', 'standard']),
				description:
					'Lite returns the title and URL of each result. Standard also returns highlights, full text and images.',
			},
			count(['count'], 10),
			...withNote(
				[...contentOptions([]), includeImages(['include_images'])],
				['highlight', 'highlightMaxTokens', 'fullContent', 'fullContentMaxTokens', 'includeImages'],
				'Only applies in Standard mode',
			),
			safesearch(['safesearch']),
		],
	},
	{
		value: 'placeSearch',
		name: 'Place Search',
		action: 'Search places',
		description: 'Search businesses and points of interest, with optional web results',
		endpoint: '/place-search',
		options: [
			count(['places', 'count'], 20, 'Place Count', 'place cards'),
			...webResultOptions(false),
			...(['city', 'region', 'country', 'timezone'] as const).map(
				(field): OptionSpec => ({
					name: field,
					displayName: field === 'timezone' ? 'Time Zone' : field[0].toUpperCase() + field.slice(1),
					path: ['user_location', field],
					kind: 'string',
					default: '',
					implies: { path: ['user_location', 'type'], value: 'approximate' },
					description: {
						city: 'The approximate city of the user, as free text',
						region: 'The approximate region of the user, such as a state or province',
						country: 'The country of the user, as an ISO 3166-1 alpha-2 code or free text',
						timezone: 'The time zone of the user, such as America/Los_Angeles',
					}[field],
				}),
			),
			{
				name: 'latitude',
				displayName: 'Latitude',
				path: ['latitude'],
				kind: 'number',
				default: 0,
				min: -90,
				max: 90,
				decimals: 6,
				description: 'Latitude to search around (WGS84). Set it together with the longitude.',
			},
			{
				name: 'longitude',
				displayName: 'Longitude',
				path: ['longitude'],
				kind: 'number',
				default: 0,
				min: -180,
				max: 180,
				decimals: 6,
				description: 'Longitude to search around (WGS84). Set it together with the latitude.',
			},
			{
				name: 'radius',
				displayName: 'Radius (Meters)',
				path: ['radius'],
				kind: 'number',
				default: 1000,
				min: 1,
				max: 50000,
				description: 'Maximum distance from the latitude and longitude, from 1 to 50000 meters',
			},
		],
	},
	{
		value: 'imageSearch',
		name: 'Image Search',
		action: 'Search images',
		description: 'Search images by text or by a similar image',
		endpoint: '/image-search',
		options: [count(['count'], 10), ...domainOptions([], 10), safesearch(['safesearch'])],
	},
	{
		value: 'videoSearch',
		name: 'Video Search',
		action: 'Search videos',
		description: 'Search videos by text. Needs Video Search access, which you request from Octen.',
		endpoint: '/video-search',
		options: [
			count(['count'], 10),
			timeRange(['time_range'], 'publish time'),
			...startEnd([], 'publish time'),
			safesearch(['safesearch']),
		],
	},
	{
		value: 'designSearch',
		name: 'Design Search',
		action: 'Search designs',
		description: 'Search web page, app screen and slide designs, with optional web results',
		endpoint: '/design-search',
		options: [
			{
				name: 'imageResults',
				displayName: 'Image Results',
				path: ['images', 'enable'],
				kind: 'boolean',
				default: true,
				description: 'Whether to return design images',
			},
			count(['images', 'count'], 100, 'Image Count', 'design images'),
			{
				name: 'designFacts',
				displayName: 'Design Facts',
				path: ['images', 'design_facts'],
				kind: 'boolean',
				default: true,
				description: 'Whether to return design facts, such as colors and fonts, for each image',
			},
			{
				name: 'snippet',
				displayName: 'Snippet',
				path: ['images', 'snippet', 'enable'],
				kind: 'boolean',
				default: true,
				description: 'Whether to return reusable code for images that have it',
			},
			{
				name: 'snippetMaxTokens',
				displayName: 'Snippet Max Tokens',
				path: ['images', 'snippet', 'max_tokens'],
				kind: 'number',
				default: 5000,
				min: 100,
				max: 100000,
				description: 'Maximum tokens of code per snippet, from 100 to 100000',
			},
			{
				name: 'groupId',
				displayName: 'Group ID',
				path: ['images', 'group_id'],
				kind: 'string',
				default: '',
				description:
					'Return the images of this group, in order, instead of searching. The query is optional when this is set.',
			},
			...webResultOptions(true),
		],
	},
	{
		value: 'extract',
		name: 'Extract',
		action: 'Extract page content',
		description: 'Get the content of web pages',
		endpoint: '/extract',
		options: [
			{
				name: 'mode',
				displayName: 'Mode',
				path: ['mode'],
				kind: 'options',
				default: 'standard',
				options: choices(['Standard', 'standard'], ['Advanced', 'advanced'], ['Auto', 'auto']),
				description:
					'Standard is fastest. Advanced works better on hard-to-reach pages. Auto picks one per page.',
			},
			{
				name: 'query',
				displayName: 'Query',
				path: ['query'],
				kind: 'string',
				default: '',
				description: 'Return only the passages relevant to this query instead of the whole page',
			},
			{
				name: 'maxAgeSeconds',
				displayName: 'Max Age (Seconds)',
				path: ['max_age_seconds'],
				kind: 'number',
				default: 86400,
				min: 300,
				max: 31536000,
				description: 'Fetch the page again when the cached copy is older than this',
			},
			{
				name: 'format',
				displayName: 'Format',
				path: ['format'],
				kind: 'options',
				default: 'markdown',
				options: choices(['Markdown', 'markdown'], ['Text', 'text']),
				description: 'Format of the returned content',
			},
			{
				name: 'timeout',
				displayName: 'Timeout (Seconds)',
				path: ['timeout'],
				kind: 'number',
				default: 30,
				min: 1,
				max: 60,
				description: 'How long to try each URL, from 1 to 60 seconds',
			},
			{
				...includeImages(['include_images']),
				description: 'Whether to return the image URLs found on the page',
			},
			{
				name: 'includeVideos',
				displayName: 'Include Videos',
				path: ['include_videos'],
				kind: 'boolean',
				default: false,
				description: 'Whether to return the video URLs found on the page',
			},
			{
				name: 'includeAudio',
				displayName: 'Include Audio',
				path: ['include_audio'],
				kind: 'boolean',
				default: false,
				description: 'Whether to return the audio URLs found on the page',
			},
			{
				name: 'includeLinks',
				displayName: 'Include Links',
				path: ['include_links'],
				kind: 'boolean',
				default: false,
				togglesObject: true,
				description: 'Whether to return the links found on the page',
			},
			{
				name: 'linkScope',
				displayName: 'Link Scope',
				path: ['include_links', 'scope'],
				kind: 'options',
				default: 'prefer_internal',
				options: choices(
					['Prefer Internal', 'prefer_internal'],
					['Prefer External', 'prefer_external'],
				),
				description: 'Which links to list first when Include Links is on',
			},
			{
				name: 'maxLinks',
				displayName: 'Max Links',
				path: ['include_links', 'max_links'],
				kind: 'number',
				default: 200,
				min: 1,
				max: 1000,
				description: 'Maximum links per page when Include Links is on, from 1 to 1000',
			},
		],
	},
];

export function getOperation(value: string): OperationSpec {
	const operation = OPERATIONS.find((o) => o.value === value);
	if (!operation) throw new Error(`Unknown operation: ${value}`);
	return operation;
}
