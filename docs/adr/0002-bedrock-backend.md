# ADR-0002: Add Amazon Bedrock as a cloud provider with bearer-token or SigV4 auth

- Status: Accepted
- Date: 2026-06-29

## Context

The Cloudflare backend reaches three cloud providers (Anthropic, Google,
OpenAI) keyed by API keys, and the Node backend (ADR-0001) reaches a local
koboldcpp model. We want a fourth provider: the same Claude models Claude Code
runs, served over Amazon Bedrock, so a hosted Claude (Sonnet/Opus) can be
compared against the local model in the same UI without an Anthropic API key.

Constraints discovered during design:

- The AI SDK Bedrock provider (`@ai-sdk/amazon-bedrock`) signs requests with
  `aws4fetch`, not the AWS SDK credential chain. It does **not** auto-resolve
  an SSO profile from `~/.aws`. Auth must be passed explicitly.
- Two auth paths exist and both are needed:
  - **Bearer token** (`AWS_BEARER_TOKEN_BEDROCK`), the long-lived Bedrock API
    key Claude Code uses.
  - **SigV4 from temporary SSO credentials** (access key + secret + session
    token), via `aws configure export-credentials`.
- Bedrock model ids are **region-scoped inference profile ids**
  (`us.anthropic.claude-...`, `eu.anthropic.claude-...`). The prefix must match
  the request region, and the calling IAM identity must be authorized to invoke
  in that region. The `ClaudeBedrockAccess` SSO role (account `818539737064`) is
  authorized for **us-west-2 only**; `eu-west-2` returns
  `403 AccessDeniedException` (`bedrock:InvokeModelWithResponseStream ... no
  identity-based policy allows the action`).
- The `@ai-sdk/amazon-bedrock` major version is pinned to the `@ai-sdk/provider`
  major the rest of the SDK uses. The latest `5.x` pulls `provider@4`, which
  fails to assign to the `LanguageModel` type used by `ai@5`; `3.0.x` pulls
  `provider@2` and matches.

## Decision

Add `'bedrock'` to `AgentModelProvider` as a **cloud provider** (not a new
backend). It runs on either backend unchanged; the Node server gains an
`AGENT_BACKEND=bedrock` mode that pins every prompt to a Bedrock model so the
local-only server can drive a hosted Claude.

- **Provider.** `createAmazonBedrock(...)` in `AgentService`. Bearer token takes
  precedence (`{ apiKey, region }`); with no bearer token, fall back to the
  SigV4 triple (`{ region, accessKeyId, secretAccessKey, sessionToken }`).
- **Model ids.** `us.anthropic.claude-sonnet-4-6` and
  `us.anthropic.claude-opus-4-8`, matching the us-west-2 region the SSO role is
  authorized for. The `id` differs from the `name` (like the local provider),
  so the bedrock path **bypasses the `isValidModelName(model.modelId)` guard**.
- **Caching.** Bedrock expresses the system-prompt cache breakpoint as
  `providerOptions.bedrock.cachePoint`, not Anthropic's `cacheControl`.
- **Prefill off.** `supportsPrefill: false`; newer Claude models reject an
  assistant-prefill turn. The grammar `response_format` (local path only) does
  not apply; Bedrock steers JSON via prompt + schema like the other cloud
  providers.
- **Node server backend mode.** `AGENT_BACKEND=bedrock` forces every prompt to
  `AGENT_BEDROCK_MODEL` (default `bedrock-claude-sonnet-4-6`); koboldcpp is never
  contacted. Default (`local`) still forces `local` except an explicit
  `bedrock-*` selection, which passes through for in-UI comparison.

Considered and rejected:

- **eu-west-2 with `eu.anthropic.*` ids.** The intended region, but the SSO
  role's IAM policy denies eu invoke (403). Unblocking needs an admin to add
  `bedrock:InvokeModel*` on
  `arn:aws:bedrock:eu-west-2:818539737064:inference-profile/eu.*`. Out of our
  control; revisit if granted.
- **`@aws-sdk/credential-providers` + `fromSSO`.** Auto-reads the SSO cache and
  refreshes, but adds a dependency. `export-credentials` into env needs none.
- **A separate Bedrock backend.** Bedrock is a provider, not a runtime; it fits
  the existing provider-routing seam.

## Consequences

- A fourth provider, no new backend. Cloud and local paths both gain it.
- Two auth paths to keep working: bearer token and SigV4. The env carries both;
  bearer wins when present.
- Region is **us-west-2**, not the eu the project otherwise targets, because the
  available SSO role is us-only. This is an access constraint, not a code one;
  the model ids are the single switch point if eu is later authorized.
- SSO credentials expire in hours; the operator re-runs `aws sso login` +
  `export-credentials`. The bearer-token path has no such expiry.
- `@ai-sdk/amazon-bedrock` is pinned to `3.0.x` to match `@ai-sdk/provider@2`.

## Validation

- Live Bedrock call over SigV4 (SSO, us-west-2) through `AgentService` and the
  Node server in `AGENT_BACKEND=bedrock` mode: "draw a single red rectangle"
  yields a `create` rectangle action, no errors. Bearer-token path smoke-tested
  separately. `tsc` clean, 47/47 unit tests pass.
