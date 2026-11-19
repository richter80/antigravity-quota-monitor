const assert = require('assert');
const { isValidQuotaPayload, formatResetTime } = require('../out/types.js');

console.log('Testing Frontier Validation for Antigravity Quota Payloads...');

const validPayload = {
    models: [
        {
            name: 'Claude Sonnet 4.5',
            quotaPercent: 95.6,
            resetTime: new Date(Date.now() + 3600000).toISOString(),
            usedTokens: 4200
        },
        {
            name: 'Gemini 3 Pro (High)',
            quotaPercent: 100.0,
            resetTime: new Date(Date.now() + 7200000).toISOString(),
            usedTokens: 150
        }
    ],
    promptCredits: { used: 500, total: 50000, percent: 1.0 },
    timestamp: new Date().toISOString()
};

assert.strictEqual(isValidQuotaPayload(validPayload), true, 'Valid payload must pass');
assert.strictEqual(isValidQuotaPayload(null), false, 'null must be rejected');
assert.strictEqual(isValidQuotaPayload({ models: [] }), false, 'empty models must be rejected');
assert.strictEqual(isValidQuotaPayload({ models: [{ name: 123 }] }), false, 'invalid model must be rejected');

const withGroups = (groups) => ({ ...validPayload, groups });
assert.strictEqual(isValidQuotaPayload(withGroups([{ displayName: 'G', buckets: [{ percent: 50, resetTime: 'x' }] }])), true, 'valid groups must pass');
assert.strictEqual(isValidQuotaPayload(withGroups('nope')), false, 'non-array groups must be rejected');
assert.strictEqual(isValidQuotaPayload(withGroups([{ displayName: 'G', buckets: [{ percent: '50' }] }])), false, 'bucket with non-numeric percent must be rejected');

const { parseEndpoint } = require('../out/liveDiscovery.js');
const twoProcs = 'agy.exe --hub-port=1111\r\nagy.exe --hub-port=2222 --csrf_token=tok-2\r\n';
assert.deepStrictEqual(parseEndpoint(twoProcs), { port: 2222, token: 'tok-2' }, 'port and token must come from the same process');
assert.strictEqual(parseEndpoint('agy.exe --csrf_token=a\nagy.exe --hub-port=1'), null, 'split port/token across processes must not pair');
assert.deepStrictEqual(parseEndpoint('"C:\\Program Files\\Antigravity\\agy.exe" --hub-port=3 --csrf_token=w'), { port: 3, token: 'w' }, 'quoted Windows path');
assert.deepStrictEqual(
    parseEndpoint('/usr/bin/bash\n/Applications/Antigravity.app/Contents/Resources/bin/language_server --hub-port=4 --csrf_token=m'),
    { port: 4, token: 'm' }, 'macOS app-bundle process');
assert.deepStrictEqual(parseEndpoint('/opt/agy/bin/agy-server --hub-port=5 --csrf_token=l'), { port: 5, token: 'l' }, 'Linux agy binary');
assert.strictEqual(parseEndpoint('/usr/bin/other-tool --hub-port=6 --csrf_token=x'), null, 'non-Antigravity processes are ignored');

assert.strictEqual(isValidQuotaPayload({ ...validPayload, modelLimits: [{ name: 'X', quotaPercent: 5 }] }), false, 'modelLimits entry without resetTime must be rejected');

const { parseModelLimits } = require('../out/liveDiscovery.js');
const limits = parseModelLimits([
    { label: 'Gemini 4 Neon (High)', quotaInfo: { remainingFraction: 0.8, resetTime: 'r1' } },
    { label: 'Gemini 4 Neon (Low)', quotaInfo: { remainingFraction: 0.5, resetTime: 'r1' } },
    { label: 'Orchestrator (Neon)', quotaInfo: { remainingFraction: 1, resetTime: 'r2' } },
    { label: 'Claude Opus 5.5 (Medium)', quotaInfo: { resetTime: 'r3' } },
    { label: 'Gemini 4 Carbon', quotaInfo: {}, disabled: true }
]);
assert.deepStrictEqual(limits, [
    { name: 'Gemini 4 Neon', quotaPercent: 50, resetTime: 'r1' },
    { name: 'Orchestrator (Neon)', quotaPercent: 100, resetTime: 'r2' },
    { name: 'Claude Opus 5.5', quotaPercent: 0, resetTime: 'r3' }
], 'effort variants collapse to lowest, omitted fraction = 0, unavailable skipped');
assert.deepStrictEqual(parseModelLimits(undefined), [], 'missing model list');

const formatted = formatResetTime(new Date(Date.now() + 3600000 + 60000).toISOString());
assert(formatted.startsWith('Resets in:'), 'formatResetTime should format future time');

console.log('✓ All Antigravity Quota validation tests passed!');
