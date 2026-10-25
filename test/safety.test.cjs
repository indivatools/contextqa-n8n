const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ContextQa } = require('../dist/nodes/ContextQa/ContextQa.node.js');
function fixture(parameters = {}, overrides = {}) {
	const calls = [];
	const context = {
		getInputData: () => [{ json: {} }],
		getNode: () => ({
			name: 'ContextQA',
			type: 'contextQa',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		getNodeParameter: (name, i, fallback) =>
			({
				resource: 'testPlan',
				operation: 'startRun',
				planId: '42',
				approvePaidRun: false,
				environment: '',
				...parameters,
			})[name] ?? fallback,
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (auth, options) => {
				calls.push({ auth, options });
				return { id: 987 };
			},
		},
		...overrides,
	};
	return { context, calls, execute: () => ContextQa.prototype.execute.call(context) };
}
test('paid run without approval never reaches network', async () => {
	const f = fixture();
	await assert.rejects(f.execute(), /Approve Paid Run/);
	assert.equal(f.calls.length, 0);
});
test('paid execution rejects input fanout', async () => {
	const f = fixture({ approvePaidRun: true }, { getInputData: () => [{ json: {} }, { json: {} }] });
	await assert.rejects(f.execute(), /exactly one/);
	assert.equal(f.calls.length, 0);
});
test('paid execution refuses workflow automatic retries', async () => {
	const f = fixture(
		{ approvePaidRun: true },
		{ getNode: () => ({ name: 'ContextQA', retryOnFail: true }) },
	);
	await assert.rejects(f.execute(), /Retry On Fail disabled/);
	assert.equal(f.calls.length, 0);
});
test('invalid and oversized IDs cannot enter request path', async () => {
	for (const planId of ['../1', '0', '-1', '1.5', '9223372036854775808']) {
		const f = fixture({ approvePaidRun: true, planId });
		await assert.rejects(f.execute(), /64-bit/);
		assert.equal(f.calls.length, 0);
	}
});
test('approved run makes exactly one authenticated request and preserves run ID', async () => {
	const f = fixture({ approvePaidRun: true, environment: 'staging' });
	const result = await f.execute();
	assert.equal(f.calls.length, 1);
	assert.equal(f.calls[0].auth, 'contextQaApi');
	assert.equal(f.calls[0].options.url, 'https://server.contextqa.com/test_plans/42/execution');
	assert.equal(f.calls[0].options.method, 'GET');
	assert.equal(f.calls[0].options.disableFollowRedirect, true);
	assert.deepEqual(f.calls[0].options.qs, { environment: 'staging' });
	assert.equal(result[0][0].json.id, 987);
});
test('ambiguous failure never retries and does not disclose raw request error', async () => {
	let count = 0;
	const f = fixture(
		{ approvePaidRun: true },
		{
			helpers: {
				httpRequestWithAuthentication: async () => {
					count++;
					throw new Error('Authorization: secret-test-value');
				},
			},
		},
	);
	await assert.rejects(
		f.execute(),
		(e) => /may already have started/.test(e.message) && !/secret-test-value/.test(e.message),
	);
	assert.equal(count, 1);
});
test('read summary preserves pending status without declaring success', async () => {
	const pending = { status: 'STATUS_IN_PROGRESS', result: 'IN_PROGRESS', passedCount: 0 };
	const f = fixture(
		{ resource: 'run', operation: 'getSummary', runId: '987' },
		{ helpers: { httpRequestWithAuthentication: async () => pending } },
	);
	assert.deepEqual((await f.execute())[0][0].json, pending);
});
test('page read preserves pagination metadata', async () => {
	const page = { content: [{ id: 42 }], totalPages: 3, totalElements: 45 };
	const f = fixture(
		{ operation: 'getPage', page: 0, pageSize: 20 },
		{ helpers: { httpRequestWithAuthentication: async () => page } },
	);
	assert.deepEqual((await f.execute())[0][0].json, page);
});
test('continue-on-fail produces safe error without resending', async () => {
	let count = 0;
	const f = fixture(
		{ approvePaidRun: true },
		{
			continueOnFail: () => true,
			helpers: {
				httpRequestWithAuthentication: async () => {
					count++;
					throw Error('secret-test-value');
				},
			},
		},
	);
	const result = await f.execute();
	assert.match(result[0][0].json.error, /may already have started/);
	assert.equal(count, 1);
});
