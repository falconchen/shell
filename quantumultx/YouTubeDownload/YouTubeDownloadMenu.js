/**
 * 文件：YouTubeDownloadMenu.js
 * 功能：在 YouTube 首页视频卡片的“⋯”菜单开头加入“下载视频”“下载音频”两项，点击后打开下载站地址并带上视频网址；POST 提交由 YouTubeDownloadPost.js 完成。
 *       同时移除 App 自带的离线下载条目。
 * 版本：0.4.0
 * 更新时间：2026-10-06
 * 运行环境：Quantumult X script-response-body；独立脚本，不依赖去广告脚本。
 * 状态：实验。结构取自 YouTube iOS 21.29.3 的一份首页续页响应，尚未在设备上验证。
 */
(function () {
  "use strict";
  // 菜单项打开的地址：下载站加 url 和 type 两个查询参数。YouTubeDownloadPost.js 拦截这一地址并代为 POST；
  // 未被拦截时只会打开下载站首页。
  var SITE = "http://192.168.6.7:5100/";
  // 按顺序加在菜单最前面的条目；type 为下载站表单的 type 字段。图标编号取自公开图标枚举：658 为 MY_VIDEOS，21 为 MUSIC。
  // 该枚举中的 52、59、100、242 等值与样本菜单的举报、稍后观看、分享、投放一致；147（OFFLINE_DOWNLOAD）已在设备上确认显示为向下箭头。
  var ITEMS = [{label:"下载视频", icon:658, type:"video"}, {label:"下载音频", icon:21, type:"audio"}];
  var VERSION = "0.4.0";
  // 是否移除 App 自带的“下载视频”。服务器下发的菜单里没有这四个字：样本中位于“保存到播放列表”和“分享”之间的条目
  // 是 MenuServiceItemRenderer（66441155），命令为 73080600（带视频编号），图标 57（OFFLINE_ADD），文字为“立即保存”，
  // 位置与 App 显示“下载视频”的位置一致，推断由 App 按离线状态改写文字。该对应关系没有公开定义佐证。
  var REMOVE_NATIVE_DOWNLOAD = true;
  var MAX_BYTES = 4 * 1024 * 1024;
  var MAX_FIELDS = 60000;
  // 首页首屏与续页中 SectionList 的位置，以及从列表项到视频卡片数据、再到菜单的固定路径。
  var LISTS = [[9, 58173949, 1, 58174010, 4, 49399797], [10, 49399797]];
  var CARD = [1, 50195462, 1, 153515154, 172660663, 1, 168777401, 5, 232954548, 18];
  var MENU = [5, 169495254, 98150882, 1, 66439850];
  // 视频编号的来源：卡片点击命令里的 watchEndpoint（48687757）字段 1；缺失时取菜单“立即保存”命令（73080600）字段 1。
  var VIDEO_IDS = [[4, 169495254, 462702848, 1, 200453700, 1, 48687757, 1], MENU.concat([1, 66441155, 3, 73080600, 1])];
  var fields = 0;

  /**
   * 功能：中止处理；调用方捕获后原样放行响应。
   * 更新时间：2026-10-06
   * @param {string} code 失败原因。
   */
  function fail(code) { throw new Error(code); }
  /**
   * 功能：读取一个 varint。
   * 更新时间：2026-10-06
   * @param {Uint8Array} bytes 数据。
   * @param {number} pos 起始位置。
   * @returns {{value:number, end:number}} 数值和结束位置。
   */
  function varint(bytes, pos) {
    var value = 0, scale = 1, byte;
    for (var i = 0; i < 10; i++) {
      if (pos >= bytes.length) fail("truncated-varint");
      byte = bytes[pos++];
      value += (byte & 127) * scale;
      if (!(byte & 128)) return {value:value, end:pos};
      scale *= 128;
    }
    fail("varint-too-long");
  }
  /**
   * 功能：把一层 Protobuf 消息拆成字段记录；结构不合法时中止。
   * 更新时间：2026-10-06
   * @param {Uint8Array} bytes 消息字节。
   * @returns {Array<Object>} 字段记录，含编号、线型及起止位置。
   */
  function parse(bytes) {
    var records = [], pos = 0;
    while (pos < bytes.length) {
      if (++fields > MAX_FIELDS) fail("field-limit");
      var start = pos, key = varint(bytes, pos), no = Math.floor(key.value / 8), wire = key.value % 8, payloadStart = key.end, end;
      if (!no) fail("invalid-field");
      if (wire === 0) end = varint(bytes, payloadStart).end;
      else if (wire === 1) end = payloadStart + 8;
      else if (wire === 5) end = payloadStart + 4;
      else if (wire === 2) { var length = varint(bytes, payloadStart); payloadStart = length.end; end = payloadStart + length.value; }
      else fail("unsupported-wire");
      if (end > bytes.length) fail("truncated-field");
      records.push({no:no, wire:wire, start:start, payloadStart:payloadStart, end:end});
      pos = end;
    }
    return records;
  }
  /**
   * 功能：编码一个 varint。
   * 更新时间：2026-10-06
   * @param {number} value 非负整数。
   * @returns {Array<number>} 字节。
   */
  function encodeVarint(value) {
    var out = [];
    while (value >= 128) { out.push(value % 128 + 128); value = Math.floor(value / 128); }
    out.push(value);
    return out;
  }
  /**
   * 功能：拼接多段字节。
   * 更新时间：2026-10-06
   * @param {Array<Uint8Array|Array<number>>} parts 各段字节。
   * @returns {Uint8Array} 拼接结果。
   */
  function join(parts) {
    var size = 0, offset = 0;
    parts.forEach(function (part) { size += part.length; });
    var out = new Uint8Array(size);
    parts.forEach(function (part) { out.set(part, offset); offset += part.length; });
    return out;
  }
  /**
   * 功能：生成长度型字段。
   * 更新时间：2026-10-06
   * @param {number} no 字段编号。
   * @param {Uint8Array|Array<number>} payload 字段内容。
   * @returns {Uint8Array} 含标签和长度的字段字节。
   */
  function message(no, payload) { return join([encodeVarint(no * 8 + 2), encodeVarint(payload.length), payload]); }
  /**
   * 功能：生成 varint 型字段。
   * 更新时间：2026-10-06
   * @param {number} no 字段编号。
   * @param {number} value 数值。
   * @returns {Array<number>} 字段字节。
   */
  function scalar(no, value) { return encodeVarint(no * 8).concat(encodeVarint(value)); }
  /**
   * 功能：把字符串编码为 UTF-8；Quantumult X 脚本环境没有 TextEncoder。
   * 更新时间：2026-10-06
   * @param {string} text 文本。
   * @returns {Array<number>} UTF-8 字节。
   */
  function utf8(text) {
    var encoded = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < encoded.length; i++) out.push(encoded.charCodeAt(i));
    return out;
  }
  /**
   * 功能：沿固定路径进入嵌套消息，对末端的每个匹配字段调用改写函数，并逐层重算长度；没有改动时返回原字节。
   * 更新时间：2026-10-06
   * @param {Uint8Array} bytes 当前层消息。
   * @param {Array<number>} path 剩余的字段编号路径。
   * @param {Function} change 接收末端消息并返回新消息或原消息的函数。
   * @returns {Uint8Array} 改写后的消息，或未改动的原消息。
   */
  function edit(bytes, path, change) {
    if (!path.length) return change(bytes);
    var records = parse(bytes), parts = [], changed = false;
    records.forEach(function (record) {
      if (record.no !== path[0] || record.wire !== 2) { parts.push(bytes.subarray(record.start, record.end)); return; }
      var before = bytes.subarray(record.payloadStart, record.end), after = edit(before, path.slice(1), change);
      if (after === before) { parts.push(bytes.subarray(record.start, record.end)); return; }
      changed = true;
      parts.push(message(record.no, after));
    });
    return changed ? join(parts) : bytes;
  }
  /**
   * 功能：生成新的菜单项：MenuNavigationItemRenderer（66441108），文字、图标及打开网址的命令（UrlEndpoint，49679253；字段 2 为 1 即 TARGET_NEW_WINDOW）。
   * 更新时间：2026-10-06
   * @param {string} videoId 视频编号。
   * @param {Object} item ITEMS 中的一项。
   * @returns {Uint8Array} 菜单列表中的一个字段 1。
   */
  function menuItem(videoId, item) {
    var url = SITE + "?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + videoId) + "&type=" + item.type;
    var label = message(1, message(1, message(1, utf8(item.label))));
    var command = message(3, message(49679253, join([message(1, utf8(url)), scalar(2, 1)])));
    return message(1, message(66441108, join([label, message(2, scalar(1, item.icon)), command])));
  }
  var added = 0, removed = 0;
  /**
   * 功能：判断菜单条目是否为 App 自带的离线下载项：MenuServiceItemRenderer（66441155）的命令（字段 3）含 73080600。
   * 更新时间：2026-10-06
   * @param {Uint8Array} item 菜单列表中一个字段 1 的内容。
   * @returns {boolean} 是否为离线下载项。
   */
  function nativeDownload(item) { return !!find(item, [66441155, 3, 73080600]); }
  /**
   * 功能：在菜单第一个条目之前加入下载项，并按开关去掉 App 自带的离线下载项；菜单为空或已含指向下载站的条目时不改动。
   * 更新时间：2026-10-06
   * @param {Uint8Array} menu MenuRenderer（66439850）消息。
   * @param {string} videoId 视频编号。
   * @returns {Uint8Array} 新菜单或原菜单。
   */
  function addItem(menu, videoId) {
    var records = parse(menu), first = -1, label = utf8(SITE + "?url=");
    records.forEach(function (record, index) { if (first < 0 && record.no === 1 && record.wire === 2) first = index; });
    if (first < 0) return menu;
    for (var i = 0; i + label.length <= menu.length; i++) {
      var match = true;
      for (var j = 0; j < label.length && match; j++) match = menu[i + j] === label[j];
      if (match) return menu;
    }
    var parts = [];
    records.forEach(function (record, index) {
      if (index === first) ITEMS.forEach(function (item) { parts.push(menuItem(videoId, item)); });
      if (REMOVE_NATIVE_DOWNLOAD && record.no === 1 && record.wire === 2 && nativeDownload(menu.subarray(record.payloadStart, record.end))) { removed++; return; }
      parts.push(menu.subarray(record.start, record.end));
    });
    added++;
    return join(parts);
  }
  /**
   * 功能：沿固定路径取第一个匹配的长度型字段内容。
   * 更新时间：2026-10-06
   * @param {Uint8Array} bytes 当前层消息。
   * @param {Array<number>} path 字段编号路径。
   * @returns {Uint8Array|null} 末端字段内容，找不到时为 null。
   */
  function find(bytes, path) {
    if (!path.length) return bytes;
    var records = parse(bytes);
    for (var i = 0; i < records.length; i++) {
      if (records[i].no !== path[0] || records[i].wire !== 2) continue;
      var found = find(bytes.subarray(records[i].payloadStart, records[i].end), path.slice(1));
      if (found) return found;
    }
    return null;
  }
  /**
   * 功能：读取视频卡片的视频编号并改写该卡片的菜单；编号缺失或格式不符时不改动。
   * 更新时间：2026-10-06
   * @param {Uint8Array} card 视频卡片数据（232954548 → 18）。
   * @returns {Uint8Array} 新卡片数据或原数据。
   */
  function patchCard(card) {
    var videoId = "";
    for (var n = 0; n < VIDEO_IDS.length && !videoId; n++) {
      var raw = find(card, VIDEO_IDS[n]), text = "";
      if (!raw || raw.length !== 11) continue;
      for (var i = 0; i < raw.length; i++) text += String.fromCharCode(raw[i]);
      if (/^[\w-]{11}$/.test(text)) videoId = text;
    }
    if (!videoId) return card;
    return edit(card, MENU, function (menu) { return addItem(menu, videoId); });
  }
  /**
   * 功能：处理当前响应；任何不符合预期的情况都返回空对象，由 Quantumult X 原样放行。
   * 更新时间：2026-10-06
   * @returns {Object} 交给 $done 的结果。
   */
  function run() {
    if (typeof $response === "undefined" || !$response || Number($response.statusCode) !== 200) return {};
    var headers = $response.headers || {}, type = "";
    Object.keys(headers).forEach(function (key) { if (key.toLowerCase() === "content-type") type = String(headers[key]); });
    if (!/^application\/(?:x-protobuf|protobuf|vnd\.google\.protobuf)/i.test(type)) return {};
    if (!($response.bodyBytes instanceof ArrayBuffer)) return {};
    var body = new Uint8Array($response.bodyBytes);
    if (!body.length || body.length > MAX_BYTES || (body[0] === 31 && body[1] === 139)) return {};
    var output = body;
    LISTS.forEach(function (list) {
      output = edit(output, list, function (section) { return edit(section, CARD, patchCard); });
    });
    if (output === body) return {};
    return {bodyBytes:output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)};
  }

  var result = {};
  try { result = run(); }
  catch (error) { result = {}; added = "error:" + (error && error.message || "unknown"); }
  if (typeof console !== "undefined") console.log("[YouTubeDownloadMenu " + VERSION + "] browse " + (typeof added === "number" ? "added=" + added + " removed_native=" + removed : added));
  $done(result);
})();
