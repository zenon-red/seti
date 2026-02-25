# MCP

This directory contains MCP-specific code.

## Components

- `server.ts` - MCP server setup and tool registration ✅ Implemented
- `tools.ts` - Tool definitions (optional, currently in server.ts)
- `handlers.ts` - Request handlers (optional, currently in server.ts)

## Tools

1. **web_search** - Main search tool

Provider status and usage reporting are intentionally kept out of MCP tool exposure to reduce tool-list clutter for agents. Those diagnostics belong in CLI/TUI surfaces.

## Implementation Status

- ✅ Basic server with stdio transport
- ✅ Tool registration framework
- 🚧 Actual search implementation pending
