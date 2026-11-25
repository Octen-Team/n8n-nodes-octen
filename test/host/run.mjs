// Runs the packed node inside a throwaway n8n container against the live Octen API.
//
// Usage: OCTEN_API_KEY=... node test/host/run.mjs [--n8n 2.49.6] [--model anthropic/claude-haiku-5.5] [--only case1,case2]
//
// Needs Docker. The key reaches the container only as an environment variable; credentials reference it as an expression.
// The n8n CLI does not load installed community packages, so the packed files are loaded as a custom extension
// (node type CUSTOM.octen). The code that runs is the same as in the published package.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const N8N = args.n8n ?? '2.49.6';
const MODEL = args.model ?? 'anthropic/claude-haiku-5.5';
const LEGACY = Number(N8N.split('.')[0]) < 2;
if (!process.env.OCTEN_API_KEY) throw new Error('Set OCTEN_API_KEY');

const root = new URL('../..', import.meta.url).pathname;
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// Under the repository, because Docker on macOS (colima) only shares the home directory with containers.
mkdirSync(join(root, '.host-test'), { recursive: true });
const work = mkdtempSync(join(root, '.host-test', 'run-'));
const io = join(work, 'io');
const pkgDir = join(work, 'package');
mkdirSync(io);
mkdirSync(pkgDir);
run('npm', ['run', 'build'], { cwd: root });
const tarball = run('npm', ['pack', '--silent', '--pack-destination', work], { cwd: root }).trim().split('\n').pop();
run('tar', ['-xzf', join(work, tarball), '-C', pkgDir, '--strip-components=1']);

const KEY = '={{ $env.OCTEN_API_KEY }}';
const credentials = [
	{ id: 'octen0000000001', name: 'Octen', type: 'octenApi', data: { apiKey: KEY } },
	{ id: 'octen0000000002', name: 'Octen padded key', type: 'octenApi', data: { apiKey: "={{ '  ' + $env.OCTEN_API_KEY + '\\n' }}" } },
	{ id: 'octen0000000003', name: 'Octen wrong key', type: 'octenApi', data: { apiKey: 'your-api-key' } },
	{ id: 'gateway00000001', name: 'Octen model gateway', type: 'openAiApi', data: { apiKey: KEY, url: 'https://api.octen.ai/v1' } },
];
const cred = (id = 'octen0000000001') => ({ octenApi: { id, name: credentials.find((c) => c.id === id).name } });
const NODE = 'CUSTOM.octen';

const start = { id: 'start', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };
// executionOrder v1 is what the editor uses for new workflows; without it an AI Agent gets empty tool results.
const workflow = (id, nodes, connections) => ({ id, name: id, active: false, settings: { executionOrder: 'v1' }, nodes, connections });
const nodeCase = (id, parameters, credential, extra = {}) =>
	workflow(
		id,
		[start, { id: 'octen', name: 'Octen', type: NODE, typeVersion: 1, position: [300, 0], parameters, credentials: cred(credential), ...extra }],
		{ Start: { main: [[{ node: 'Octen', type: 'main', index: 0 }]] } },
	);

