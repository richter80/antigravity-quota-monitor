import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { QuotaPayload, StatusBarMode } from './types';

export class QuotaSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'quota-monitor.sidebarView';
    private view?: vscode.WebviewView;
    private latestPayload?: QuotaPayload;
    private isDisconnected = false;
    private disconnectReason = 'Searching for Antigravity service...';
    private pinnedModels: Set<string> = new Set();
    private currentMode: StatusBarMode = 'detailed';
    public onTogglePin?: (name: string) => void;

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'togglePin' && this.onTogglePin) this.onTogglePin(msg.name);
            else if (msg.command === 'refresh') vscode.commands.executeCommand('quota-monitor.refreshQuota');
            else if (msg.command === 'openMenu') vscode.commands.executeCommand('quota-monitor.openMenu');
            else if (msg.command === 'toggleMode') vscode.commands.executeCommand('quota-monitor.toggleCompactMode');
        });

        const resend = () => {
            if (this.latestPayload) this.sendUpdate();
            else if (this.isDisconnected) this.sendDisconnected(this.disconnectReason);
        };
        resend();
        // Updates are dropped while hidden, so push the latest state when the view is shown again.
        webviewView.onDidChangeVisibility(() => { if (webviewView.visible) resend(); });

        webviewView.onDidDispose(() => { this.view = undefined; });
    }

    public updateQuota(payload: QuotaPayload, pinned: Set<string>, mode: StatusBarMode): void {
        this.latestPayload = payload;
        this.isDisconnected = false;
        this.pinnedModels = pinned;
        this.currentMode = mode;
        this.sendUpdate();
    }

    public setDisconnected(reason: string): void {
        this.isDisconnected = true;
        this.disconnectReason = reason;
        this.latestPayload = undefined;
        this.sendDisconnected(reason);
    }

    private sendUpdate(): void {
        if (this.view && this.view.visible && this.latestPayload) {
            this.view.webview.postMessage({
                type: 'quotaUpdate',
                payload: this.latestPayload,
                pinned: Array.from(this.pinnedModels),
                mode: this.currentMode
            });
        }
    }

    private sendDisconnected(reason: string): void {
        if (this.view && this.view.visible) {
            this.view.webview.postMessage({ type: 'disconnected', reason });
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Antigravity Quotas</title>
    <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; margin: 0; font-size: 12px; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 6px; }
        .status-pill { font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; background: #1b5e20; color: #a5d6a7; }
        .status-pill.offline { background: #b71c1c; color: #ffcdd2; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; }
        .offline-card { border: 1px solid var(--vscode-editorWarning-foreground, #cca700); background: var(--vscode-editorWarning-background, rgba(204,167,0,0.1)); border-radius: 6px; padding: 14px; text-align: center; }
        .group-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border, #3a3d41); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
        .group-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
        .bucket-row { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-widget-border, #333); }
        .bucket-header { display: flex; justify-content: space-between; font-size: 11px; }
        .pin-btn { background: transparent; border: none; cursor: pointer; font-size: 13px; padding: 0 4px; color: var(--vscode-editorWarning-foreground); }
        .bar-bg { background-color: var(--vscode-editorWidget-background, #252526); border-radius: 3px; height: 6px; overflow: hidden; margin: 5px 0; }
        .bar-fill { height: 100%; transition: width 0.3s ease; background-color: var(--vscode-charts-green, #4caf50); }
        .bar-fill.warn { background-color: var(--vscode-editorWarning-foreground, #cca700); }
        .bar-fill.danger { background-color: var(--vscode-editorError-foreground, #f14c4c); }
        .meta { display: flex; justify-content: space-between; color: var(--vscode-descriptionForeground); font-size: 10.5px; }
        .disabled-note { color: var(--vscode-descriptionForeground); font-style: italic; }
    </style>
</head>
<body>
    <div class="toolbar">
        <div>
            <button id="refreshBtn">↻ Refresh</button>
            <button id="menuBtn">☰ Menu</button>
            <button id="modeBtn">◫ Mode</button>
        </div>
        <span id="statusPill" class="status-pill">● LIVE</span>
    </div>
    <div id="contentContainer"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let lastPayload = null, pinnedSet = new Set(), currentMode = 'detailed', isOff = false, offReason = '';
        document.getElementById('refreshBtn').onclick = () => vscode.postMessage({ command: 'refresh' });
        document.getElementById('menuBtn').onclick = () => vscode.postMessage({ command: 'openMenu' });
        document.getElementById('modeBtn').onclick = () => vscode.postMessage({ command: 'toggleMode' });

        function esc(v) {
            return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function formatCountdown(iso) {
            const diff = new Date(iso).getTime() - Date.now();
            if (diff <= 0) return 'Resetting now';
            const m = Math.floor(diff / 60000);
            const d = Math.floor(m / (60 * 24));
            const h = Math.floor((m % (60 * 24)) / 60);
            const min = m % 60;
            return 'Resets in: ' + (d > 0 ? d + 'd ' + h + 'h' : (h > 0 ? h + 'h ' + min + 'm' : min + 'm'));
        }

        function render() {
            const pill = document.getElementById('statusPill');
            const container = document.getElementById('contentContainer');
            const modeBtn = document.getElementById('modeBtn');
            modeBtn.textContent = currentMode === 'compact' ? '◫ Compact' : '◫ Detailed';

            if (isOff) {
                pill.textContent = 'NO DATA'; pill.className = 'status-pill offline';
                container.innerHTML = \`<div class="offline-card"><div style="font-weight:bold;margin-bottom:6px;">⚠️ Antigravity Not Detected</div><p>\${esc(offReason)}</p><button id="retryBtn">↻ Retry Live Connection</button></div>\`;
                document.getElementById('retryBtn').onclick = () => vscode.postMessage({ command: 'refresh' });
                return;
            }
            if (!lastPayload) return;
            pill.textContent = lastPayload.isLive ? '● LIVE' + (lastPayload.planName ? ' (' + lastPayload.planName + ')' : '') : '○ SIMULATED';
            pill.className = 'status-pill' + (lastPayload.isLive ? '' : ' offline');

            const groups = lastPayload.groups || [];
            container.innerHTML = groups.map(g => {
                const bucketHtml = g.buckets.map(b => {
                    const fullName = g.displayName + ' (' + (b.window === 'weekly' ? 'Weekly' : '5-Hour') + ')';
                    const isPinned = pinnedSet.has(fullName);
                    const pct = Number(b.percent) || 0;
                    const colorClass = pct <= 10 ? 'danger' : pct <= 25 ? 'warn' : '';
                    const disabledTag = b.disabled ? ' <span class="disabled-note">(Disabled)</span>' : '';
                    return \`<div class="bucket-row"><div class="bucket-header"><span><button class="pin-btn" data-name="\${esc(fullName)}">\${isPinned ? '★' : '☆'}</button>\${b.window === 'weekly' ? 'Weekly limit' : '5-hour limit'}\${disabledTag}</span><span style="font-weight:bold;">\${pct.toFixed(1)}%</span></div><div class="bar-bg"><div class="bar-fill \${colorClass}" style="width:\${pct}%"></div></div><div class="meta"><span class="countdown" data-reset="\${esc(b.resetTime)}">\${formatCountdown(b.resetTime)}</span><span>\${pct.toFixed(0)}% left</span></div></div>\`;
                }).join('');
                return \`<div class="group-card"><div class="group-title"><span>\${esc(g.displayName)}</span></div>\${bucketHtml}</div>\`;
            }).join('');

            document.querySelectorAll('.pin-btn').forEach(b => {
                b.onclick = () => vscode.postMessage({ command: 'togglePin', name: b.getAttribute('data-name') });
            });
        }

        window.addEventListener('message', ev => {
            if (ev.data?.type === 'quotaUpdate') {
                lastPayload = ev.data.payload;
                pinnedSet = new Set(ev.data.pinned || []);
                currentMode = ev.data.mode || 'detailed';
                isOff = false;
                render();
            } else if (ev.data?.type === 'disconnected') { isOff = true; offReason = ev.data.reason; render(); }
        });
        // Tick only the countdown text; a full re-render every second would steal focus from the pin buttons.
        setInterval(() => {
            document.querySelectorAll('.countdown').forEach(el => { el.textContent = formatCountdown(el.getAttribute('data-reset')); });
        }, 1000);
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    return randomBytes(16).toString('hex');
}
