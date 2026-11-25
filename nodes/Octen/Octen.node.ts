import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import { properties } from './description';
import { getOperation, type OctenOperation } from './operations';
import { buildBody, OctenInputError } from './request';
import { assertOk, OctenResponseError, toItems } from './response';

const PRIMARY_PARAMETERS = ['query', 'inputType', 'imageUrl', 'urls'];

export class Octen implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Octen',
		name: 'octen',
		icon: { light: 'file:octen.svg', dark: 'file:octen.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description:
			'Search the web, news, companies, places, images, videos and designs, and extract page content with Octen',
		defaults: { name: 'Octen' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'octenApi', required: true }],
		properties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('octenApi');
		const baseUrl = String(credentials.baseUrl ?? 'https://api.octen.ai').replace(/\/+$/, '');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as OctenOperation;
				const spec = getOperation(operation);
				const primary: IDataObject = {};
				for (const name of PRIMARY_PARAMETERS)
					primary[name] = this.getNodeParameter(name, itemIndex, '');
				const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
				const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

				const request: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}${spec.endpoint}`,
					body: buildBody(operation, primary, options),
					json: true,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
					...(spec.timeoutMs !== undefined && { timeout: spec.timeoutMs }),
				};
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'octenApi',
					request,
				);
				assertOk(response.statusCode, response.body);
				for (const json of toItems(operation, response.body, simplify)) {
					output.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				const failure = toNodeError(this, error, itemIndex);
				if (this.continueOnFail()) {
					output.push({ json: { error: failure.message }, pairedItem: { item: itemIndex } });
					continue;
				}
				throw failure;
			}
		}
		return [output];
	}
}

function toNodeError(context: IExecuteFunctions, error: unknown, itemIndex: number) {
	if (error instanceof OctenInputError) {
		return new NodeOperationError(context.getNode(), error.message, { itemIndex });
	}
	if (error instanceof OctenResponseError) {
		return new NodeApiError(
			context.getNode(),
			{ message: error.message, code: error.code } as JsonObject,
			{
				message: error.message,
				description: error.requestId ? `Request ID: ${error.requestId}` : undefined,
				httpCode: String(error.httpCode),
				itemIndex,
			},
		);
	}
	return new NodeOperationError(context.getNode(), error as Error, { itemIndex });
}
