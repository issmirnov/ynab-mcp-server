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

This service runs on an ephemeral Cloudflare Worker. It does not maintain or operate a separate long-term application database of your YNAB budget contents, and it is not designed to retain your YNAB budget data as a stored dataset. Budget data is accessed from YNAB only as needed to fulfill the tool request you initiate through your MCP client.

The service does store the minimum OAuth-related data needed to operate:

- YNAB OAuth access tokens
- YNAB OAuth refresh tokens
- token expiry metadata
- limited OAuth grant/session state needed to complete authentication

This data is stored in Cloudflare-hosted infrastructure used by the service, including Workers KV and related OAuth state handling.

## Data Retention

Stored OAuth credentials and related operational metadata are retained only as long as needed to keep your connector working. Budget data fetched from YNAB to answer a request is not intentionally retained as an application dataset after the request is completed. If you remove the connector connection or revoke the YNAB OAuth grant, associated stored OAuth credentials should no longer be needed and should be removed in the normal course of operation.

## Data Sharing

We do not share your YNAB user data with third parties except:

- with infrastructure providers required to operate the service
- when required by law
- when necessary to protect the security, integrity, or operation of the service

## Security

We use OAuth-based delegated access rather than asking for your YNAB password. Secrets are intended to be stored as deployment secrets, not in source control. No system can guarantee absolute security, but reasonable technical measures are used to reduce unauthorized access risk.

## Your Choices

You can stop using the service at any time by:

- removing the connection in your AI client's settings for custom connectors or connected apps
- revoking the YNAB OAuth grant associated with this service

You have full control to disconnect this MCP server at any time. If you remove the connector from the AI client where you added it, that ends future access through this integration from that client. You may also revoke the YNAB OAuth grant for this service at any time.

## Contact

For questions about this privacy policy, requests related to stored OAuth credentials, or the handling of YNAB user data, contact `ivan@smirnovlabs.com`.
