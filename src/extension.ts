import * as vscode from 'vscode';
import { QuotaStatusBar } from './statusBar';
import { QuotaSidebarProvider } from './sidebarProvider';
import { showQuotaQuickPick } from './quickPick';
import { QuotaPayload, StatusBarMode, isValidQuotaPayload } from './types';
import { discoverAntigravityEndpoint, fetchLiveQuota, AntigravityEndpoint } from './liveDiscovery';

const WORKSPACE_STATE_KEY = 'quota-monitor.lastQuotaState';
const PINNED_MODELS_KEY = 'quota-monitor.pinnedModels';
const STATUS_BAR_MODE_KEY = 'quota-monitor.statusBarMode';

let statusBar: QuotaStatusBar | null = null;
let sidebarProvider: QuotaSidebarProvider | null = null;
let outputChannel: vscode.OutputChannel | null = null;
let currentPayload: QuotaPayload | null = null;
let currentEndpoint: AntigravityEndpoint | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let statusBarMode: StatusBarMode = 'detailed';
let pinnedModels = new Set<string>([
    'Gemini 4 Argon (Weekly)',
    'Claude and GPT models (Weekly)',
    'Gemini Models (5-Hour)'
]);

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Antigravity Quota');
    outputChannel.appendLine('Antigravity Quota extension activating...');

    const savedPinned = context.workspaceState.get<string[]>(PINNED_MODELS_KEY);
    if (savedPinned && savedPinned.length > 0) pinnedModels = new Set(savedPinned);

    statusBarMode = context.workspaceState.get<StatusBarMode>(STATUS_BAR_MODE_KEY, 'detailed');

    statusBar = new QuotaStatusBar();
    context.subscriptions.push(statusBar);

    sidebarProvider = new QuotaSidebarProvider(context.extensionUri);
    sidebarProvider.onTogglePin = (name) => togglePin(name, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(QuotaSidebarProvider.viewType, sidebarProvider)
    );

    const savedState = context.workspaceState.get<unknown>(WORKSPACE_STATE_KEY);
    if (savedState && isValidQuotaPayload(savedState)) {
        currentPayload = savedState;
        statusBar.update(savedState, pinnedModels, statusBarMode);
        sidebarProvider.updateQuota(savedState, pinnedModels, statusBarMode);
    } else {
        statusBar.setDisconnected('Searching for Antigravity service...');
        sidebarProvider.setDisconnected('Searching for Antigravity service...');
    }

    registerCommands(context);
    startLiveSync(context);
    outputChannel.appendLine('Antigravity Quota extension activated successfully.');
}

let syncInFlight: Promise<void> | null = null;

// Poll timer and manual refresh share one in-flight sync instead of racing each other.
function syncQuota(context: vscode.ExtensionContext): Promise<void> {
    if (!syncInFlight) syncInFlight = doSyncQuota(context).finally(() => { syncInFlight = null; });
    return syncInFlight;
}

async function doSyncQuota(context: vscode.ExtensionContext): Promise<void> {
    try {
        if (!currentEndpoint) {
            outputChannel?.appendLine('[Discovery] Scanning for Antigravity daemon...');
            currentEndpoint = await discoverAntigravityEndpoint();
        }

        if (!currentEndpoint) {
            outputChannel?.appendLine('[Discovery] Antigravity daemon not found.');
            statusBar?.setDisconnected('Antigravity IDE daemon not detected');
            sidebarProvider?.setDisconnected('Could not locate active Antigravity daemon on 127.0.0.1. Ensure Antigravity IDE is running.');
            return;
        }

        const payload = await fetchLiveQuota(currentEndpoint);
        checkAlerts(currentPayload, payload);

        currentPayload = payload;
        statusBar?.update(payload, pinnedModels, statusBarMode);
        sidebarProvider?.updateQuota(payload, pinnedModels, statusBarMode);
        context.workspaceState.update(WORKSPACE_STATE_KEY, payload);
    } catch (err: any) {
        outputChannel?.appendLine(`[Sync Error] ${err?.message}`);
        currentEndpoint = null;
        statusBar?.setDisconnected('Connection lost to Antigravity daemon');
        sidebarProvider?.setDisconnected('Connection lost to Antigravity daemon: ' + err?.message);
    }
}

