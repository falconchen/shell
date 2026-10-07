/**
 * 功能：在模拟的 Quantumult X 运行时执行本地存储查看器，核对只读行为、应答格式和规则匹配范围。
 * 更新时间：2026-10-07
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const root = new URL('../', import.meta.url);
const code = fs.readFileSync(new URL('PrefsViewer.js', root), 'utf8');
const snippet = fs.readFileSync(new URL('PrefsViewer.snippet', root), 'utf8');

/**
 * 功能：以给定地址和存储内容运行脚本，返回应答及存储被调用的方法名。
 * 更新时间：2026-10-07
 * @param {string} url 请求地址。
 * @param {Object} store 键值内容。
 * @returns {{output:Object, calls:Array<string>}} 脚本应答和存储调用记录。
 */
function run(url, store = {}) {
  let output, done = 0;
  const calls = [];
  const $prefs = new Proxy({}, {get: (_, name) => key => { calls.push(String(name)); return name === 'valueForKey' && Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; }});
  vm.runInNewContext(code, {$request: {url, method: 'GET', headers: {}}, $prefs, $done(value) { output = value; done++; }, JSON, String}, {timeout: 2000});
  assert.equal(done, 1);
  return {output, calls};
}

test('shows a stored value, pretty-printing JSON objects and leaving other text as is', () => {
  const {output, calls} = run('http://example.com/qx-prefs?key=Biliverse', {Biliverse: '{"Enhanced":{"Settings":{"Bottom":["home"]}}}'});
  assert.equal(output.status, 'HTTP/1.1 200 OK');
  assert.deepEqual(JSON.parse(JSON.stringify(output.headers)), {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  assert.ok(output.body.includes('键：Biliverse\n类型：JSON\n长度：45 字符\n\n{\n  "Enhanced": {'));
  assert.deepEqual(calls, ['valueForKey']);
  assert.ok(run('https://example.com/qx-prefs?key=a%20b&x=1', {'a b': 'plain <b>text</b>'}).output.body.endsWith('类型：文本\n长度：17 字符\n\nplain <b>text</b>'));
  assert.ok(run('http://example.com/qx-prefs?key=n', {n: '42'}).output.body.endsWith('类型：文本\n长度：2 字符\n\n42'));
});

test('missing key gets usage, unknown key gets 404, and the store is never written', () => {
  for (const url of ['http://example.com/qx-prefs', 'http://example.com/qx-prefs?key=', 'http://example.com/qx-prefs?key=%E0%A4%A', 'http://example.com/qx-prefs?key=' + 'k'.repeat(257)]) {
    const {output, calls} = run(url, {'': 'x'});
    assert.equal(output.status, 'HTTP/1.1 400 Bad Request');
    assert.ok(output.body.includes('?key=键名'));
    assert.deepEqual(calls, []);
  }
  const missing = run('http://example.com/qx-prefs?key=nope');
  assert.equal(missing.output.status, 'HTTP/1.1 404 Not Found');
  assert.deepEqual(missing.calls, ['valueForKey']);
  assert.ok(!/setValueForKey|removeValueForKey|\$task|fetch/.test(code));
});

test('snippet matches only the viewer path on example.com with an echo rule', () => {
  const rules = snippet.split('\n').filter(line => line && !line.startsWith('#') && !line.startsWith('hostname'));
  assert.equal(rules.length, 1);
  const [pattern, url, type, path] = rules[0].split(' ');
  assert.deepEqual([url, type, path], ['url', 'script-echo-response', 'https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/Tools/PrefsViewer.js']);
  const regex = new RegExp(pattern);
  for (const ok of ['http://example.com/qx-prefs', 'https://example.com/qx-prefs?key=Biliverse']) assert.ok(regex.test(ok));
  for (const no of ['http://example.com/', 'http://example.com/qx-prefs/x', 'http://example.org/qx-prefs?key=a', 'http://a.example.com/qx-prefs?key=a']) assert.ok(!regex.test(no));
  assert.equal(snippet.split('\n').find(line => line.startsWith('hostname = ')), 'hostname = example.com');
});
