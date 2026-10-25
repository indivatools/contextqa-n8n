# n8n-nodes-contextqa

Native ContextQA REST API node for n8n. This is a **development package**, not an n8n-verified node. The supplied OpenAPI contract was used to implement the requests. Build, lint, and mocked safety tests pass. The package has also been loaded into an isolated n8n 2.44.6 runtime; authenticated live REST validation remains pending a scoped non-production token.

## Operations

- **Test Plan → Get Page** reads one page from `GET /test_plans` and preserves pagination metadata. Increase Page to read another page.
- **Test Plan → Start Run** explicitly starts a billed run using `GET /test_plans/{id}/execution`. Requires Approve Paid Run, exactly one input item, and Retry On Fail disabled. Retain the returned `id`.
- **Run → Get Summary** reads `GET /test_plan_results/{id}/results` using that original run ID. Wait for `status=STATUS_COMPLETED`, then inspect `result`. Pending or missing values never mean success.

Programmatic execution is used because the billed GET action needs branching that validates the workflow retry setting and input count **before any network request**, as well as safe handling of ambiguous timeouts. There are no automatic API retries or automatic polling loops. Enabling approval is per invocation, not a one-use lock: manually executing the workflow again can start another paid run. Upstream workflow replay and schedules need their own deduplication before using Start Run. ContextQA provides no idempotency key or API to stop a run.

## Credentials

Sign up at https://ship.contextqa.com/ using your chosen non-Google sign-in method. A superadmin creates a scoped token in **Settings → API tokens**. Store only the token (without `Bearer `) in the n8n ContextQA API credential. It is a password field; authentication goes to the fixed HTTPS ContextQA host. Do not put tokens in workflow parameters, code, examples, Git, or issue comments.

Required permissions:

| Use                          | Permission               |
| ---------------------------- | ------------------------ |
| Credential test and Get Page | `TEST_PLANS_READ`        |
| Start Run                    | `TEST_PLAN_EXECUTE`      |
| Get Summary                  | `TEST_PLAN_RESULTS_READ` |

The limit is 120 requests/minute/token. On throttling, wait for the server's Retry-After interval. For a failed Start Run, inspect existing runs before manually trying again; the request may already have started a run. The node deliberately does not retry. REST tokens are separate from MCP OAuth; this package is not an MCP wrapper and does not cover the separate ContextAI product.

## Build and test

Use a supported Node LTS version (22 or 24).

```
npm ci --ignore-scripts
npm run lint
npm test
npm pack --ignore-scripts
```

Dependencies are development-only; the runtime uses n8n's HTTP helpers. Tests use mocked requests and never execute real ContextQA runs. `npm run dev` uses the official n8n node tool and needs Docker/Podman for its test instance. An isolated npm-installed n8n 2.44.6 runtime is also used for validation without Docker.

For self-hosted development, build and load this package in an isolated n8n instance, create a scoped read-only credential first, and verify Get Page and Get Summary against a known existing run. A paid Start Run test needs explicit approval for a designated disposable test plan. Never test an execution action simply to verify credentials.

## Distribution status

Source preparation does not install a public integration. Before npm release and verification submission:

1. Complete authenticated tests with a non-production workspace and capture redacted results.
2. Set the npm owner and trusted publisher for this repository; do not share long-lived npm tokens.
3. Publish with GitHub Actions provenance, following https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes/ .
4. Submit through the n8n Creator Portal, then wait for review. Do not claim verification before approval.

Public API collection: https://www.postman.com/deep-2dbadbf7-2980737/workspace/contextqa-api-mcp

Hosted MCP docs (separate integration): https://mcp.contextqa.com/docs

Support: support@contextqa.com

Active CI and provenance publication workflows are installed in .github/workflows. Hosted build, lint, and mocked checks pass. Publication is performed only through the release workflow; a source PR or a passing build does not mean the package is published or verified by n8n.

## Example workflows

Import the credential-free JSON files in [examples](./examples) into an isolated n8n instance after installing the package, then select your own ContextQA API credential:

- `list-test-plans.json`: manual trigger → first plan page (read-only).
- `review-existing-run.json`: enter an existing Run ID to read its summary (read-only).
- `start-approved-test-plan.json`: enter the intended Test Plan ID and explicitly enable approval before use. Approval defaults to false; Retry On Fail is disabled. Running this example can incur charges.

All examples are inactive and contain no credentials, live IDs, schedules, or customer data. Keep reading the original run ID rather than starting another run while waiting for completion.
