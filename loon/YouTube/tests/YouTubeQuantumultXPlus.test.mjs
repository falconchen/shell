/**
 * 功能：核对 Quantumult X 合并版：首页响应的结果等于“先去广告、再加下载菜单”，其余接口与去广告版一致。
 * 更新时间：2026-10-06
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const base = new URL('../../../quantumultx/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, base), 'utf8');
const plus = read('YouTubePlus/dist/response.min.js'), noAds = read('YouTube/dist/response.min.js'), menuOnly = read('YouTubeDownload/YouTubeDownloadMenu.js');
const api = 'https://youtubei.googleapis.com/youtubei/v1/';
const v = n => {const a = []; while (n >= 128) {a.push(n % 128 + 128); n = Math.floor(n / 128);} return [...a, n];};
const cat = (...parts) => Uint8Array.from(parts.flatMap(part => Array.from(part)));
const msg = (field, payload) => cat(v(field * 8 + 2), v(payload.length), payload);
const text = value => new TextEncoder().encode(value);
const nested = (path, payload) => path.reduceRight((body, field) => msg(field, body), payload);
const service = name => msg(1, msg(66441155, cat(msg(1, msg(1, msg(1, text(name)))), msg(2, [8, 52]))));
const video = id => msg(1, msg(50195462, msg(1, nested([153515154, 172660663, 1, 168777401, 5, 232954548, 18], cat(
  msg(4, nested([169495254, 462702848, 1, 200453700, 1, 48687757], msg(1, text(id)))), msg(5, nested([169495254, 98150882, 1, 66439850], service('举报'))))))));
const adSlot = msg(1, msg(424701016, [255, 1]));
const plain = msg(1, msg(50195462, msg(1, msg(99, [1, 2, 3]))));
// 字段 2 是续页数据，去广告模块在隐藏首页 Shorts 开启时会解析它，这里用不参与解析的字段 13 作为保留内容。
const continuation = (...items) => cat(msg(10, msg(49399797, cat(...items, msg(13, text('LIST-ID-KEEP'))))), msg(777, text('REGISTRY-KEEP')));
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

/**
 * 功能：以 Quantumult X 的响应脚本形式运行一份脚本。
 * 更新时间：2026-10-06
 * @param {string} code 脚本文本。
 * @param {string} name 接口名称。
 * @param {Object} response Quantumult X 响应对象。
 * @returns {{output:Object, logs:Array<string>}} 脚本结果和输出。
 */
function run(code, name, response) {
  let output, calls = 0; const logs = [];
  vm.runInNewContext(code, {Uint8Array, ArrayBuffer, console:{log:value => logs.push(value)}, $request:{url:api + name, method:'POST', headers:{}}, $response:response,
    $prefs:{valueForKey() {return null;}, setValueForKey() {return true;}, removeValueForKey() {return true;}}, $done(value) {output = value; calls++;}}, {timeout:2000});
  assert.equal(calls, 1);
  return {output, logs};
}
const proto = bytes => ({statusCode:200, headers:{'Content-Type':'application/x-protobuf'}, bodyBytes:buffer(bytes)});
const out = (result, input) => result.output.bodyBytes ? Buffer.from(new Uint8Array(result.output.bodyBytes)) : Buffer.from(input);
/**
 * 功能：分别运行去广告版和独立菜单脚本，得到合并版应有的结果。
 * 更新时间：2026-10-06
 * @param {Uint8Array} input 首页响应。
 * @returns {Buffer} 先去广告、再加菜单后的正文。
 */
function expected(input) {
  const cleaned = out(run(noAds, 'browse', proto(input)), input);
  return out(run(menuOnly, 'browse', proto(new Uint8Array(cleaned))), cleaned);
}

test('plus snippet is the ad snippet with the merged response bundle and the download echo rule', () => {
  const rules = value => read(value).split('\n').filter(line => line && !line.startsWith('#'));
  const echo = rules('YouTubeDownload/YouTubeDownloadMenu.snippet').filter(line => line.includes(' url script-echo-response '));
  assert.equal(echo.length, 1);
  assert.deepEqual(rules('YouTubePlus/YouTubePlus.snippet'),
    rules('YouTube/YouTubeNoAds.snippet').map(line => line.replace('/quantumultx/YouTube/dist/response.min.js', '/quantumultx/YouTubePlus/dist/response.min.js')).concat(echo));
  assert.equal(rules('YouTubePlus/YouTubePlus.snippet').filter(line => line.includes('/quantumultx/YouTubePlus/dist/response.min.js')).length, 1);
});

