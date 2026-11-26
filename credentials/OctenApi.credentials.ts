import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OctenApi implements ICredentialType {
	name = 'octenApi';

	displayName = 'Octen API';

	documentationUrl = 'https://docs.octen.ai/overview/quickstart';

	icon: Icon = { light: 'file:icons/octen.svg', dark: 'file:icons/octen.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create an API key at https://octen.ai/platform/api-keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.octen.ai',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{ $credentials.apiKey.trim() }}',
			},
		},
	};

	// GET /monitors answers 200 only to a valid key (401 otherwise), so any other answer fails the test.
	// Monitors need no extra access, unlike Video Search. Checked against the live API on 2026-11-25.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.baseUrl }}',
			url: '/monitors',
			method: 'GET',
			qs: { limit: 1 },
		},
		rules: [
			{
				type: 'responseCode',
				properties: { value: 401, message: 'The API key is not valid' },
			},
		],
	};
}
