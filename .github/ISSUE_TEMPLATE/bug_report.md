---
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: ['bug', 'needs-triage']
assignees: 'issmirnov'
---

## Bug Description

A clear and concise description of what the bug is.

## To Reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

A clear and concise description of what actually happened.

## Environment

- **OS**: [e.g. macOS, Windows, Linux]
- **Node.js Version**: [e.g. 20.11.0]
- **Package Version**: [e.g. 0.1.2]
- **MCP Client**: [e.g. Claude Desktop, Cline, etc.]

## Configuration

```json
{
  "mcpServers": {
    "ynab-mcp-server": {
      "command": "npx",
      "args": ["ynab-mcp-server"],
      "env": {
        "YNAB_API_TOKEN": "***"
      }
    }
  }
}
```

## Error Messages

```
Paste any error messages here
```

## Logs

```
Paste relevant logs here
```

## Additional Context

Add any other context about the problem here.

## Checklist

- [ ] I have searched existing issues to ensure this is not a duplicate
- [ ] I have provided all the information requested above
- [ ] I have tested with the latest version of the package
- [ ] I have verified my YNAB API token is valid and has proper permissions
