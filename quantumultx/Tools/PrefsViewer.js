/**
 * 功能：只读查看 Quantumult X 本地存储（$prefs）中指定键的内容；不写入、不删除、不发起网络请求。
 * 用法：Quantumult X 运行时用浏览器访问 http://example.com/qx-prefs?key=键名
 * 更新时间：2026-10-07
 * 运行环境：Quantumult X script-echo-response
 */
(function () {
  var VERSION = "1.0.0";
  /**
   * 功能：以纯文本应答；禁止缓存和类型嗅探，存储内容可能含凭据，不应留在浏览器缓存里。
   * 更新时间：2026-10-07
   * @param {number} status HTTP 状态码。
   * @param {string} text 正文。
   */
  function reply(status, text) {
    var label = status === 200 ? "OK" : status === 404 ? "Not Found" : "Bad Request";
    $done({status:"HTTP/1.1 " + status + " " + label, headers:{"Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"}, body:text});
  }
  /**
   * 功能：从地址的查询串读取 key 参数；编码无效时视为缺失。
   * 更新时间：2026-10-07
   * @param {string} url 请求地址。
   * @returns {string|null} 键名。
   */
  function keyOf(url) {
    var query = url.indexOf("?") < 0 ? "" : url.slice(url.indexOf("?") + 1).split("#")[0], pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var equal = pairs[i].indexOf("=");
      if (equal < 0 || pairs[i].slice(0, equal) !== "key") continue;
      try { return decodeURIComponent(pairs[i].slice(equal + 1).replace(/\+/g, "%20")); } catch (_) { return null; }
    }
    return null;
  }

  var key = keyOf(typeof $request === "object" && $request ? String($request.url || "") : "");
  if (!key || key.length > 256) return reply(400, "PrefsViewer " + VERSION + "\n\n用法：在地址后加上 ?key=键名，例如\nhttp://example.com/qx-prefs?key=Biliverse\n\nQuantumult X 不提供列出全部键名的接口，键名需要从脚本的说明或源码里查。");
  var value = typeof $prefs === "object" && $prefs ? $prefs.valueForKey(key) : null;
  if (value === null || value === undefined) return reply(404, "PrefsViewer " + VERSION + "\n\n键 " + key + " 不存在，或没有内容。");
  var text = String(value), shown = text, kind = "文本";
  // 能解析成 JSON 时缩进显示，便于阅读；解析失败按原文显示。
  try { var parsed = JSON.parse(text); if (parsed !== null && typeof parsed === "object") { shown = JSON.stringify(parsed, null, 2); kind = "JSON"; } } catch (_) {}
  reply(200, "PrefsViewer " + VERSION + "\n键：" + key + "\n类型：" + kind + "\n长度：" + text.length + " 字符\n\n" + shown);
})();
