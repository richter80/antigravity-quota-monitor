import { execFile } from 'child_process';
import * as http from 'http';
import { QuotaPayload, QuotaGroup } from './types';

export interface AntigravityEndpoint {
    port: number;
    token: string;
}

// Executable part of a command line (before the first flag) belongs to Antigravity:
// an `agy*` binary, or anything installed under an Antigravity app/folder (e.g. /Applications/Antigravity.app).
export function isAntigravityCommandLine(line: string): boolean {
    const exe = line.split(/\s--/)[0].trim().replace(/^"|"$/g, '');
    return /antigravity/i.test(exe) || /(^|[\\/])agy[^\\/]*$/i.test(exe);
}

// Port and token must come from the same process command line (one per output line).
export function parseEndpoint(output: string): AntigravityEndpoint | null {
    for (const line of output.split(/\r?\n/)) {
        if (!isAntigravityCommandLine(line)) continue;
        const portMatch = line.match(/--hub-port=(\d+)/);
        const tokenMatch = line.match(/--csrf_token=([a-zA-Z0-9_-]+)/);
        if (portMatch && tokenMatch) return { port: parseInt(portMatch[1], 10), token: tokenMatch[1] };
    }
    return null;
}

export function discoverAntigravityEndpoint(): Promise<AntigravityEndpoint | null> {
    // Windows: process names are filtered by WMI. macOS/Linux: list every command line and let parseEndpoint filter.
    const [file, args] = process.platform === 'win32'
        ? ['powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name LIKE 'agy%'" | Select-Object -ExpandProperty CommandLine`]]
        : ['ps', ['-axww', '-o', 'command=']];
    return new Promise((resolve) => {
        execFile(file, args, { timeout: 4000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
            resolve(!err && stdout ? parseEndpoint(stdout) : null);
        });
    });
}

function rpcCall(endpoint: AntigravityEndpoint, path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: endpoint.port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': endpoint.token
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const status = res.statusCode ?? 0;
                if (status < 200 || status >= 300) return reject(new Error(`RPC ${path} failed with HTTP ${status}`));
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`RPC ${path} returned invalid JSON`)); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('RPC timeout')); });
        req.write('{}');
        req.end();
    });
}

export async function fetchLiveQuota(endpoint: AntigravityEndpoint): Promise<QuotaPayload> {
    const [summaryRes, statusRes] = await Promise.allSettled([
        rpcCall(endpoint, '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary'),
        rpcCall(endpoint, '/exa.language_server_pb.LanguageServerService/GetUserStatus')
    ]);

    // Quota groups come only from the summary call; without it there's nothing to show, so surface the error
    // (lets syncQuota reset the endpoint and rediscover, e.g. after the daemon restarts on a new port).
    if (summaryRes.status === 'rejected') throw summaryRes.reason;
    const summaryData = summaryRes.value?.response;
    const statusData = statusRes.status === 'fulfilled' ? statusRes.value?.userStatus : null;

    const rawGroups = summaryData?.groups || [];
    const groups: QuotaGroup[] = rawGroups.map((g: any) => ({
        displayName: g.displayName || 'Model Group',
        description: g.description || '',
        buckets: (g.buckets || []).map((b: any) => ({
            bucketId: b.bucketId || '',
            displayName: b.displayName || b.window || 'Limit',
            window: b.window || '',
            remainingFraction: b.remainingFraction ?? 1,
            percent: Math.round((b.remainingFraction ?? 1) * 1000) / 10,
            resetTime: b.resetTime || new Date().toISOString(),
            disabled: b.disabled ?? false,
            description: b.description || ''
        }))
    }));

    // Synthesize model quotas from groups for backward compatibility & pinned views
    const models = groups.flatMap(g => g.buckets.map(b => ({
        name: `${g.displayName} (${b.window === 'weekly' ? 'Weekly' : '5-Hour'})`,
        quotaPercent: b.percent,
        resetTime: b.resetTime,
        notice: b.disabled ? 'Disabled' : undefined
    })));

    const planName = statusData?.userTier?.name || statusData?.planStatus?.planInfo?.planName || undefined;
    const email = statusData?.email || '';

    return {
        groups,
        models,
        timestamp: new Date().toISOString(),
        isLive: true,
        planName,
        accountEmail: email
    };
}
