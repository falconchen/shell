/**
 * 功能：在模拟的 Quantumult X 运行时执行菜单脚本，核对新增菜单项的字节、视频编号来源和各种放行情况。
 * 更新时间：2026-10-06
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const source = fs.readFileSync(new URL('../YouTubeDownloadMenu.js', import.meta.url), 'utf8');
const post = fs.readFileSync(new URL('../YouTubeDownloadPost.js', import.meta.url), 'utf8');
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
const openUrl = (id, type = 'video') => 'http://192.168.6.7:5100/?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&type=' + type;
const item = (id, name, icon, type) => msg(1, msg(66441108, cat(label(name), msg(2, cat([8], v(icon))), msg(3, msg(49679253, cat(msg(1, text(openUrl(id, type))), [16, 1]))))));
const added = id => cat(item(id, '下载视频', 658, 'video'), item(id, '下载音频', 21, 'audio'));
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

test('snippet binds browse responses and the generated download address to the standalone scripts', () => {
  const rules = snippet.split('\n').filter(line => line && !line.startsWith('#') && !line.startsWith('hostname'));
  assert.equal(rules.length, 2);
  const [pattern, url, type, path] = rules[0].split(' ');
  assert.deepEqual([url, type, path], ['url', 'script-response-body', 'https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTubeDownload/YouTubeDownloadMenu.js']);
  assert.ok(new RegExp(pattern).test('https://youtubei.googleapis.com/youtubei/v1/browse?prettyPrint=false'));
  for (const name of ['next', 'player', 'get_watch', 'browse/extra']) assert.ok(!new RegExp(pattern).test('https://youtubei.googleapis.com/youtubei/v1/' + name));
});

for (const [name, wrap] of [['continuation', continuation], ['initial home', home]]) test(`${name} list gets both download items prepended, loses the native download item, and nothing else changes`, () => {
  const items = (id, native = true) => [service('不感兴趣'), ...(native ? [save(id)] : []), service('举报')];
  const before = wrap(cat(divider, card(tap('AAAAAAAAAAA'), menu(...items('AAAAAAAAAAA')), msg(45, text('ai_summary_AAAAAAAAAAA'))), divider, card(tap('BBBB-BBB_BB'), menu(...items('BBBB-BBB_BB')))));
  const after = wrap(cat(divider, card(tap('AAAAAAAAAAA'), menu(added('AAAAAAAAAAA'), ...items('AAAAAAAAAAA', false)), msg(45, text('ai_summary_AAAAAAAAAAA'))), divider, card(tap('BBBB-BBB_BB'), menu(added('BBBB-BBB_BB'), ...items('BBBB-BBB_BB', false)))));
  const result = run(before);
  assert.deepEqual(bytes(result), Buffer.from(after));
  assert.deepEqual(result.logs, ['[YouTubeDownloadMenu 0.4.0] browse added=2 removed_native=2']);
  // 已含同名条目的菜单不重复添加。
  untouched(run(after));
});

test('video id falls back to the menu save command and invalid ids leave the card untouched', () => {
  const result = run(continuation(card(menu(save('CCCCCCCCCCC')))));
  assert.deepEqual(bytes(result), Buffer.from(continuation(card(menu(added('CCCCCCCCCCC'))))));
  // 只有命令为 73080600 的服务条目被移除；同一命令编号出现在其他类型的条目里时保留。
  const other = msg(1, msg(66441108, cat(label('导航项'), msg(3, msg(73080600, msg(1, text('EEEEEEEEEEE')))))));
  assert.deepEqual(bytes(run(continuation(card(tap('EEEEEEEEEEE'), menu(other, save('EEEEEEEEEEE'), service('举报')))))), Buffer.from(continuation(card(tap('EEEEEEEEEEE'), menu(added('EEEEEEEEEEE'), other, service('举报'))))));
  untouched(run(continuation(card(menu(service('举报'))))));
  untouched(run(continuation(card(tap('too-short'), menu(service('举报'))))));
  untouched(run(continuation(card(tap('AAAA AAAAAA'), menu(service('举报'))))));
  untouched(run(continuation(card(tap('AAAAAAAAAAA'), msg(5, nested([169495254, 98150882, 1, 66439850], msg(4, text('EMPTY-MENU'))))))));
  untouched(run(continuation(cat(divider, divider))));
  // App 自带的同名条目不影响添加，判断依据是条目是否指向下载站。
  assert.deepEqual(bytes(run(continuation(card(tap('DDDDDDDDDDD'), menu(service('下载视频')))))), Buffer.from(continuation(card(tap('DDDDDDDDDDD'), menu(added('DDDDDDDDDDD'), service('下载视频'))))));
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

/**
 * 功能：以 script-echo-response 的形式运行提交脚本，并记录它发出的请求。
 * 更新时间：2026-10-06
 * @param {string} url 请求地址。
 * @param {Object} [options] 请求头、下载站的应答，或不提供 $task。
 * @returns {Promise<{output:Object, sent:Array<Object>, logs:Array<string>}>} 脚本返回的响应、发出的请求和日志。
 */
