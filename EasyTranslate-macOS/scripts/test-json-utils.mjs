import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonSmart } from '../src/json-page/json-utils.js';
import { formatLooseText } from '../src/lib/json.js';

test('smart JSON formatting preserves nested JSON string fields', () => {
  const payload = {
    apiCode: '101',
    orgNo: '8260700195',
    reqNo: 'PROD0446REQ20260710140551',
    data: JSON.stringify({
      custNo: '26070700000174',
      orgOrderNo: 'PROD0446ORD20260710140551',
      countryCode: 'IN',
      currency: 'INR',
      payAmount: 10000,
      transType: '0446'
    }),
    sign: '287D3654F8AC3C759AA8F887321F12BD'
  };

  const parsed = parseJsonSmart(JSON.stringify(payload, null, 2));
  assert.equal(parsed.success, true);

  const formatted = JSON.stringify(parsed.value, null, 2);
  const reparsed = JSON.parse(formatted);
  assert.equal(typeof reparsed.data, 'string');
  assert.equal(JSON.parse(reparsed.data).custNo, '26070700000174');
});

test('smart JSON formatting unwraps a top-level escaped JSON string', () => {
  const parsed = parseJsonSmart(JSON.stringify('{"ok":true,"list":[1,2]}'));
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.value, { ok: true, list: [1, 2] });
  assert.equal(parsed.unescaped, true);
});

test('loose formatter makes invalid JSON-like text readable', () => {
  const input = 'apiCode:101, orgNo:8260700195, data:{custNo:2607,currency:INR}';
  const formatted = formatLooseText(input, 2);
  assert.equal(formatted.success, true);
  assert.equal(formatted.loose, true);
  assert.match(formatted.result, /apiCode: 101,/);
  assert.match(formatted.result, /\n  custNo: 2607,/);
  assert.match(formatted.result, /\n}/);
});
