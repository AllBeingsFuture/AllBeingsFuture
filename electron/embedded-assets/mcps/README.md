# MCP assets

Built-in user-facing MCP catalogs are **not** shipped or auto-seeded.

Users add MCP servers through the app (Install / custom add). Nothing under a catalog path is discovered into the MCP registry on startup.

## `agent-control/`

Internal runtime server used by the process layer for child-agent control. It is packaged for injection into agent sessions and is **not** registered as a user-visible built-in MCP entry.

## `mempalace-safe/`

Internal stdio proxy used when an enabled user MCP looks like mempalace. Each agent session still spawns its own proxy+backend (ACP stdio cannot share one connection). Serialization is cross-process via shared `~/.mempalace/locks/abf_write.lock` (heartbeat + max-hold reclaim) + in-process write chain; reads unguarded; wait/retry until tool budget (defaults: lock/tool 180s, child 90s) so concurrent multi-agent writers succeed; child kill+respawn on write timeout to release OS flocks. Host always materializes budgets + lock path into MCP `config.env` (agent CLI spawn does not inherit Electron env reliably). Auto-wired by `MCPService.getEnabledServerConfigs()` — not a user-facing catalog entry.
