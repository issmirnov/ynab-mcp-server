# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability, please follow these steps:

### 1. **DO NOT** create a public GitHub issue
Security vulnerabilities should be reported privately to prevent exploitation.

### 2. Report via Email
Send an email to: [security@issmirnov.com](mailto:security@issmirnov.com)

Include the following information:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes or mitigations

### 3. Response Timeline
- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Within 30 days (depending on complexity)

### 4. What to Expect
- We will acknowledge receipt of your report
- We will investigate and validate the vulnerability
- We will work on a fix and coordinate disclosure
- We will credit you in our security advisories (unless you prefer to remain anonymous)

## Security Best Practices

### For Users
- Always use the latest version of the package
- Keep your YNAB API tokens secure and never share them
- Use environment variables for sensitive configuration
- Regularly audit your YNAB account for unauthorized access

### For Developers
- Follow secure coding practices
- Never log or expose API tokens
- Validate all inputs from external sources
- Use HTTPS for all API communications
- Implement proper error handling without information leakage

## Security Features

This MCP server implements several security measures:

- **Token Protection**: YNAB API tokens are never exposed to the LLM
- **Environment Variables**: Sensitive data is handled via environment variables
- **Input Validation**: All tool inputs are validated using JSON Schema
- **Error Handling**: Secure error messages that don't expose internal details
- **Dependency Scanning**: Regular security audits of dependencies

## Dependencies

We regularly audit our dependencies for security vulnerabilities:
- `@modelcontextprotocol/sdk`: Official MCP SDK
- `ynab`: Official YNAB JavaScript SDK

## Contact

For security-related questions or concerns, please contact:
- Email: [security@issmirnov.com](mailto:security@issmirnov.com)
- GitHub: [@issmirnov](https://github.com/issmirnov)

## Acknowledgments

We appreciate the security research community and will acknowledge security researchers who responsibly disclose vulnerabilities.
