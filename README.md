# Antigravity Quota Monitor

See your Antigravity AI model quota without leaving the editor. This VS Code extension reads the weekly and 5-hour usage limits from your running Antigravity IDE and shows them in the status bar, a quick-pick menu and a sidebar dashboard.

> Unofficial community extension. It is not affiliated with or endorsed by Google or the Antigravity team.

## Features

### Status bar
- Shows the remaining quota (%) for the limits you **pin**.
- **Detailed mode** lists every pinned limit, for example `Argon: 99.7% | Claude/GPT [Wk]: 42.0% | Gemini [5h]: 95.8%`.
- **Compact mode** shows only the lowest pinned limit, for example `Claude/GPT [Wk]: 42%`.
- Colour coding: **yellow** at 25% or less, **red** with ⚠️ at 10% or less.
- Hover for a tooltip that has:
  - your plan and the account email Antigravity is signed in with,
  - every group's weekly and 5-hour limits with reset countdowns,
  - quick links to the menu, the sidebar and a mode switch.
- Click it to open the quota menu.

### Quota menu (quick pick)
- Lists every model group and limit window, each with a progress bar, % remaining and time until reset.
- Select a limit to **pin or unpin** it in the status bar. At least one limit stays pinned.
- Actions: switch between compact and detailed mode, open the sidebar, refresh now.

### Sidebar dashboard
- Find it under **Quota Monitor** in the Activity Bar.
- Shows one card per model group, with a coloured bar for each limit and a live **reset countdown** that updates every second.
- ★ / ☆ buttons pin or unpin a limit.
- Toolbar buttons: **Refresh**, **Menu**, **Mode**.
- A status pill shows whether data is `LIVE` and which plan you're on, or `NO DATA` with the reason and a retry button.

### Notifications
- ⚠️ **Critically low**: a limit drops from above 10% to 10% or less.
- 🎉 **Refreshed**: a limit goes from 10% or less back up to 50% or more.

### Automatic sync
- Finds the local Antigravity service automatically and refreshes every **60 seconds**. You can also refresh on demand.
- If Antigravity restarts or the connection drops, the extension finds the service again on its own.
- The last known quota is saved per workspace and shown straight away when the editor starts.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **Antigravity Quota**:

| Command | What it does |
|---|---|
| `Antigravity Quota: Open Antigravity Quota Menu` | Opens the quota menu (the same as clicking the status bar) |
| `Antigravity Quota: Toggle Compact / Detailed Status Bar Mode` | Switches the status bar layout |
| `Antigravity Quota: Refresh Quota` | Finds the Antigravity service again and fetches the latest quota |
| `Antigravity Quota: Focus Quota Dashboard` | Opens the sidebar dashboard |

Your pinned limits and display mode are remembered per workspace.

## Requirements

- **Antigravity IDE must be running and signed in.** The extension reads quota from Antigravity's local language-server service. It doesn't contact Google's servers itself.
- VS Code 1.85 or newer. Works in VS Code, in Antigravity itself, and in other VS Code-based editors.

| Platform | Status |
|---|---|
| Windows | ✅ Tested |
| macOS | 🧪 Experimental (finds the service by listing running processes; untested) |
| Linux | 🧪 Experimental (finds the service by listing running processes; untested) |

If discovery doesn't work on macOS or Linux, please [open an issue](https://github.com/richter80/antigravity-quota-monitor/issues) and include the output of `ps -axww -o command= | grep -i csrf` with the token value removed.

## Installation

The extension isn't on the Marketplace yet. To install it from a `.vsix` file:

1. Download [`releases/quota-monitor-0.0.1.vsix`](https://github.com/richter80/antigravity-quota-monitor/raw/main/releases/quota-monitor-0.0.1.vsix), or build it yourself (see [Development](#development)).
2. Install it:
   ```sh
   code --install-extension quota-monitor-0.0.1.vsix
   ```
   Or, in the Extensions view, open the **…** menu and choose **Install from VSIX…**.

## How it works

1. **Discovery.** The extension looks at the running Antigravity process's command line to find its local port and session token. On Windows it uses PowerShell (`Get-CimInstance`); on macOS and Linux it uses `ps`.
2. **Fetch.** Every 60 seconds it sends two requests to that service on `127.0.0.1`:
   - `RetrieveUserQuotaSummary` returns the quota groups and limits.
   - `GetUserStatus` returns the plan name and account email.
3. **Display.** The result updates the status bar, the menu and the sidebar.

### Privacy & security
- All traffic stays on your machine (`127.0.0.1`). The extension sends no telemetry and makes no external requests.
- The session token is read from the running process, used only for local requests, and never logged or stored.
- Only values reported by Antigravity are shown. Nothing is estimated or made up.
- The extension has no runtime dependencies.

## Development

```sh
npm install
npm run compile                 # TypeScript → out/
npm test                        # compile + validation and discovery-parser tests
npx @vscode/vsce package        # build quota-monitor-<version>.vsix
```

Press `F5` in VS Code to start an Extension Development Host with the extension loaded.

### Project layout

| File | Purpose |
|---|---|
| `src/extension.ts` | Activation, sync loop, commands, pinning, notifications |
| `src/liveDiscovery.ts` | Finding the Antigravity service and calling it |
| `src/statusBar.ts` | Status bar item and tooltip |
| `src/quickPick.ts` | Quota menu |
| `src/sidebarProvider.ts` | Sidebar webview |
| `src/types.ts` | Data types, payload validation, reset-time formatting |
| `test/test-client-validation.js` | Tests for validation and discovery parsing |

The design spec is in [quota monitor.md](quota%20monitor.md).

## License

[MIT](LICENSE)
