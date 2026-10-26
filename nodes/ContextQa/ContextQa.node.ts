import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class ContextQa implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ContextQA',
		name: 'contextQa',
		icon: { light: 'file:contextqa.svg', dark: 'file:contextqa.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'List test plans, explicitly start runs, and read run results',
		defaults: { name: 'ContextQA' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'contextQaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Run', value: 'run' },
					{ name: 'Test Plan', value: 'testPlan' },
				],
				default: 'testPlan',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['testPlan'] } },
				options: [
					{
						name: 'Get Page',
						value: 'getPage',
						description: 'Get one page of test plans with pagination metadata',
						action: 'Get a page of test plans',
					},
					{
						name: 'Start Run',
						value: 'startRun',
						description: 'Start one billed, non-idempotent test plan run',
						action: 'Start a test plan run',
					},
				],
				default: 'getPage',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['run'] } },
				options: [
					{
						name: 'Get Summary',
						value: 'getSummary',
						description: 'Read the status and counts of an existing run',
						action: 'Get a run summary',
					},
				],
				default: 'getSummary',
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				displayOptions: { show: { resource: ['testPlan'], operation: ['getPage'] } },
				description: 'Zero-based page number',
			},
			{
				displayName: 'Page Size',
				name: 'pageSize',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 20,
				displayOptions: { show: { resource: ['testPlan'], operation: ['getPage'] } },
				description: 'Number of plans per page',
			},
			{
				displayName: 'Test Plan ID',
				name: 'planId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['testPlan'], operation: ['startRun'] } },
				description: 'Numeric ID of the plan to execute',
			},
			{
				displayName:
					'Starting a run incurs usage charges. Use exactly one input item. Disable Retry On Fail. A timeout can still mean the run started; inspect existing runs before trying again. There is no API to stop a run.',
				name: 'runNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { resource: ['testPlan'], operation: ['startRun'] } },
			},
			{
				displayName: 'Approve Paid Run',
				name: 'approvePaidRun',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['testPlan'], operation: ['startRun'] } },
				description:
					'Whether to authorize one billed run for this invocation. This is not an idempotency key; re-running the workflow starts another run.',
			},
			{
				displayName: 'Environment',
				name: 'environment',
				type: 'string',
				default: '',
				displayOptions: { show: { resource: ['testPlan'], operation: ['startRun'] } },
				description: 'Environment to run against. Leave empty to use the plan default.',
			},
			{
				displayName: 'Run ID',
				name: 'runId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['run'] } },
				description: 'Run ID returned by Start Run',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const starting = resource === 'testPlan' && operation === 'startRun';
		if (starting && (items.length !== 1 || this.getNode().retryOnFail)) {
			throw new NodeOperationError(
				this.getNode(),
				'Start Run requires exactly one input item and Retry On Fail disabled',
			);
		}
		const output: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			let path: string;
			const qs: IDataObject = {};
			if (resource === 'testPlan' && operation === 'getPage') {
				const page = this.getNodeParameter('page', i) as number;
				const size = this.getNodeParameter('pageSize', i) as number;
				if (
					!Number.isInteger(page) ||
					page < 0 ||
					!Number.isInteger(size) ||
					size < 1 ||
					size > 100
				) {
					throw new NodeOperationError(
						this.getNode(),
						'Page must be a non-negative integer; Page Size must be between 1 and 100',
						{ itemIndex: i },
					);
				}
				path = '/test_plans';
				qs.page = page;
				qs.size = size;
			} else if (starting || (resource === 'run' && operation === 'getSummary')) {
				const id = String(this.getNodeParameter(starting ? 'planId' : 'runId', i)).trim();
				if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n) {
					throw new NodeOperationError(
						this.getNode(),
						'ID must be a positive signed 64-bit integer',
						{ itemIndex: i },
					);
				}
				if (starting) {
					if (this.getNodeParameter('approvePaidRun', i) !== true) {
						throw new NodeOperationError(
							this.getNode(),
							'Approve Paid Run must be enabled before starting a billed run',
							{ itemIndex: i },
						);
					}
					path = `/test_plans/${id}/execution`;
					const environment = String(this.getNodeParameter('environment', i, '')).trim();
					if (environment) qs.environment = environment;
				} else {
					path = `/test_plan_results/${id}/results`;
				}
			} else {
				throw new NodeOperationError(this.getNode(), 'Unsupported resource or operation', {
					itemIndex: i,
				});
			}
			const options: IHttpRequestOptions = {
				method: 'GET',
				url: `https://server.contextqa.com${path}`,
				qs,
				json: true,
				timeout: 30000,
				disableFollowRedirect: true,
			};
			try {
				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'contextQaApi',
					options,
				)) as IDataObject;
				output.push({ json: response, pairedItem: { item: i } });
			} catch {
				// Never include raw HTTP errors: they can contain request headers and credentials.
				const message = starting
					? 'Run request failed or timed out. A billed run may already have started. Inspect existing runs before manually trying again; do not retry automatically.'
					: 'ContextQA request failed. Check token permissions, the selected ID, and rate limits (120 requests/minute/token).';
				if (this.continueOnFail())
					output.push({ json: { error: message }, pairedItem: { item: i } });
				else throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}
		return [output];
	}
}
