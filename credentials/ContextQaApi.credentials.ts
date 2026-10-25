import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class ContextQaApi implements ICredentialType {
	name = 'contextQaApi';
	icon = {
		light: 'file:../nodes/ContextQa/contextqa.svg',
		dark: 'file:../nodes/ContextQa/contextqa.svg',
	} as const;
	displayName = 'ContextQA API';
	documentationUrl = 'https://github.com/indivatools/n8n-nodes-contextqa#credentials';
	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Scoped REST token from Settings → API tokens. Paste the token without the Bearer prefix.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiToken}}' } },
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://server.contextqa.com',
			url: '/test_plans',
			method: 'GET',
			qs: { page: 0, size: 1 },
		},
	};
}
