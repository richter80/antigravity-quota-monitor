import * as vscode from 'vscode';
import { QuotaPayload, StatusBarMode, formatResetTime } from './types';

interface QuotaPickItem extends vscode.QuickPickItem {
    pinKey?: string;
    isAction?: boolean;
    actionCommand?: string;
}

export function makeProgressBar(percent: number, length = 10): string {
    const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export async function showQuotaQuickPick(
    payload: QuotaPayload,
    pinnedModels: Set<string>,
    mode: StatusBarMode,
    onTogglePin: (name: string) => void
): Promise<void> {
    const items: QuotaPickItem[] = [];

    if (payload.groups && payload.groups.length > 0) {
        for (const g of payload.groups) {
            items.push({ label: g.displayName.toUpperCase(), kind: vscode.QuickPickItemKind.Separator });

            for (const b of g.buckets) {
                const fullName = `${g.displayName} (${b.window === 'weekly' ? 'Weekly' : '5-Hour'})`;
                const isPinned = pinnedModels.has(fullName);
                const icon = isPinned ? '$(check)' : '$(circle-outline)';
                const bar = makeProgressBar(b.percent, 8);
                const resetText = formatResetTime(b.resetTime);
                const disabledText = b.disabled ? ' [Disabled]' : '';

                items.push({
                    label: `${icon} ${b.window === 'weekly' ? 'Weekly limit' : '5-hour limit'}${disabledText}`,
                    description: `${bar} ${b.percent.toFixed(1)}% left`,
                    detail: `${resetText}   •   ${g.displayName}`,
                    pinKey: fullName
                });
            }
        }
    }

    items.push({ label: 'DISPLAY & SETTINGS', kind: vscode.QuickPickItemKind.Separator });
    const nextMode = mode === 'compact' ? 'Detailed' : 'Compact';
    items.push({
        label: `$(layout-statusbar) Switch to ${nextMode} Status Bar Mode`,
        description: `Currently ${mode}`,
        isAction: true,
        actionCommand: 'quota-monitor.toggleCompactMode'
    });
    items.push({
        label: '$(layout-sidebar-right) Open Detailed Sidebar Dashboard',
        isAction: true,
        actionCommand: 'quota-monitor.focusSidebar'
    });
    items.push({
        label: '$(refresh) Refresh Antigravity Quota Now',
        isAction: true,
        actionCommand: 'quota-monitor.refreshQuota'
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: payload.planName ? `Antigravity Quota (${payload.planName})` : 'Antigravity Quota',
        placeHolder: 'Click any limit window to toggle visibility in status bar',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) return;

    if (selected.isAction && selected.actionCommand) {
        vscode.commands.executeCommand(selected.actionCommand);
    } else if (selected.pinKey) {
        onTogglePin(selected.pinKey);
    }
}