function runPost(url, {headers = {}, reply = {statusCode:200, headers:{'Content-Type':'text/html; charset=utf-8'}, body:'<p>TASK-PAGE</p>'}, task = true} = {}) {
  return new Promise(resolve => {
    const sent = [], logs = [];
    const context = {console:{log:value => logs.push(value)}, $request:{url, method:'GET', headers}, $done(output) {resolve({output, sent, logs});}};
    if (task) context.$task = {fetch(request) {sent.push(JSON.parse(JSON.stringify(request))); return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);}};
    vm.runInNewContext(post, context, {timeout:2000});
  });
}

test('generated address is matched by the echo rule and posted to the site by the script', async () => {
  const rule = snippet.split('\n').filter(line => line.includes('script-echo-response'));
  assert.equal(rule.length, 1);
  const [pattern, url, type, path] = rule[0].split(' ');
  assert.deepEqual([url, type, path], ['url', 'script-echo-response', 'https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/YouTubeDownload/YouTubeDownloadPost.js']);
  const regex = new RegExp(pattern);
  for (const kind of ['video', 'audio']) {
    assert.ok(regex.test(openUrl('mfJqH4kc2oQ', kind)));
    const {output, sent, logs} = await runPost(openUrl('mfJqH4kc2oQ', kind), {headers:{cookie:'session=KEEP'}});
    assert.deepEqual(sent, [{url:'http://192.168.6.7:5100/', method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded', Cookie:'session=KEEP'},
      body:`url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DmfJqH4kc2oQ&type=${kind}`, opts:{redirection:false}}]);
    assert.deepEqual(JSON.parse(JSON.stringify(output)), {status:'HTTP/1.1 200 OK', headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}, body:'<p>TASK-PAGE</p>'});
    assert.ok(!output.body.includes('<form'));
    assert.deepEqual(logs, [`[YouTubeDownloadPost 0.3.0] posted type=${kind} status=200`]);
  }
});

test('site redirects and cookies are handed to the browser, and failures fall back to a manual form', async () => {
  const redirect = await runPost(openUrl('mfJqH4kc2oQ'), {reply:{statusCode:302, headers:{location:'/task/abc', 'set-cookie':'sid=1; Path=/'}, body:''}});
  assert.equal(redirect.sent[0].headers.Cookie, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(redirect.output)), {status:'HTTP/1.1 302 Found', headers:{'Content-Type':'text/html; charset=utf-8', Location:'/task/abc', 'Set-Cookie':'sid=1; Path=/', 'Cache-Control':'no-store'}, body:''});
  for (const options of [{reply:new Error('offline')}, {task:false}]) {
    const {output} = await runPost(openUrl('mfJqH4kc2oQ', 'audio'), options);
    assert.equal(output.status, 'HTTP/1.1 502 Bad Gateway');
    assert.ok(output.body.includes('<form method="post" action="http://192.168.6.7:5100/">'));
    assert.ok(output.body.includes('<input type="hidden" name="url" value="https://www.youtube.com/watch?v=mfJqH4kc2oQ">'));
    assert.ok(output.body.includes('<input type="hidden" name="type" value="audio">'));
    assert.ok(!output.body.includes('submit()'));
  }
});

test('other addresses are neither matched by the rule nor submitted', async () => {
  const regex = new RegExp(snippet.split('\n').find(line => line.includes('script-echo-response')).split(' ')[0]);
  // 下载站首页和表单提交的目标地址不被规则匹配，不会循环。
  for (const other of ['http://192.168.6.7:5100/', 'http://192.168.6.7:5100/?url=', 'http://192.168.6.7:5100/?url=https%3A%2F%2Fevil.example%2F&type=video',
    openUrl('mfJqH4kc2oQ') + '&x=1', openUrl('short'), openUrl('mfJqH4kc2oQ', 'other'), 'http://192.168.6.70:5100/?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DmfJqH4kc2oQ&type=video',
    'https://192.168.6.7:5100/?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DmfJqH4kc2oQ&type=video']) {
    assert.ok(!regex.test(other), other);
    const {output, sent} = await runPost(other);
    assert.equal(output.status, 'HTTP/1.1 400 Bad Request');
    assert.deepEqual(sent, []);
    assert.ok(!output.body.includes('<form') && !output.body.includes('evil'));
  }
});
