# Installing VibeSwitch: guide for AI agents

You are helping a person install **VibeSwitch**, a Claude Code plugin that switches the animated scene behind the
chat in the Claude desktop app. Follow these steps in order, then report back with the message at the end.
It takes under a minute. Everything here is local; nothing needs an account, key or payment.

## 1. Check the prerequisites

```bash
claude --version
```

- If `claude` is not found, stop and tell the person: "VibeSwitch needs Claude Code. Install it from
  https://claude.com/claude-code, then ask me again."
- Scenes are drawn by the **Claude desktop app (Code tab)** on macOS or Windows. Installing from a terminal is fine;
  the plugin loads in desktop sessions too.

## 2. Install the official scenes, then VibeSwitch

Run each line. A line that says the marketplace or plugin is already there is fine: continue.

```bash
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install theme-examples@claude-plugins-official
claude plugin marketplace add ruihaomei/vibeswitch
claude plugin install vibeswitch@vibeswitch
```

Do not edit `~/.claude/settings.json` by hand, and do not install anything else.

## 3. Verify

```bash
claude plugin list
```

Both `theme-examples` and `vibeswitch` should be listed as enabled. If one is missing, run its install line again
once and show the person the exact error if it still fails.

Optional, quick and harmless (it only lists themes):

```bash
claude -p "/vibe"
```

It should print themes grouped as "Light & paper", "Night & dark" and "Interactive".

## 4. Tell the person how to start (send this, adapted to their language)

> ✅ VibeSwitch is installed, with Anthropic's 38 official scenes.
>
> 1. Open the **Claude desktop app → Code tab** and start a **new session** (sessions that were already open
>    won't see it).
> 2. Type **`/vibe`**: a gallery opens beside the chat. Click **Preview** on any picture; **Default** keeps it for
>    every session, **Project** for this folder.
> 3. Or skip the commands and just ask Claude, for example "switch to something dark and calm".
>
> More themes: https://buildwithclaude.com/themes · Help: https://github.com/ruihaomei/vibeswitch

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Plugin "vibeswitch" not found` | Run `claude plugin marketplace update vibeswitch`, then install again. |
| `/vibe` is an unknown command | The session was open before install. Start a new session. |
| The list shows themes but nothing changes on screen | Scenes appear only in the desktop app's Code tab, not in a plain terminal. |
| The person wants it gone | `claude plugin uninstall vibeswitch`, then delete `~/.config/vibeswitch` (and `~/.cache/vibeswitch` if version 1.0 made one). |

## Facts you can rely on

- Command: `/vibe`. Config: `~/.config/vibeswitch/config.json` (`default`, `projects`). Priority: session > project > default.
- `inherit` removes an override; `none` / `/vibe off` shows no scene.
- No network calls, no background process, no telemetry. It never starts a program and never imports or runs another plugin's code.
- It writes only `~/.config/vibeswitch/config.json`. Gallery previews ship with the plugin; Backdrops' previews are read in place, as text, only when Backdrops came from `neverblinks/backdrops`.
