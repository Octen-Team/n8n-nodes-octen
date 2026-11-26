// Runs the packed node inside a throwaway n8n container against the live Octen API.
//
// Usage: OCTEN_API_KEY=... node test/host/run.mjs [--n8n 2.49.6] [--model anthropic/claude-haiku-5.5] [--only case1,case2]
//
// Needs Docker. The key reaches the container only as an environment variable; credentials reference it as an expression.
// The packed package is installed the way n8n installs community packages, and the workflows use its real
// node types (n8n-nodes-octen-official.octen and .octenTool).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((pairs, arg, i, all) => {
		if (!arg.startsWith('--')) return pairs;
		// Both "--only x" and "--only=x"
		const [name, inline] = arg.slice(2).split(/=(.*)/s);
		return [...pairs, [name, inline ?? all[i + 1]]];
	}, []),
);
const N8N = args.n8n ?? '2.49.6';
const MODEL = args.model ?? 'anthropic/claude-haiku-5.5';
const LEGACY = Number(N8N.split('.')[0]) < 2;
if (!process.env.OCTEN_API_KEY) throw new Error('Set OCTEN_API_KEY');

const root = new URL('../..', import.meta.url).pathname;
const run = (cmd, argv, opts = {}) =>
	execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// Under the repository, because Docker on macOS (colima) only shares the home directory with containers.
mkdirSync(join(root, '.host-test'), { recursive: true });
const work = mkdtempSync(join(root, '.host-test', 'run-'));
const io = join(work, 'io');
const inputs = join(work, 'in');
const PACKAGE = 'n8n-nodes-octen-official';
const pkgDir = join(work, 'package');
mkdirSync(io);
mkdirSync(inputs);
mkdirSync(pkgDir);
run('npm', ['run', 'build'], { cwd: root });
const tarball = run('npm', ['pack', '--silent', '--pack-destination', work], { cwd: root })
	.trim()
	.split('\n')
	.pop();
run('tar', ['-xzf', join(work, tarball), '-C', pkgDir, '--strip-components=1']);

// The package is installed the way n8n installs community packages, as <user folder>/nodes/node_modules/<package>.
// It and the test inputs are mounted read-only; the container may write only n8n's own data and the case output.
const nodesPackageJson = join(work, 'nodes-package.json');
writeFileSync(
	nodesPackageJson,
	JSON.stringify({ name: 'installed-nodes', private: true, dependencies: { [PACKAGE]: '0.1.0' } }),
);
/** A writable n8n user folder whose nodes folder (the package) the container cannot change */
const userFolderMounts = (userFolder) => {
	mkdirSync(join(userFolder, 'nodes', 'node_modules', PACKAGE), { recursive: true });
	writeFileSync(join(userFolder, 'nodes', 'package.json'), '');
	run('chmod', ['-R', 'u+rwX,go+rX,go-w', userFolder]);
	run('chmod', ['go+w', userFolder]);
	return [
		'-v',
		`${userFolder}:/home/node/.n8n`,
		'-v',
		`${pkgDir}:/home/node/.n8n/nodes/node_modules/${PACKAGE}:ro`,
		'-v',
		`${nodesPackageJson}:/home/node/.n8n/nodes/package.json:ro`,
	];
};
run('chmod', ['-R', 'u+rwX,go+rX,go-w', pkgDir]);
run('chmod', ['go+r', nodesPackageJson]);

const KEY = '={{ $env.OCTEN_API_KEY }}';
const credentials = [
	{ id: 'octen0000000001', name: 'Octen', type: 'octenApi', data: { apiKey: KEY } },
	{
		id: 'octen0000000002',
		name: 'Octen padded key',
		type: 'octenApi',
		data: { apiKey: "={{ '  ' + $env.OCTEN_API_KEY + '\\n' }}" },
	},
	{
		id: 'octen0000000003',
		name: 'Octen wrong key',
		type: 'octenApi',
		data: { apiKey: 'your-api-key' },
	},
	{
		id: 'gateway00000001',
		name: 'Octen model gateway',
		type: 'openAiApi',
		data: { apiKey: KEY, url: 'https://api.octen.ai/v1' },
	},
];
const cred = (id = 'octen0000000001') => ({
	octenApi: { id, name: credentials.find((c) => c.id === id).name },
});
const NODE = `${PACKAGE}.octen`;

const start = {
	id: 'start',
	name: 'Start',
	type: 'n8n-nodes-base.manualTrigger',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};
