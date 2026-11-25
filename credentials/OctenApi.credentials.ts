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

	// An empty search fails validation (code 400) for a valid key, and only an invalid key gets code 401.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.baseUrl }}',
			url: '/search',
			method: 'POST',
			body: {},
			ignoreHttpStatusErrors: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: { key: 'code', value: 401, message: 'The API key is not valid' },
			},
		],
	};
}
