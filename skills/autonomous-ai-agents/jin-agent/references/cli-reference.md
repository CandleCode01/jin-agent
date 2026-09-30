# Jin CLI Reference

Live sources when anything looks stale: `jin --help`, `jin <command> --help`,
https://jin-agent.candlecode.com/docs/reference/cli-commands

### Global Flags

```
jin [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
jin chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
jin setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
jin model                Interactive model/provider picker
jin fallback [add|remove|list]  Fallback provider chain
jin config [show|edit|get|set|unset|path|env-path|check|migrate]
jin login / logout       OAuth sign-in / clear stored auth
jin doctor [--fix]       Check dependencies and config
jin status [--all]       Component status
```

### Tools & Skills

```
jin tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

jin skills list|browse|search QUERY|inspect ID
jin skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
jin skills config        Enable/disable skills per platform
jin skills check|update|uninstall|publish PATH
jin skills tap add REPO  Add a GitHub repo as a skill source
jin bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
jin mcp add NAME (--url or --command) | remove | list | test NAME
jin mcp catalog | install NAME     Curated catalog install
jin mcp configure NAME             Toggle tool selection
jin mcp serve                      Run Jin as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
jin gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `jin photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://jin-agent.candlecode.com/docs/user-guide/messaging/

### Sessions

```
jin sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
jin cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
jin webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
jin profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
jin profile rename A B | alias NAME | export NAME | import FILE
jin profile migrate-identity A B   Retry a completed rename's session/routing identity migration
```

### Credentials & Pools

```
jin auth                 Interactive credential manager
jin auth add [PROVIDER]  Add OAuth or API-key credential (candlecode, openai-codex, qwen-oauth, …)
jin auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
jin desktop / gui        Native desktop app
jin dashboard            Web admin panel + embedded chat (--stop / --status)
jin proxy                OpenAI-compatible local proxy backed by an OAuth provider
jin portal               Quick setup / sign in via CandleCode Portal
jin kanban <verb>        Multi-agent work-queue board
jin project              Named multi-folder workspaces
jin skin list|use|set    Switch/tweak skins (see references/themes.md)
jin pets <verb>          Pet mascots (see references/petdex.md)
jin memory setup|status|off|reset   Memory provider
jin secrets bitwarden|onepassword   External secret stores
jin moa                  Mixture-of-Agents slots
jin hooks / security / backup / import / checkpoints / console
jin logs [-f] [errors]   View agent/error logs
jin send                 One-off message through a gateway platform
jin pairing / plugins / insights / journey / computer-use
jin acp                  ACP server (IDE integration)
jin completion bash|zsh|fish
jin update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `jin photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `jin config edit` · [Configuration docs](https://jin-agent.candlecode.com/docs/user-guide/configuration) |
| Tools / toolsets | `jin tools list` · [Tools reference](https://jin-agent.candlecode.com/docs/reference/tools-reference) |
| Skills catalog | `jin skills browse` · [Skills catalog](https://jin-agent.candlecode.com/docs/reference/skills-catalog) |
| Provider setup | `jin model` · [Providers guide](https://jin-agent.candlecode.com/docs/integrations/providers) |
| Env variables | `jin config env-path` · [Env vars reference](https://jin-agent.candlecode.com/docs/reference/environment-variables) |
| Gateway logs | `~/.jin/logs/gateway.log` (or `jin logs`) |
| Sessions | `jin sessions browse` (reads state.db) |
