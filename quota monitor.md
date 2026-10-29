# Antigravity Quota Monitor — Design Spec

A VS Code extension (works in VS Code, Antigravity IDE and other VS Code forks) that shows the Antigravity AI model quota (weekly and 5-hour windows) in the status bar, a quick-pick menu and a sidebar dashboard.

# Architecture

The extension reads quota directly from the locally running Antigravity language-server daemon. There is no backend, proxy or WebSocket.

1. **Discovery** (`src/liveDiscovery.ts` → `discoverAntigravityEndpoint`)
   Finds the daemon's `--hub-port` and `--csrf_token` from its process command line:
   - **Windows:** `powershell Get-CimInstance Win32_Process` filtered to `agy*` processes.
   - **macOS / Linux:** `ps -axww -o command=`, filtered by `isAntigravityCommandLine` (executable named `agy*` or installed under an `Antigravity` path).
   Port and token must come from the **same** command line (`parseEndpoint`). Commands are run with `execFile` (no shell) and a 4s timeout.
2. **Fetch** (`fetchLiveQuota`)
   Two Connect-RPC `POST` calls to `http://127.0.0.1:<port>` with the `X-Codeium-Csrf-Token` header:
   - `LanguageServerService/RetrieveUserQuotaSummary` → quota groups and buckets (required; failure throws).
   - `LanguageServerService/GetUserStatus` → plan name and account email (optional).
   Non-2xx responses and invalid JSON are errors. On any error the cached endpoint is dropped and rediscovered on the next sync.
3. **Sync loop** (`src/extension.ts`)
   Polls every 60s, plus manual refresh. Only one sync runs at a time. The latest payload is stored in `workspaceState` and restored on startup, after `isValidQuotaPayload` checks it.
4. **UI**
   - **Status bar** (`src/statusBar.ts`): pinned limits (compact or detailed mode), warning/error colours at ≤25% / ≤10%, and a markdown tooltip.
   - **Quick pick** (`src/quickPick.ts`): every limit with a progress bar; select one to pin or unpin it. Also holds the display actions.
   - **Sidebar webview** (`src/sidebarProvider.ts`): group cards with bars and live reset countdowns.
   - **Notifications:** quota restored (≤10% → ≥50%) and critically low (>10% → ≤10%).

# Data shown

Only values returned by the daemon are displayed. Nothing is invented: no placeholder credits, token counts or default plan name. When the plan name is unknown, the UI shows just "LIVE".

# Security Guardrails

- Daemon data is treated as untrusted:
  - Tooltip markdown trusts only the extension's own commands (`isTrusted.enabledCommands`), and daemon strings are added with `appendText`.
  - Sidebar HTML escapes every interpolated value (`esc()`).
  - The webview Content-Security-Policy allows only scripts carrying a per-page nonce from `crypto.randomBytes`.
- The CSRF token is never logged and is only sent to `127.0.0.1`.
- No runtime dependencies.

# Lifecycle

All disposables are registered in `context.subscriptions`. `deactivate()` clears the poll timer and disposes the status bar and output channel. The sidebar re-sends the latest state when it becomes visible again.

# Build, Test, Package

- `npm run compile` — TypeScript → `out/`
- `npm test` — compile + `test/test-client-validation.js` (payload validation, endpoint parsing across platforms)
- `npx @vscode/vsce package` — produces `quota-monitor-<version>.vsix`