// executionOrder v1 is what the editor uses for new workflows; without it an AI Agent gets empty tool results.
const workflow = (id, nodes, connections) => ({
	id,
	name: id,
	active: false,
	settings: { executionOrder: 'v1' },
	nodes,
	connections,
});
const nodeCase = (id, parameters, credential, extra = {}) =>
	workflow(
		id,
		[
			start,
			{
				id: 'octen',
				name: 'Octen',
				type: NODE,
				typeVersion: 1,
				position: [300, 0],
				parameters,
				credentials: cred(credential),
				...extra,
			},
		],
		{ Start: { main: [[{ node: 'Octen', type: 'main', index: 0 }]] } },
	);

const fromAI = (key, description) =>
	`={{ /*n8n-auto-generated-fromAI-override*/ $fromAI('${key}', \`${description}\`, 'string') }}`;
const agentCase = (
	id,
	operation,
	prompt,
	toolParameters = { query: fromAI('query', 'What to search for') },
) =>
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
				parameters: {
					promptType: 'define',
					text: prompt,
					options: { maxIterations: 6, returnIntermediateSteps: true },
				},
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
const onlyIds =
	'only' in args
		? (args.only ?? '')
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean)
		: null;
if (onlyIds && onlyIds.length === 0)
	throw new Error('--only needs a comma-separated list of case names');
const only = onlyIds ? new Set(onlyIds) : null;
const selected = (id) => !only || only.has(id);
// Filled in below, only for the selected cases, so a bad --only value fails before any paid call
const imageUrl = '__IMAGE_URL__';
const groupId = '__GROUP_ID__';