test('home response is cleaned first and then gets the download menu', () => {
  const input = continuation(video('AAAAAAAAAAA'), adSlot, plain, video('BBBBBBBBBBB'));
  const result = run(plus, 'browse', proto(input)), body = out(result, input);
  assert.deepEqual(body, expected(input));
  assert.ok(!body.includes(Buffer.from(adSlot)) && body.includes(Buffer.from(plain)));
  assert.equal(body.toString('latin1').split('192.168.6.7:5100/?url=').length - 1, 4);
  assert.ok(body.length !== out(run(noAds, 'browse', proto(input)), input).length && body.length !== out(run(menuOnly, 'browse', proto(input)), input).length);
  assert.ok(result.logs.some(line => /^\[YouTubeDownloadMenu [\d.]+\] browse added=2 removed=0$/.test(line)));
});

test('each half still works when the other has nothing to do', () => {
  const onlyMenu = continuation(video('AAAAAAAAAAA'), plain);
  assert.equal(Object.keys(run(noAds, 'browse', proto(onlyMenu)).output).length, 0);
  assert.deepEqual(out(run(plus, 'browse', proto(onlyMenu)), onlyMenu), expected(onlyMenu));
  assert.ok(run(plus, 'browse', proto(onlyMenu)).output.bodyBytes instanceof ArrayBuffer);
  const onlyAd = continuation(plain, adSlot);
  assert.deepEqual(out(run(plus, 'browse', proto(onlyAd)), onlyAd), out(run(noAds, 'browse', proto(onlyAd)), onlyAd));
  assert.ok(run(plus, 'browse', proto(onlyAd)).output.bodyBytes instanceof ArrayBuffer);
  const neither = continuation(plain);
  assert.equal(Object.keys(run(plus, 'browse', proto(neither)).output).length, 0);
  assert.equal(Object.keys(run(plus, 'browse', {...proto(onlyMenu), statusCode:403}).output).length, 0);
});

test('search response gets the download menu through the merged bundle', () => {
  const input = cat(msg(4, msg(49399797, cat(video('AAAAAAAAAAA'), plain))), msg(777, text('REGISTRY-KEEP')));
  const viaMenu = run(menuOnly, 'search', proto(input));
  assert.ok(viaMenu.output.bodyBytes instanceof ArrayBuffer);
  assert.deepEqual(out(run(plus, 'search', proto(input)), input), out(viaMenu, input));
  assert.equal(Object.keys(run(noAds, 'search', proto(input)).output).length, 0);
});

test('JSON home and search responses and every other endpoint behave exactly like the ad-only bundle', () => {
  const json = body => ({statusCode:200, headers:{'Content-Type':'application/json'}, body});
  const feed = JSON.stringify({contents:{sectionListRenderer:{contents:[{adSlotRenderer:{}}, {videoRenderer:{videoId:'KEEP'}}]}}});
  const player = JSON.stringify({playabilityStatus:{status:'OK'}, adPlacements:[{}], playerAds:[{}], videoDetails:{videoId:'v'}});
  const reel = JSON.stringify({entries:[{command:{reelWatchEndpoint:{videoId:'ad', adClientParams:{isAd:true}}}}, {command:{reelWatchEndpoint:{videoId:'keep'}}}]});
  for (const [name, response] of [['browse', json(feed)], ['next', json(feed)], ['search', json(feed)], ['player', json(player)], ['get_watch', json(player)], ['reel/reel_watch_sequence', json(reel)],
    ['next', proto(continuation(video('AAAAAAAAAAA'), adSlot))], ['log_event', proto(continuation(video('AAAAAAAAAAA')))]]) {
    const a = run(plus, name, response), b = run(noAds, name, response);
    assert.deepEqual(JSON.parse(JSON.stringify({...a.output, bodyBytes:a.output.bodyBytes && Array.from(new Uint8Array(a.output.bodyBytes))})),
      JSON.parse(JSON.stringify({...b.output, bodyBytes:b.output.bodyBytes && Array.from(new Uint8Array(b.output.bodyBytes))})), name);
    // JSON 正文不交给菜单脚本（它只处理 Protobuf），其余接口不经过它。
    assert.ok(!a.logs.some(line => line.includes('YouTubeDownloadMenu')), name);
  }
});