const fromAI = (key, description) => `={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('${key}', \`${description}\`, 'string') }}`;
const agentCase = (id, operation, prompt, toolParameters = { query: fromAI('query', 'What to search for') }) =>
	workflow(
		id,
		[
			start,
			{
				id: 'agent',
				name: 'AI Agent',
				type: '@n8n/n8n-nodes-langchain.agent',
				typeVersion: LEGACY ? 2.2 : 3.1,
				position: [300, 0],
				parameters: { promptType: 'define', text: prompt, options: { maxIterations: 6 } },
			},
			{
				id: 'model',
				name: 'Model',
				type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
				typeVersion: LEGACY ? 1.2 : 1.3,
				position: [200, 200],
				parameters: {
					model: { __rl: true, mode: 'id', value: MODEL },
					...(LEGACY ? {} : { responsesApiEnabled: false }),
					options: { baseURL: 'https://api.octen.ai/v1' },
				},
				credentials: { openAiApi: { id: 'gateway00000001', name: 'Octen model gateway' } },
			},
			{
				id: 'tool',
				name: 'Octen',
				type: `${NODE}Tool`,
				typeVersion: 1,
				position: [400, 200],
				parameters: { operation, ...toolParameters, simplify: true, options: {} },
				credentials: cred(),
			},
		],
		{
			Start: { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
			Model: { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
			Octen: { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] },
		},
	);

const hasType = (type) => (items) => items.some((i) => i.type === type && (i.url || i.name));
// Pulse Search in lite mode returns URLs without a scheme, such as "rust-lang.org/learn".
const hostOf = (url) => {
	try {
		return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname;
	} catch {
		return '';
	}
};

// Some cases need a value that only the API can give: an image URL to search by and a design group ID.
const octen = async (path, body) => {
	const response = await fetch(`https://api.octen.ai${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-api-key': process.env.OCTEN_API_KEY },
		body: JSON.stringify(body),
	});
	return (await response.json()).data;
};
const imageUrl = (await octen('/image-search', { inputs: [{ type: 'text', data: 'red mid-century sofa' }], count: 1 })).results[0].url;
const groupId = (await octen('/design-search', { query: 'SaaS pricing page', images: { count: 5 }, web_search: { enable: false } })).images.find(
	(image) => image.group?.group_id,
)?.group?.group_id;
if (!imageUrl || !groupId) throw new Error('Could not get an image URL or a design group ID from the API');

const CASES = [
	[nodeCase('search', { operation: 'search', query: 'latest Rust release', simplify: true, options: { count: "={{ '3' }}" } }), hasType('web')],
	[nodeCase('searchPremier', { operation: 'searchPremier', query: 'latest Rust release', simplify: true, options: { count: 3 } }), hasType('web')],
	[
		nodeCase('broadSearch', { operation: 'broadSearch', query: 'Rust versus Go for web backends', simplify: true, options: { maxQueries: 2, count: 2 } }),
		(items) => items.some((i) => i.type === 'web' && i.query),
	],
	[nodeCase('newsSearch', { operation: 'newsSearch', query: 'OpenAI', simplify: true, options: { count: 3 } }), hasType('web')],
	[nodeCase('businessSearch', { operation: 'businessSearch', query: 'Stripe', simplify: true, options: { count: 3 } }), hasType('entity')],
	[
		nodeCase('pulseSearch', { operation: 'pulseSearch', query: 'Rust programming language', simplify: true, options: { mode: 'standard', count: 3 } }),
		hasType('web'),
	],
	[
		nodeCase('placeSearch', { operation: 'placeSearch', query: 'coffee shop', simplify: true, options: { placeCount: 3, city: 'Seattle', country: 'US' } }),
		hasType('place'),
	],
	[
		nodeCase('imageSearch', { operation: 'imageSearch', inputType: 'text', query: 'red mid-century sofa', simplify: true, options: { count: 3 } }),
		hasType('image'),
	],
	[nodeCase('videoSearch', { operation: 'videoSearch', query: 'drone footage of mountains', simplify: true, options: { count: 3 } }), hasType('video')],
	[
		nodeCase('designSearch', { operation: 'designSearch', query: 'SaaS pricing page', simplify: true, options: { imageCount: 3, webResults: false } }),
		hasType('design'),
	],
	[
		nodeCase('extract', { operation: 'extract', urls: 'https://www.rust-lang.org/, https://blog.rust-lang.org/', simplify: true, options: {} }),
		(items) => items.length === 2 && items.every((i) => i.type === 'page' && i.status === 'success'),
	],
	[
		nodeCase('rawResponse', { operation: 'search', query: 'latest Rust release', simplify: false, options: { count: 2 } }),
		(items) => items.length === 1 && items[0].code === 0 && Array.isArray(items[0].data?.results),
	],
	[nodeCase('paddedKey', { operation: 'search', query: 'Rust', simplify: true, options: { count: 1 } }, 'octen0000000002'), hasType('web')],
	[
		nodeCase('wrongKey', { operation: 'search', query: 'Rust', simplify: true, options: {} }, 'octen0000000003', { onError: 'continueRegularOutput' }),
		(items) => items.length === 1 && /Invalid API Key/.test(items[0].error ?? ''),
	],
	[
		nodeCase('searchFilters', { operation: 'search', query: 'Rust release notes', simplify: true, options: { includeDomains: 'rust-lang.org', timeRange: 'year', count: 3 } }),
		(items) => items.length > 0 && items.every((i) => hostOf(i.url).endsWith('rust-lang.org')),
	],
	[
		nodeCase('searchImages', { operation: 'search', query: 'Rust programming language logo', simplify: true, options: { includeImages: true, count: 3 } }),
		(items) => items.some((i) => Array.isArray(i.images) && i.images.length > 0),
	],
	[
		nodeCase('imageByUrl', { operation: 'imageSearch', inputType: 'image', imageUrl, simplify: true, options: { count: 3 } }),
		hasType('image'),
	],
	[
		nodeCase('placeNearby', {
			operation: 'placeSearch',
			query: 'coffee',
			simplify: true,
			options: { latitude: 47.6062, longitude: -122.3321, radius: 2000, placeCount: 3 },
		}),
		(items) => items.some((i) => i.type === 'place') && items.every((i) => i.type !== 'place' || i.distance === undefined || i.distance <= 2000),
	],
	[
		nodeCase('designGroup', { operation: 'designSearch', query: '', simplify: true, options: { groupId, webResults: false } }),
		hasType('design'),
	],
	[
		nodeCase('extractLinks', {
			operation: 'extract',
			urls: 'https://www.rust-lang.org/',
			simplify: true,
			options: { includeLinks: true, maxLinks: 5, includeImages: true },
		}),
		(items) => items.length === 1 && Array.isArray(items[0].links) && items[0].links.length > 0 && items[0].links.length <= 5,
	],
	...[
		['search', 'Find the official Rust programming language website. Search once, then answer with its URL.'],
		['searchPremier', 'Find the release announcement of Rust 1.100. Search once, then answer in one sentence with the source URL.'],
		['broadSearch', 'Compare Rust and Go for web backends. Search once, then answer in two sentences with source URLs.'],
		['newsSearch', 'What is new with the Rust programming language? Search once, then answer in two sentences with source URLs.'],
		['businessSearch', 'Who founded Stripe and when? Search once, then answer in one sentence with a source URL.'],
		['pulseSearch', 'Find the official Rust programming language website. Search once, then answer with its URL.'],
		['placeSearch', 'Find a coffee shop in Seattle. Search once, then give its name and website.'],
		['imageSearch', 'Find an image of a red mid-century sofa. Search once, then give the image URL.'],
		['videoSearch', 'Find a video of drone footage over mountains. Search once, then give the video URL.'],
		['designSearch', 'Find a design of a SaaS pricing page. Search once, then give the image URL.'],
		['extract', 'Read https://www.rust-lang.org/ with the tool, then say in one sentence what the page offers and give its URL.'],
	].map(([operation, prompt]) => [
		agentCase(
			`agent_${operation}`,
			operation,
			prompt,
			operation === 'extract'
				? { urls: fromAI('urls', 'The URLs of the pages to read') }
				: operation === 'imageSearch'
					? { inputType: 'text', query: fromAI('query', 'A description of the images to find') }
					: undefined,
		),
		'agent',
	]),
];
const only = args.only ? new Set(args.only.split(',')) : null;
const cases = CASES.filter(([wf]) => !only || only.has(wf.id));
writeFileSync(join(io, 'credentials.json'), JSON.stringify(credentials));
writeFileSync(join(io, 'workflows.json'), JSON.stringify(cases.map(([wf]) => wf)));
run('chmod', ['-R', 'a+rwX', work]);

const ids = cases.map(([wf]) => wf.id).join(' ');
const script = [
	'n8n import:credentials --input=/io/credentials.json >/dev/null 2>&1',
	'n8n import:workflow --input=/io/workflows.json >/dev/null 2>&1',
	`for id in ${ids}; do n8n execute --id=$id --rawOutput > /io/$id.out 2>&1; done; true`,
].join(' && ');
const started = Date.now();
run(
	'docker',
	[
		'run', '--rm',
		'-e', 'OCTEN_API_KEY', '-e', 'N8N_BLOCK_ENV_ACCESS_IN_NODE=false', '-e', 'N8N_DIAGNOSTICS_ENABLED=false',
		'-e', 'N8N_CUSTOM_EXTENSIONS=/octen', '-e', 'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true',
		'-v', `${pkgDir}:/octen:ro`, '-v', `${io}:/io`,
		'--entrypoint', 'sh', `n8nio/n8n:${N8N}`, '-c', script,
	],
	{ timeout: 900_000 },
);

const parse = (text) => {
	const at = text.indexOf('\n{');
	if (at < 0) return null;
	try {
		return JSON.parse(text.slice(at + 1));
	} catch {
		return null;
	}
};
let failed = 0;
console.log(`n8n ${N8N}, model ${MODEL}, ${cases.length} cases, ${Math.round((Date.now() - started) / 1000)} s`);
for (const [wf, check] of cases) {
	const text = readFileSync(join(io, `${wf.id}.out`), 'utf8');
	const result = parse(text);
	const runData = result?.data?.resultData?.runData ?? result?.resultData?.runData;
	let ok = false;
	let detail = '';
	if (check === 'agent') {
		const toolRuns = runData?.Octen ?? [];
		// n8n 1.x wraps the tool items in a single item under `response`
		const toolItems = toolRuns
			.flatMap((r) => r.data?.ai_tool?.[0] ?? [])
			.flatMap((i) => (Array.isArray(i.json?.response) ? i.json.response : [i.json]));
		const answer = runData?.['AI Agent']?.[0]?.data?.main?.[0]?.[0]?.json?.output ?? '';
		const hosts = toolItems.flatMap((i) => [i.url, i.website, i.source_page]).filter(Boolean).map(hostOf).filter(Boolean);
		// The answer must cite something the tool returned, so a tool result the model never saw cannot pass
		ok = toolRuns.length > 0 && toolItems.length > 0 && hosts.some((host) => answer.includes(host));
		detail = `${toolRuns.length} tool calls, ${toolItems.length} tool items, answer: ${answer.slice(0, 160).replace(/\s+/g, ' ')}`;
	} else {
		const items = (runData?.Octen?.[0]?.data?.main?.[0] ?? []).map((i) => i.json);
		ok = check(items);
		const types = [...new Set(items.map((i) => i.type ?? (i.error ? 'error' : 'raw')))].join(', ');
		detail = `${items.length} items, types: ${types || 'none'}`;
		if (!ok && items.length === 0) detail += ` | ${text.split('\n').filter((l) => /rror|Unrecognized/.test(l)).slice(0, 2).join(' / ')}`;
	}
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${wf.id}: ${detail}`);
}
if (failed === 0) rmSync(work, { recursive: true, force: true });
console.log(failed === 0 ? 'all cases passed' : `${failed} cases failed; outputs kept in ${io}`);
process.exit(failed === 0 ? 0 : 1);