function checkAlerts(prev: QuotaPayload | null, next: QuotaPayload): void {
    if (!prev?.groups || !next.groups) return;
    for (const nextGroup of next.groups) {
        const prevGroup = prev.groups.find(g => g.displayName === nextGroup.displayName);
        if (!prevGroup) continue;

        for (const nextBucket of nextGroup.buckets) {
            const prevBucket = prevGroup.buckets.find(b => b.bucketId === nextBucket.bucketId);
            if (!prevBucket) continue;

            const windowName = nextBucket.window === 'weekly' ? 'Weekly' : '5-Hour';
            // Alert 1: Restored quota (was <= 10%, now >= 50%)
            if (prevBucket.percent <= 10 && nextBucket.percent >= 50) {
                vscode.window.showInformationMessage(`🎉 ${nextGroup.displayName} ${windowName} quota has been refreshed (${nextBucket.percent.toFixed(0)}% left)!`);
            }
            // Alert 2: Low quota warning (dropped from > 10% to <= 10%)
            else if (prevBucket.percent > 10 && nextBucket.percent <= 10) {
                vscode.window.showWarningMessage(`⚠️ ${nextGroup.displayName} ${windowName} quota is critically low (${nextBucket.percent.toFixed(0)}% left)!`);
            }
        }
    }
}

function startLiveSync(context: vscode.ExtensionContext): void {
    syncQuota(context);
    pollTimer = setInterval(() => syncQuota(context), 60000);
}

function togglePin(name: string, context: vscode.ExtensionContext): void {
    if (pinnedModels.has(name)) {
        if (pinnedModels.size > 1) pinnedModels.delete(name);
        else vscode.window.showInformationMessage('Keep at least 1 limit pinned to the status bar.');
    } else {
        pinnedModels.add(name);
    }
    context.workspaceState.update(PINNED_MODELS_KEY, Array.from(pinnedModels));
    if (currentPayload) {
        statusBar?.update(currentPayload, pinnedModels, statusBarMode);
        sidebarProvider?.updateQuota(currentPayload, pinnedModels, statusBarMode);
    }
}

function toggleMode(context: vscode.ExtensionContext): void {
    statusBarMode = statusBarMode === 'compact' ? 'detailed' : 'compact';
    context.workspaceState.update(STATUS_BAR_MODE_KEY, statusBarMode);
    vscode.window.showInformationMessage(`Status Bar switched to ${statusBarMode.toUpperCase()} mode.`);
    if (currentPayload) {
        statusBar?.update(currentPayload, pinnedModels, statusBarMode);
        sidebarProvider?.updateQuota(currentPayload, pinnedModels, statusBarMode);
    }
}

function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('quota-monitor.openMenu', () => {
            if (currentPayload) showQuotaQuickPick(currentPayload, pinnedModels, statusBarMode, (n) => togglePin(n, context));
            else vscode.window.showWarningMessage('No Antigravity quota data available. Make sure Antigravity is open and refresh.');
        }),
        vscode.commands.registerCommand('quota-monitor.toggleCompactMode', () => toggleMode(context)),
        vscode.commands.registerCommand('quota-monitor.refreshQuota', async () => {
            await syncInFlight; // let a running poll finish so the forced rediscovery below isn't skipped
            currentEndpoint = null;
            vscode.window.showInformationMessage('Discovering Antigravity and refreshing quota...');
            await syncQuota(context);
        }),
        vscode.commands.registerCommand('quota-monitor.focusSidebar', () => {
            vscode.commands.executeCommand('quota-monitor.sidebarView.focus');
        }),
        outputChannel!
    );
}

export function deactivate() {
    if (pollTimer) clearInterval(pollTimer);
    statusBar?.dispose();
    statusBar = null;
    sidebarProvider = null;
    outputChannel?.dispose();
    outputChannel = null;
}
