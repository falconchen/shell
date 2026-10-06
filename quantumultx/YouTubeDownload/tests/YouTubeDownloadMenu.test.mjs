/**
 * 功能：在模拟的 Quantumult X 运行时执行菜单脚本，核对新增菜单项的字节、视频编号来源和各种放行情况。
 * 更新时间：2026-10-06
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source = fs.readFileSync(new URL('../YouTubeDownloadMenu.js', import.meta.url), 'utf8');
const snippet = fs.readFileSync(new URL('../YouTubeDownloadMenu.snippet', import.meta.url), 'utf8');
const v = n => {const a = []; while (n >= 128) {a.push(n % 128 + 128); n = Math.floor(n / 128);} return [...a, n];};
const cat = (...parts) => Uint8Array.from(parts.flatMap(part => Array.from(part)));
const msg = (field, payload) => cat(v(field * 8 + 2), v(payload.length), payload);
const text = value => new TextEncoder().encode(value);
const nested = (path, payload) => path.reduceRight((body, field) => msg(field, body), payload);
const label = value => msg(1, msg(1, msg(1, text(value))));
const service = (name, endpoint = []) => msg(1, msg(66441155, cat(label(name), msg(2, [8, 52]), msg(3, endpoint))));
const save = id => service('立即保存', msg(73080600, msg(1, text(id))));
const tap = id => msg(4, nested([169495254, 462702848, 1, 200453700, 1, 48687757], cat(msg(1, text(id)), [16, 1])));
const menu = (...items) => msg(5, nested([169495254, 98150882, 1, 66439850], cat(...items, msg(4, text('TRACK-KEEP')))));
const card = (...parts) => msg(1, msg(50195462, cat(msg(1, nested([153515154, 172660663, 1, 168777401, 5, 232954548, 18], cat(...parts))), msg(4, [1, 2]))));
const divider = msg(1, msg(50195462, msg(1, nested([153515154, 172660663, 1, 168777401, 5, 347043917], text('DIVIDER')))));
const added = id => msg(1, msg(66441108, cat(label('从第三方下载'), msg(2, [8, 147, 1]),
  msg(3, msg(49679253, cat(msg(1, text('https://example.com/download?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id))), [16, 1]))))));
const continuation = list => cat(msg(1, text('CONTEXT-KEEP')), msg(10, msg(49399797, cat(list, msg(2, text('TOKEN-KEEP'))))), msg(777, text('REGISTRY-KEEP')));
const home = list => nested([9, 58173949, 1, 58174010, 4, 49399797], list);

/**
 * 功能：以 Quantumult X 的全局对象形式运行脚本；不提供 TextEncoder。
 * 更新时间：2026-10-06
 * @param {Uint8Array} body 响应正文。
 * @param {Object} [response] 覆盖默认响应字段。
 * @returns {{output:Object, logs:Array<string>}} 脚本结果和输出。
 */
function run(body, response = {}) {
  let output, calls = 0; const logs = [];
  vm.runInNewContext(source, {Uint8Array, ArrayBuffer, console:{log:value => logs.push(value)}, $request:{url:'https://youtubei.googleapis.com/youtubei/v1/browse'},
    $response:{statusCode:200, headers:{'Content-Type':'application/x-protobuf'}, bodyBytes:body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), ...response},
    $done(value) {output = value; calls++;}}, {timeout:2000});
  assert.equal(calls, 1);
  return {output, logs};
}
const bytes = result => Buffer.from(new Uint8Array(result.output.bodyBytes));
const untouched = result => assert.equal(Object.keys(result.output).length, 0);

test('snippet only binds browse responses to the standalone script', () => {
  const rules = snippet.split('\n').filter(line => line && !line.startsWith('#') && !line.startsWith('hostname'));
  assert.equal(rules.length, 1);
  const [pattern, url, type, path] = rules[0].split(' ');
  assert.deepEqual([url, type, path], ['url', 'script-response-body', 'https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTubeDownload/YouTubeDownloadMenu.js']);
  assert.ok(new RegExp(pattern).test('https://youtubei.googleapis.com/youtubei/v1/browse?prettyPrint=false'));
  for (const name of ['next', 'player', 'get_watch', 'browse/extra']) assert.ok(!new RegExp(pattern).test('https://youtubei.googleapis.com/youtubei/v1/' + name));
});

for (const [name, wrap] of [['continuation', continuation], ['initial home', home]]) test(`${name} list gets one item prepended to each video menu and nothing else changes`, () => {
  const items = id => [service('不感兴趣'), save(id), service('举报')];
  const before = wrap(cat(divider, card(tap('AAAAAAAAAAA'), menu(...items('AAAAAAAAAAA')), msg(45, text('ai_summary_AAAAAAAAAAA'))), divider, card(tap('BBBB-BBB_BB'), menu(...items('BBBB-BBB_BB')))));
  const after = wrap(cat(divider, card(tap('AAAAAAAAAAA'), menu(added('AAAAAAAAAAA'), ...items('AAAAAAAAAAA')), msg(45, text('ai_summary_AAAAAAAAAAA'))), divider, card(tap('BBBB-BBB_BB'), menu(added('BBBB-BBB_BB'), ...items('BBBB-BBB_BB')))));
  const result = run(before);
  assert.deepEqual(bytes(result), Buffer.from(after));
  assert.deepEqual(result.logs, ['[YouTubeDownloadMenu 0.1.2] browse added=2']);
  // 已含同名条目的菜单不重复添加。
  untouched(run(after));
});

test('video id falls back to the menu save command and invalid ids leave the card untouched', () => {
  const result = run(continuation(card(menu(save('CCCCCCCCCCC')))));
  assert.deepEqual(bytes(result), Buffer.from(continuation(card(menu(added('CCCCCCCCCCC'), save('CCCCCCCCCCC'))))));
  untouched(run(continuation(card(menu(service('举报'))))));
  untouched(run(continuation(card(tap('too-short'), menu(service('举报'))))));
  untouched(run(continuation(card(tap('AAAA AAAAAA'), menu(service('举报'))))));
  untouched(run(continuation(card(tap('AAAAAAAAAAA'), msg(5, nested([169495254, 98150882, 1, 66439850], msg(4, text('EMPTY-MENU'))))))));
  untouched(run(continuation(cat(divider, divider))));
});

test('unexpected responses pass through', () => {
  const body = continuation(card(tap('AAAAAAAAAAA'), menu(service('举报'))));
  untouched(run(body, {statusCode:403}));
  untouched(run(body, {headers:{'Content-Type':'application/json'}}));
  untouched(run(body, {bodyBytes:undefined, body:'text'}));
  untouched(run(cat([31, 139, 8, 0], body)));
  untouched(run(new Uint8Array(0)));
  const broken = run(cat(msg(10, msg(49399797, cat(card(tap('AAAAAAAAAAA'), menu(service('举报'))), [10, 9, 1])))));
  untouched(broken);
  assert.ok(broken.logs[0].includes('error:'));
});
