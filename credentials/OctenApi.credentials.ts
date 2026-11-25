import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestFunction,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { octenApiTest } from './credentialTest';

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

	// A function rather than a request, so that only a positive answer counts as success
	test: ICredentialTestFunction = octenApiTest;
}
