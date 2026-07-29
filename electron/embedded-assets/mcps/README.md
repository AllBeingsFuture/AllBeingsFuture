# MCP assets

Built-in user-facing MCP catalogs are **not** shipped or auto-seeded.

Users add MCP servers through the app (Install / custom add). Nothing under a catalog path is discovered into the MCP registry on startup.

## `agent-control/`

Internal runtime server used by the process layer for child-agent control. It is packaged for injection into agent sessions and is **not** registered as a user-visible built-in MCP entry.
