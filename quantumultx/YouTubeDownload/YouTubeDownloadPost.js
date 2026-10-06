/**
 * 文件：YouTubeDownloadPost.js
 * 功能：菜单项只能以 GET 打开网址；本脚本拦截带视频网址的 GET，返回一个自动提交的表单页，由浏览器向下载站发出 POST。
 * 版本：0.2.0
 * 更新时间：2026-10-06
 * 运行环境：Quantumult X script-echo-response；与 YouTubeDownloadMenu.js 配套，不依赖去广告脚本。
 * 状态：实验，尚未在设备上验证。
 */
(function () {
  "use strict";
  // 下载站表单地址；表单字段为 url 和 type，与站点首页的表单一致。
  var SITE = "http://192.168.6.7:5100/";
  var VERSION = "0.2.0";
  /**
   * 功能：生成交给 Quantumult X 的响应。
   * 更新时间：2026-10-06
   * @param {number} status 状态码。
   * @param {string} reason 状态文字。
   * @param {string} body 页面内容。
   * @returns {Object} 响应对象。
   */
  function response(status, reason, body) {
    return {status:"HTTP/1.1 " + status + " " + reason, headers:{"Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Referrer-Policy":"same-origin"}, body:body};
  }
  /**
   * 功能：只接受本脚本菜单项生成的地址形式，取出视频编号和类型后生成表单页；其他形式返回 400，不回显任何输入。
   * 更新时间：2026-10-06
   * @returns {Object} 响应对象。
   */
  function run() {
    var url = typeof $request !== "undefined" && $request ? String($request.url || "") : "";
    var match = /^http:\/\/192\.168\.6\.7:5100\/\?url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3D([\w-]{11})&type=(video|audio)$/.exec(url);
    if (!match) return response(400, "Bad Request", "<!doctype html><meta charset=\"utf-8\"><title>YouTube 下载</title><p>地址格式不符，未提交。</p>");
    // 视频编号只含字母、数字、下划线和连字符，可直接写入属性值。
    var video = "https://www.youtube.com/watch?v=" + match[1];
    return response(200, "OK", "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>YouTube 下载</title>" +
      "<form id=\"f\" method=\"post\" action=\"" + SITE + "\"><input type=\"hidden\" name=\"url\" value=\"" + video + "\"><input type=\"hidden\" name=\"type\" value=\"" + match[2] + "\">" +
      "<p>正在提交 " + video + " …</p><noscript><button type=\"submit\">提交</button></noscript></form><script>document.getElementById(\"f\").submit();</script>");
  }
  var result = run();
  if (typeof console !== "undefined") console.log("[YouTubeDownloadPost " + VERSION + "] " + result.status.slice(9));
  $done(result);
})();
