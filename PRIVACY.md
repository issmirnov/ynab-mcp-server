# Privacy Policy

Last updated: 2026-03-25

## Overview

This service provides a hosted Model Context Protocol (MCP) server for YNAB. It lets a user connect their own YNAB account to supported MCP clients such as ChatGPT and Claude through OAuth.

## Data We Access

When you authorize this service with YNAB, we may access the budget data your YNAB account permits through the granted OAuth scope. Depending on the scope and features used, that can include:

- budget metadata
- accounts
- categories
- transactions
- monthly budget information
- other related YNAB planning data needed to fulfill MCP tool requests

## How We Use Data

We use YNAB user data only to:

- authenticate your connection to the service
- fulfill MCP tool requests you initiate through your connected client
- refresh OAuth access when needed using your YNAB refresh token
- operate, debug, and secure the hosted MCP service

We do not sell YNAB user data.

## Data Storage

The service stores the minimum data needed to operate:

- YNAB OAuth access tokens
- YNAB OAuth refresh tokens
- token expiry metadata
- limited OAuth grant/session state needed to complete authentication

This data is stored in Cloudflare-hosted infrastructure used by the service, including Workers KV and related OAuth state handling.

## Data Retention

Stored OAuth credentials and related operational metadata are retained only as long as reasonably necessary to operate the service, maintain active access, and support security and debugging. Revoked or no-longer-needed credentials should be removed in the normal course of operation.

## Data Sharing

We do not share your YNAB user data with third parties except:

- with infrastructure providers required to operate the service
- when required by law
- when necessary to protect the security, integrity, or operation of the service

## Security

We use OAuth-based delegated access rather than asking for your YNAB password. Secrets are intended to be stored as deployment secrets, not in source control. No system can guarantee absolute security, but reasonable technical measures are used to reduce unauthorized access risk.

## Your Choices

You can stop using the service at any time by:

- disconnecting the MCP client
- revoking the YNAB OAuth grant associated with this service

## Contact

For questions about this privacy policy or the handling of YNAB user data, contact the operator of this service through the repository or deployment contact channel associated with this app.
