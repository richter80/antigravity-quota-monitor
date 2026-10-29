import * as vscode from 'vscode';
import { QuotaPayload, StatusBarMode, formatResetTime } from './types';

export class QuotaStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'quota-monitor.openMenu';
        this.setDisconnected('Searching for Antigravity service...');
        this.item.show();
    }

    public update(payload: QuotaPayload, pinnedModels: Set<string>, mode: StatusBarMode = 'detailed'): void {
        if (!payload || (!payload.groups && (!payload.models || payload.models.length === 0))) {
            this.setDisconnected('No quota groups available');
            return;
        }

        const itemsToDisplay = payload.models.filter(m => pinnedModels.has(m.name));
        const displayList = itemsToDisplay.length > 0 ? itemsToDisplay : payload.models.slice(0, 3);
        if (displayList.length === 0) {
            this.setDisconnected('No quota data available');
            return;
        }

        const minPercent = Math.min(...displayList.map(m => m.quotaPercent));
        const lowestItem = displayList.reduce((prev, curr) => curr.quotaPercent < prev.quotaPercent ? curr : prev, displayList[0]);

        if (mode === 'compact') {
            const shortName = this.formatShortName(lowestItem.name);
            const warnIcon = lowestItem.quotaPercent <= 10 ? '⚠️ ' : '';
            this.item.text = `$(hubot) ${warnIcon}${shortName}${lowestItem.quotaPercent.toFixed(0)}%`;
        } else {
            const textParts = displayList.map(m => `${this.formatShortName(m.name)}${m.quotaPercent.toFixed(1)}%`);
            this.item.text = `$(hubot) ${textParts.join(' | ')}`;
        }

        if (minPercent <= 10) {
            this.item.color = new vscode.ThemeColor('errorForeground');
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (minPercent <= 25) {
            this.item.color = new vscode.ThemeColor('editorWarning.foreground');
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.item.color = undefined;
            this.item.backgroundColor = undefined;
        }

        const md = new vscode.MarkdownString();
        // Only our own command links may run; daemon-supplied strings go through appendText (escaped).
        md.isTrusted = { enabledCommands: ['quota-monitor.openMenu', 'quota-monitor.focusSidebar', 'quota-monitor.toggleCompactMode'] };
        md.appendMarkdown('### Antigravity Quota — ');
        md.appendText(payload.isLive ? `● LIVE${payload.planName ? ` (${payload.planName})` : ''}` : '○ SIMULATED');
        md.appendMarkdown('\n\n');
        if (payload.accountEmail) {
            md.appendMarkdown('*Account: ');
            md.appendText(payload.accountEmail);
            md.appendMarkdown('*\n\n');
        }

        if (payload.groups && payload.groups.length > 0) {
            for (const g of payload.groups) {
                md.appendMarkdown('**');
                md.appendText(g.displayName);
                md.appendMarkdown('**\n\n');
                for (const b of g.buckets) {
                    const tag = b.disabled ? ' *(Disabled)*' : '';
                    const warnIcon = b.percent <= 10 ? ' ⚠️' : '';
                    md.appendMarkdown(`• ${b.window === 'weekly' ? 'Weekly' : '5-Hour'} Limit: **${b.percent.toFixed(1)}%**${warnIcon}${tag} — *${formatResetTime(b.resetTime)}*\n\n`);
                }
            }
        }

        const nextMode = mode === 'compact' ? 'Detailed' : 'Compact';
        md.appendMarkdown(`---\n[Open Menu](command:quota-monitor.openMenu)  |  [Open Sidebar](command:quota-monitor.focusSidebar)  |  [Switch to ${nextMode} Mode](command:quota-monitor.toggleCompactMode)`);
        this.item.tooltip = md;
    }

    private formatShortName(name: string): string {
        return name
            .replace('Gemini 4 Argon (Weekly)', 'Argon: ')
            .replace('Gemini Models (Weekly)', 'Gemini [Wk]: ')
            .replace('Gemini Models (5-Hour)', 'Gemini [5h]: ')
            .replace('Claude and GPT models (Weekly)', 'Claude/GPT [Wk]: ')
            .replace('Claude and GPT models (5-Hour)', 'Claude/GPT [5h]: ');
    }

    public setDisconnected(reason = 'Antigravity daemon not detected'): void {
        this.item.text = '$(warning) Quota: No Data';
        this.item.color = new vscode.ThemeColor('editorWarning.foreground');
        this.item.backgroundColor = undefined;
        this.item.tooltip = `⚠️ ${reason}.\n\nClick to retry connection.`;
    }

    public dispose(): void {
        this.item.dispose();
    }
}
