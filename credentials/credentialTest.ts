import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	INodeCredentialTestResult,
} from 'n8n-workflow';

const isObject = (value: unknown): value is IDataObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Judges the answer to an empty POST /search. Only a valid key gets past authentication to the
 * "Missing parameter query" validation answer, so anything else is not treated as success.
 */
export function checkCredentialResponse(
	httpCode: number,
	body: unknown,
): INodeCredentialTestResult {
	const code = isObject(body) ? body.code : undefined;
	const msg = isObject(body) && typeof body.msg === 'string' ? body.msg : '';
	if (code === 400 && /missing parameter query/i.test(msg)) {
		return { status: 'OK', message: 'Connection successful' };
	}
	if (code === 401 || httpCode === 401) {
		return { status: 'Error', message: 'The API key is not valid' };
	}
	const answer = msg || `HTTP ${httpCode}`;
	return {
		status: 'Error',
		message: `The API key could not be checked. The Octen API answered: ${answer}`,
	};
}

export async function octenApiTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const data = credential.data ?? {};
	const baseUrl = String(data.baseUrl ?? 'https://api.octen.ai').replace(/\/+$/, '');
	let response: Response;
	try {
		response = await fetch(`${baseUrl}/search`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': String(data.apiKey ?? '').trim(),
			},
			body: '{}',
			signal: AbortSignal.timeout(15_000),
		});
	} catch (error) {
		return {
			status: 'Error',
			message: `Could not reach the Octen API: ${(error as Error).message}`,
		};
	}
	const text = await response.text();
	let body: unknown = text;
	try {
		body = JSON.parse(text);
	} catch {
		// Not JSON: checkCredentialResponse reports the HTTP status instead
	}
	return checkCredentialResponse(response.status, body);
}