const CASES = [
	[
		nodeCase('search', {
			operation: 'search',
			query: 'latest Rust release',
			simplify: true,
			options: { count: "={{ '3' }}" },
		}),
		// Count comes from an expression; Octen's default is 5, so exactly 3 proves the value was applied
		(items) => items.length === 3 && hasType('web')(items),
	],
	[
		nodeCase('searchPremier', {
			operation: 'searchPremier',
			query: 'latest Rust release',
			simplify: true,
			options: { count: 3 },
		}),
		hasType('web'),
	],
	[
		nodeCase('broadSearch', {
			operation: 'broadSearch',
			query: 'Rust versus Go for web backends',
			simplify: true,
			options: { maxQueries: 2, count: 2 },
		}),
		(items) => items.some((i) => i.type === 'web' && i.query),
	],
	[
		nodeCase('newsSearch', {
			operation: 'newsSearch',
			query: 'OpenAI',
			simplify: true,
			options: { count: 3 },
		}),
		(items) =>
			hasType('web')(items) && items.some((i) => i.type === 'subject' && Array.isArray(i.sub_news)),
	],
	[
		nodeCase('businessSearch', {
			operation: 'businessSearch',
			query: 'Stripe',
			simplify: true,
			options: { count: 3 },
		}),
		hasType('entity'),
	],
	[
		nodeCase('pulseSearch', {
			operation: 'pulseSearch',
			query: 'Rust programming language',
			simplify: true,
			options: { mode: 'standard', count: 3 },
		}),
		hasType('web'),
	],
	[
		nodeCase('placeSearch', {
			operation: 'placeSearch',
			query: 'coffee shop',
			simplify: true,
			options: { placeCount: 3, city: 'Seattle', country: 'US' },
		}),
		hasType('place'),
	],
	[
		nodeCase('imageSearch', {
			operation: 'imageSearch',
			inputType: 'text',
			query: 'red mid-century sofa',
			simplify: true,
			options: { count: 3 },
		}),
		hasType('image'),
	],
	[
		nodeCase('videoSearch', {
			operation: 'videoSearch',
			query: 'drone footage of mountains',
			simplify: true,
			options: { count: 3 },
		}),
		hasType('video'),
	],
	[
		nodeCase('designSearch', {
			operation: 'designSearch',
			query: 'SaaS pricing page',
			simplify: true,
			options: { imageCount: 3, webResults: false },
		}),
		(items) =>
			hasType('design')(items) && items.some((i) => i.type === 'design' && i.group?.group_id),
	],
	[
		nodeCase('extract', {
			operation: 'extract',
			urls: 'https://www.rust-lang.org/, https://blog.rust-lang.org/',
			simplify: true,
			options: {},
		}),
		(items) =>
			items.length === 2 && items.every((i) => i.type === 'page' && i.status === 'success'),
	],
	[
		nodeCase('rawResponse', {
			operation: 'search',
			query: 'latest Rust release',
			simplify: false,
			options: { count: 2 },
		}),
		(items) => items.length === 1 && items[0].code === 0 && Array.isArray(items[0].data?.results),
	],
	[
		nodeCase(
			'paddedKey',
			{ operation: 'search', query: 'Rust', simplify: true, options: { count: 1 } },
			'octen0000000002',
		),
		hasType('web'),
	],
	[
		nodeCase(
			'wrongKey',
			{ operation: 'search', query: 'Rust', simplify: true, options: {} },
			'octen0000000003',
			{ onError: 'continueRegularOutput' },
		),
		(items) => items.length === 1 && /Invalid API Key/.test(items[0].error ?? ''),
	],
	[
		nodeCase('searchFilters', {
			operation: 'search',
			query: 'Rust release notes',
			simplify: true,
			options: { includeDomains: 'rust-lang.org', timeRange: 'year', count: 3 },
		}),
		(items) => items.length > 0 && items.every((i) => /(^|\.)rust-lang\.org$/.test(hostOf(i.url))),
	],
	[
		nodeCase('searchImages', {
			operation: 'search',
			query: 'Rust programming language logo',
			simplify: true,
			options: { includeImages: true, count: 3 },
		}),
		(items) => items.some((i) => Array.isArray(i.images) && i.images.length > 0),
	],
	[
		nodeCase('imageByUrl', {
			operation: 'imageSearch',
			inputType: 'image',
			imageUrl,
			simplify: true,
			options: { count: 3 },
		}),
		hasType('image'),
	],
	[
		nodeCase('placeNearby', {
			operation: 'placeSearch',
			query: 'coffee',
			simplify: true,
			options: { latitude: 47.6062, longitude: -122.3321, radius: 2000, placeCount: 3 },
		}),
		(items) => {
			const distances = items.filter((i) => i.type === 'place').map((i) => i.distance);
			return (
				distances.length > 0 && distances.every((d) => Number.isInteger(d) && d >= 0 && d <= 2000)
			);
		},
	],
	[
		nodeCase('designGroup', {
			operation: 'designSearch',
			query: '',
			simplify: true,
			options: { groupId, webResults: false },
		}),
		hasType('design'),
	],
	[
		nodeCase('extractLinks', {
			operation: 'extract',
			urls: 'https://www.rust-lang.org/',
			simplify: true,
			options: { includeLinks: true, maxLinks: 5, includeImages: true },
		}),
		(items) =>
			items.length === 1 &&
			Array.isArray(items[0].links) &&
			items[0].links.length > 0 &&
			items[0].links.length <= 5,
	],
	...[
		[
			'search',
			'Find the official Rust programming language website. Search once, then answer with its URL.',
		],
		[
			'searchPremier',
			'Find the release announcement of Rust 1.100. Search once, then answer in one sentence with the source URL.',
		],
		[
			'broadSearch',
			'Compare Rust and Go for web backends. Search once, then answer in two sentences with source URLs.',
		],
		[
			'newsSearch',
			'What is new with the Rust programming language? Search once, then answer in two sentences with source URLs.',
		],
		[
			'businessSearch',
			'Who founded Stripe and when? Search once, then answer in one sentence with a source URL.',
		],
		[
			'pulseSearch',
			'Find the official Rust programming language website. Search once, then answer with its URL.',
		],
		['placeSearch', 'Find a coffee shop in Seattle. Search once, then give its name and website.'],
		[
			'imageSearch',
			'Find an image of a red mid-century sofa. Search once, then give the image URL.',
		],
		[
			'videoSearch',
			'Find a video of drone footage over mountains. Search once, then give the video URL.',
		],
		['designSearch', 'Find a design of a SaaS pricing page. Search once, then give the image URL.'],
		[
			'extract',
			'Read https://www.rust-lang.org/ with the tool, then reply with the page title exactly as the tool returned it.',
		],
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
const unknown = only ? [...only].filter((id) => !CASES.some(([wf]) => wf.id === id)) : [];
if (unknown.length > 0) throw new Error(`Unknown case names in --only: ${unknown.join(', ')}`);
const cases = CASES.filter(([wf]) => selected(wf.id));
const fixtures = {
	__IMAGE_URL__: selected('imageByUrl')
		? (
				await octen('/image-search', {
					inputs: [{ type: 'text', data: 'red mid-century sofa' }],
					count: 1,
				})
			).results[0]?.url
		: 'unused',
	__GROUP_ID__: selected('designGroup')
		? (
				await octen('/design-search', {
					query: 'SaaS pricing page',
					images: { count: 5 },
					web_search: { enable: false },
				})
			).images.find((image) => image.group?.group_id)?.group?.group_id
		: 'unused',
};
if (!fixtures.__IMAGE_URL__ || !fixtures.__GROUP_ID__) {
	throw new Error('Could not get an image URL or a design group ID from the API');
}
writeFileSync(join(inputs, 'credentials.json'), JSON.stringify(credentials));
writeFileSync(
	join(inputs, 'workflows.json'),
	JSON.stringify(cases.map(([wf]) => wf)).replace(
		/__IMAGE_URL__|__GROUP_ID__/g,
		(name) => fixtures[name],
	),
);
run('chmod', ['-R', 'u+rwX,go+rX,go-w', inputs]);
run('chmod', ['go+w', io]);

const ids = cases.map(([wf]) => wf.id).join(' ');
const script = [
	'n8n import:credentials --input=/in/credentials.json >/dev/null 2>&1',
	'n8n import:workflow --input=/in/workflows.json >/dev/null 2>&1',
	`for id in ${ids}; do n8n execute --id=$id --rawOutput > /io/$id.out 2>&1; done; true`,
].join(' && ');
const started = Date.now();
run(
	'docker',
	[
		'run',
		'--rm',
		'-e',
		'OCTEN_API_KEY',
		'-e',
		'N8N_BLOCK_ENV_ACCESS_IN_NODE=false',
		'-e',
		'N8N_DIAGNOSTICS_ENABLED=false',
		'-e',
		'N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true',
		...userFolderMounts(join(work, 'n8n')),
		'-v',
		`${inputs}:/in:ro`,
		'-v',
		`${io}:/io`,
		'--entrypoint',
		'sh',
		`n8nio/n8n:${N8N}`,
		'-c',
		script,
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
console.log(
	`n8n ${N8N}, model ${MODEL}, ${cases.length} cases, ${Math.round((Date.now() - started) / 1000)} s`,
);
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
		const agentOutput = runData?.['AI Agent']?.[0]?.data?.main?.[0]?.[0]?.json ?? {};
		const answer = agentOutput.output ?? '';
		const prompt = wf.nodes.find((n) => n.name === 'AI Agent').parameters.text;
		// The tool data must reach the model: some returned URL or title appears in what the agent observed
		const observed = (agentOutput.intermediateSteps ?? [])
			.map((step) => String(step.observation ?? ''))
			.join('\n');
		// Extract must have returned a page, and its title (content, not the URL from the prompt) must reach the model
		const evidence =
			wf.id === 'agent_extract'
				? toolItems.filter((i) => i.status === 'success').map((i) => i.title)
				: toolItems.flatMap((i) => [i.url, i.title, i.name, i.website]);
		const delivered = evidence.filter(Boolean).some((v) => observed.includes(String(v)));
		// And the answer must use what the tool returned: a returned URL that the prompt did not contain, the name
		// of a returned place, or for Extract the returned page title.
		// URLs compare whole: scheme, "www." and a trailing slash are ignored, the host is lower-cased; port, path, query and fragment must match
		const normalize = (url) => {
			const text = String(url);
			const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`;
			try {
				const u = new URL(withScheme);
				return `${u.hostname.replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/+$/, '')}${u.search}${u.hash}`;
			} catch {
				return '';
			}
		};
		const answerUrls = new Set(
			(answer.match(/https?:\/\/[^\s<>()[\]"'`*]+/g) ?? [])
				// Punctuation right after a link in prose is not part of it
				.map((link) => normalize(link.replace(/[).,;:!?]+$/, ''))),
		);
		const promptUrls = new Set((prompt.match(/https?:\/\/[^\s]+/g) ?? []).map(normalize));
		const cited =
			wf.id === 'agent_extract'
				? toolItems.some((i) => i.status === 'success' && i.title && answer.includes(i.title))
				: wf.id === 'agent_placeSearch'
					? toolItems.some((i) => i.name && answer.includes(i.name))
					: toolItems
							.flatMap((i) => [i.url, i.source_page])
							.filter(Boolean)
							.map(normalize)
							.some((url) => url && !promptUrls.has(url) && answerUrls.has(url));
		ok = toolRuns.length > 0 && toolItems.length > 0 && delivered && cited;
		detail = `${toolRuns.length} tool calls, ${toolItems.length} tool items, delivered: ${delivered}, cited: ${cited}, answer: ${answer.slice(0, 160).replace(/\s+/g, ' ')}`;
	} else {
		const items = (runData?.Octen?.[0]?.data?.main?.[0] ?? []).map((i) => i.json);
		ok = check(items);
		const types = [...new Set(items.map((i) => i.type ?? (i.error ? 'error' : 'raw')))].join(', ');
		detail = `${items.length} items, types: ${types || 'none'}`;
		if (!ok && items.length === 0)
			detail += ` | ${text
				.split('\n')
				.filter((l) => /rror|Unrecognized/.test(l))
				.slice(0, 2)
				.join(' / ')}`;
	}
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${wf.id}: ${detail}`);
}
// The credential test only runs in the n8n server, so install the package as a community package there
// (the way users install it) and test the credential through the REST API.
{
	// This folder ends up holding the real key (encrypted by n8n), so it is always deleted below
	const serverFolder = join(work, 'server');
	const port = args.port ?? '5689';
	const container = `octen-n8n-host-${process.pid}`;
	run('docker', [
		'run',
		'-d',
		'--name',
		container,
		'-p',
		`127.0.0.1:${port}:5678`,
		'-e',
		'N8N_DIAGNOSTICS_ENABLED=false',
		'-e',
		'N8N_SECURE_COOKIE=false',
		...userFolderMounts(serverFolder),
		`n8nio/n8n:${N8N}`,
	]);
	const base = `http://127.0.0.1:${port}`;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	let cookie = '';
	const rest = async (method, path, body) => {
		const response = await fetch(base + path, {
			method,
			headers: { 'content-type': 'application/json', 'browser-id': 'host-test', cookie },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const setCookie = response.headers.get('set-cookie');
		if (setCookie) cookie = setCookie.split(';')[0];
		return { status: response.status, body: await response.json().catch(() => ({})) };
	};
	try {
		// n8n 1.x answers /healthz/readiness before the REST API is up, and n8n 2.x answers /rest/settings with
		// "n8n is starting up" while it starts, so wait until both answer for real
		for (let i = 0; ; i++) {
			const healthy = await fetch(`${base}/healthz/readiness`).then(
				(r) => r.ok,
				() => false,
			);
			const ready =
				healthy &&
				(await fetch(`${base}/rest/settings`)
					.then(async (r) => r.ok && (await r.json())?.data?.userManagement !== undefined)
					.catch(() => false));
			if (ready) break;
			if (i > 90) throw new Error('n8n server did not start');
			await sleep(2000);
		}
		// A throwaway owner for this local container only
		const owner = {
			email: 'owner@octen-host.test',
			password: `Host-${process.pid}-${Date.now()}-aA1`,
		};
		await rest('POST', '/rest/owner/setup', { ...owner, firstName: 'Host', lastName: 'Test' });
		await rest('POST', '/rest/login', {
			emailOrLdapLoginId: owner.email,
			password: owner.password,
		});
		const types = await rest('GET', '/types/nodes.json');
		const expectedType = NODE;
		const loaded = Array.isArray(types.body) && types.body.some((n) => n.name === expectedType);
		console.log(
			`${loaded ? 'PASS' : 'FAIL'} serverLoadsPackage: ${expectedType} ${loaded ? 'loaded' : 'missing'}`,
		);
		if (!loaded) failed++;
		const key = process.env.OCTEN_API_KEY;
		// n8n 1.x answers a 401 with its own "Authorization failed" message instead of the credential's rule
		for (const [id, apiKey, expected] of [
			['credentialValid', key, 'OK'],
			['credentialPadded', `  ${key}\n`, 'OK'],
			['credentialWrong', 'your-api-key', 'Error'],
		]) {
			const created = await rest('POST', '/rest/credentials', {
				name: id,
				type: 'octenApi',
				data: { apiKey },
			});
			const credentialId = created.body?.data?.id;
			const tested = await rest('POST', '/rest/credentials/test', {
				credentials: { id: credentialId, name: id, type: 'octenApi', data: { apiKey } },
			});
			if (credentialId) await rest('DELETE', `/rest/credentials/${credentialId}`);
			const result = tested.body?.data ?? {};
			const ok =
				result.status === expected &&
				(expected === 'OK' || /not valid|Authorization failed/.test(result.message ?? ''));
			if (!ok) failed++;
			console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${result.status} ${result.message ?? ''}`);
		}
	} finally {
		try {
			run('docker', ['rm', '-f', container]);
		} finally {
			rmSync(serverFolder, { recursive: true, force: true });
		}
	}
}

if (failed === 0) rmSync(work, { recursive: true, force: true });
console.log(failed === 0 ? 'all cases passed' : `${failed} cases failed; outputs kept in ${io}`);
process.exit(failed === 0 ? 0 : 1);
