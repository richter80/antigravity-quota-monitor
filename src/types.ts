export type StatusBarMode = 'compact' | 'detailed';

export interface QuotaBucket {
    bucketId: string;
    displayName: string;
    window: 'weekly' | '5h' | string;
    remainingFraction: number;
    percent: number; // 0 to 100
    resetTime: string;
    disabled?: boolean;
    description?: string;
}

export interface QuotaGroup {
    displayName: string;
    description: string;
    buckets: QuotaBucket[];
}

export interface ModelQuota {
    name: string;
    quotaPercent: number;
    resetTime: string;
    notice?: string;
}

export interface QuotaPayload {
    groups?: QuotaGroup[];
    models: ModelQuota[];
    timestamp: string;
    isLive?: boolean;
    planName?: string;
    accountEmail?: string;
}

export function isValidQuotaPayload(data: unknown): data is QuotaPayload {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.models) || obj.models.length === 0) return false;
    for (const m of obj.models) {
        if (!m || typeof m !== 'object') return false;
        if (typeof (m as any).name !== 'string' || typeof (m as any).quotaPercent !== 'number') {
            return false;
        }
    }
    if (obj.groups !== undefined) {
        if (!Array.isArray(obj.groups)) return false;
        for (const g of obj.groups as any[]) {
            if (!g || typeof g.displayName !== 'string' || !Array.isArray(g.buckets)) return false;
            for (const b of g.buckets) {
                if (!b || typeof b.percent !== 'number' || typeof b.resetTime !== 'string') return false;
            }
        }
    }
    return true;
}

export function formatResetTime(isoTime: string): string {
    const diffMs = new Date(isoTime).getTime() - Date.now();
    if (diffMs <= 0) return 'Resetting now';
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `Resets in: ${days}d ${hours}h`;
    if (hours > 0) return `Resets in: ${hours}h ${minutes}m`;
    return `Resets in: ${minutes}m`;
}
