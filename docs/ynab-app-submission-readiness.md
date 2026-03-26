# YNAB OAuth App Submission Readiness

Last reviewed: 2026-03-25

This document maps the current hosted app to YNAB's OAuth application review form and the published OAuth Application Requirements.

Primary references:

- YNAB API docs and OAuth Application Requirements: https://api.ynab.com/
- YNAB Terms of Service, third-party application disclosure: https://www.ynab.com/terms

## Current Production App

- Application name in product UI: `MCP for YNAB`
- Production app URL: `https://mcpforynab.smirnovlabs.com/`
- Production MCP URL: `https://mcpforynab.smirnovlabs.com/mcp`
- Privacy page: `https://mcpforynab.smirnovlabs.com/privacy`
- Delete-data page: `https://mcpforynab.smirnovlabs.com/delete`

## Submission Status

### Ready

- OAuth authorization code flow is implemented.
- PKCE is implemented.
- The app never asks for a YNAB password directly.
- The privacy policy is public and linked in the app UI.
- The app UI includes the non-affiliation footer language YNAB asks for.
- The app has a user-facing delete-data flow.
- The service uses OAuth tokens rather than personal access tokens.

### Not Ready Yet

- Public-facing copy still uses `budget` heavily in README, privacy content, resource names, and UX copy. YNAB's review form explicitly asks whether design and marketing use `plan` instead of `budget` where applicable.
- The form asks whether the app name is unique. That still needs a manual check against the current "Works With YNAB" directory.
- We have not verified in YNAB Developer Settings that the privacy policy URL and all app metadata fields match production exactly.

### Likely Okay But Should Be Verified

- Minimum necessary permission scope. This depends on whether production will ship with write-capable tools enabled. If write tools remain available, a full-access scope may be justified. If not, switch to `read-only`.
- Trademark and logo compliance. The current site does not appear to use YNAB logos, which is good, but this should still be checked against any future branding assets.
- The public site now shows the unsupported-app notice before OAuth use, but this should be rechecked in the final production flow after any future UI changes.

## Recommended Answers For The Review Form

These are draft answers based on the current app. They should be edited once the production hostname and marketing copy are finalized.

### Email address

Use the production support email that will handle approval questions and user requests. The current privacy page uses `ivan@smirnovlabs.com`.

### Application's name

Recommended direction:

- `MCP for YNAB`

This appears compliant with the naming rule because it uses `for YNAB`, but uniqueness still needs a manual check.

### Application's web address

Do not submit the current raw Workers hostname if possible.

Recommended direction:

- move production to a branded hostname that does not start with `ynab`
- acceptable shape: `https://mcpforynab.smirnovlabs.com/`
- avoid: `https://ynab-mcp-server.smirnov-labs.workers.dev/`

Reason: YNAB's published OAuth requirements say the application and web address must not include `YNAB` unless preceded by `for`.

### Application's Privacy Policy link

- `https://mcpforynab.smirnovlabs.com/privacy`

### What is the main purpose of this application?

Draft answer:

`This application lets users connect their own YNAB account to supported AI clients such as ChatGPT and Claude through a hosted MCP server. After authorizing with OAuth, users can read plan data and, where enabled, perform YNAB actions through those clients without self-hosting or creating API keys.`

### Is the application's name unique?

Status: manual verification required.

### Does the application's Privacy Policy include an explanation of how the data obtained through the YNAB API will be handled, stored, and secured?

Draft answer:

`Yes. The privacy policy explains what YNAB data is accessed, how OAuth tokens are stored, that plan data is fetched on demand rather than retained as a separate long-term dataset, how long operational data is kept, how users can request deletion, and how the service is secured.`

### Does the application's design and marketing align with YNAB's brand language by using the term "plan" instead of "budget" where applicable?

Current answer:

- `Mostly yes, with some legacy terms still being cleaned up`

Reason:

- the public site and README now favor `plan`, but internal resource and tool names still use legacy `budget` terminology for API compatibility
- this is probably acceptable for implementation details, but public-facing strings should continue to trend toward `plan`

### Is it clear that the application is not affiliated with, sponsored by, endorsed by, or supported by YNAB?

Draft answer:

`Yes. The production site footer includes YNAB's required non-affiliation language.`

### Is the only YNAB logo used in the application the authorized Works with YNAB logo?

Current answer:

- `Yes`, based on current production UI, because no YNAB logos appear to be used

This should be re-verified if marketing pages or app icons are added.

### To the best of your knowledge, does the application's design and marketing avoid infringing on YNAB's trademarks?

Current answer:

- `Yes`, subject to a final manual review of app naming, copy, and any future graphics

### Does the application's website include the required footer language?

Draft answer:

`Yes.`

### To the best of your knowledge, does the integration abide by the API Terms of Service?

Draft answer:

`Yes. The site now includes the non-affiliation footer and a separate unsupported-app notice before a user continues to YNAB authorization.`

### To the best of your knowledge, does the integration's Privacy Policy meet the requirements of the OAuth Application Requirements and User Data Policy?

Draft answer:

`Yes, subject to keeping the production privacy-policy URL in the OAuth app settings and keeping the policy aligned with any future data handling changes.`

### Does the application connect to users' financial accounts using only OAuth authentication?

Draft answer:

`Yes. The service connects to YNAB only through OAuth and does not ask users for YNAB passwords or personal access tokens.`

### If you answered "No" to any of the questions above, please explain.

Draft answer:

`Some implementation-level labels still use legacy "budget" terminology for backward compatibility with the current YNAB API surface and MCP identifiers. Public-facing copy and the production hostname have been updated to align with YNAB's branding and naming requirements.`

### Optional details

Draft answer:

`This integration is designed for non-technical YNAB users who want to use ChatGPT or Claude connectors without creating API keys or self-hosting. It uses a hosted MCP server on Cloudflare Workers, supports user-specific OAuth tokens, and includes user-facing privacy and deletion flows.`

## Pre-Submission Checklist

- [x] Move production to a compliant custom domain
- [x] Update all public-facing copy from `budget` to `plan` where applicable
- [x] Add the stronger unsupported-app disclosure required by YNAB Terms
- [ ] Verify the privacy-policy URL is set in the YNAB OAuth app settings
- [ ] Verify the production homepage URL and redirect URL are correct in YNAB Developer Settings
- [ ] Decide whether production should request `read-only` scope or full access
- [ ] Manually verify the application name is unique on the Works With YNAB list
- [ ] Re-check the final site for any logo or trademark issues before submission

## Concrete Recommendation

Do not submit the review form yet, but the remaining work is smaller now.

The biggest branding and DNS blockers are now fixed. The remaining work is mostly operational: update the YNAB OAuth app settings to the new production URLs, choose the minimum production scope, and do a final manual review for name uniqueness and trademark compliance before submitting the form.
