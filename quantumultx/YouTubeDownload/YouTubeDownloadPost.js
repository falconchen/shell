/**
 * 文件：YouTubeDownloadPost.js
 * 功能：菜单项只能以 GET 打开网址；本脚本拦截带视频网址的 GET，由脚本向下载站发出 POST，并把下载站的响应作为该 GET 的结果返回。
 *       浏览器只做了一次普通跳转，没有提交表单，不会出现“你提交的信息不安全”的提示。
 * 版本：0.3.0
 * 更新时间：2026-10-06
 * 运行环境：Quantumult X script-echo-response；与 YouTubeDownloadMenu.js 配套，不依赖去广告脚本。
 * 状态：实验。脚本代为提交已在设备上使用（iPhone 17，iOS 26.6.2，YouTube 21.29.3），用户反馈基本可用。
 */
(function () {
  "use strict";
  // 下载站表单地址；表单字段为 url 和 type，与站点首页的表单一致。
  var SITE = "http://192.168.6.7:5100/";
  var VERSION = "0.3.0";
  var REASONS = {200:"OK", 201:"Created", 301:"Moved Permanently", 302:"Found", 303:"See Other", 307:"Temporary Redirect", 308:"Permanent Redirect", 400:"Bad Request", 401:"Unauthorized", 403:"Forbidden", 404:"Not Found", 500:"Internal Server Error", 502:"Bad Gateway"};
  /**
   * 功能：按不区分大小写的名称读取头部值。
   * 更新时间：2026-10-06
   * @param {Object} headers 头部对象。
   * @param {string} name 小写头部名称。
   * @returns {string} 头部值，缺失时为空字符串。
   */
  function header(headers, name) {
    var keys = Object.keys(headers || {});
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === name) return String(headers[keys[i]]);
    return "";
  }
  /**
   * 功能：生成交给 Quantumult X 的响应并结束脚本。
   * 更新时间：2026-10-06
   * @param {number} status 状态码。
   * @param {Object} headers 响应头。
   * @param {string} body 页面内容。
   * @param {string} note 写入日志的说明。
   */
  function finish(status, headers, body, note) {
    headers["Cache-Control"] = "no-store";
    if (typeof console !== "undefined") console.log("[YouTubeDownloadPost " + VERSION + "] " + note);
    $done({status:"HTTP/1.1 " + status + " " + (REASONS[status] || "Status"), headers:headers, body:body});
  }
  /**
   * 功能：生成本脚本自己的提示页。
   * 更新时间：2026-10-06
   * @param {string} content 页面正文的 HTML。
   * @returns {string} 完整页面。
   */
  function page(content) {
    return "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>YouTube 下载</title>" + content;
  }

  var url = typeof $request !== "undefined" && $request ? String($request.url || "") : "";
  // 只接受菜单项生成的地址形式；其他形式不提交，也不回显任何输入。
  var match = /^http:\/\/192\.168\.6\.7:5100\/\?url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3D([\w-]{11})&type=(video|audio)$/.exec(url);
  if (!match) return finish(400, {"Content-Type":"text/html; charset=utf-8"}, page("<p>地址格式不符，未提交。</p>"), "rejected");
  // 视频编号只含字母、数字、下划线和连字符，可直接写入属性值。
  var video = "https://www.youtube.com/watch?v=" + match[1], type = match[2];
  // 脚本提交失败时的退路：给出手动提交的表单，由浏览器直接向下载站 POST。
  var manual = page("<p>自动提交失败，可手动提交 " + video + "。</p><form method=\"post\" action=\"" + SITE + "\"><input type=\"hidden\" name=\"url\" value=\"" + video +
    "\"><input type=\"hidden\" name=\"type\" value=\"" + type + "\"><button type=\"submit\">提交</button></form>");
  if (typeof $task === "undefined" || !$task || typeof $task.fetch !== "function") return finish(502, {"Content-Type":"text/html; charset=utf-8"}, manual, "fetch unavailable");

  var headers = {"Content-Type":"application/x-www-form-urlencoded"}, cookie = header($request.headers, "cookie");
  // 带上浏览器对下载站的 Cookie，保持站点登录或授权状态。
  if (cookie) headers.Cookie = cookie;
  $task.fetch({url:SITE, method:"POST", headers:headers, body:"url=" + encodeURIComponent(video) + "&type=" + type, opts:{redirection:false}}).then(
    function (response) {
      var status = Number(response && response.statusCode) || 502, out = {"Content-Type":header(response.headers, "content-type") || "text/html; charset=utf-8"};
      // 下载站若以跳转或 Cookie 作答，原样交给浏览器。
      ["location", "set-cookie"].forEach(function (name) { var value = header(response.headers, name); if (value) out[name === "location" ? "Location" : "Set-Cookie"] = value; });
      finish(status, out, typeof response.body === "string" ? response.body : "", "posted type=" + type + " status=" + status);
    },
    function () { finish(502, {"Content-Type":"text/html; charset=utf-8"}, manual, "post failed"); }
  );
})();
