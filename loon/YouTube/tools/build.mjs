/**
 * 功能：从保留中文注释的源码生成 Loon 与 Quantumult X 独立运行的压缩文件；固定工具版本和参数，支持检查产物是否过期。
 * 更新时间：2026-10-06
 */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {minify} from 'terser';

const root = new URL('../', import.meta.url);
const names = ['YouTubeFeed', 'YouTubePlayback', 'YouTubeConfig', 'YouTubeLogger'];
const bundles = {request: ['YouTubeConfig', 'YouTubePlayback', 'YouTubeLogger'], response: names};
const qxRoot = new URL('../../quantumultx/YouTube/', root);
const qxBundles = {request: ['YouTubePlayback'], response: ['YouTubeFeed', 'YouTubePlayback']};
const qxDownloadRoot = new URL('../../quantumultx/YouTubeDownload/', root);
const qxPlusRoot = new URL('../../quantumultx/YouTubePlus/', root);
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(value => value !== '--check')) throw new Error('仅支持 --check 参数');

/**
 * 功能：将当前阶段需要的功能文件包在独立作用域内，按接口分派后压缩；日志关闭时媒体直接放行。
 * 更新时间：2026-10-06
 * @param {string} phase 请求或响应阶段。
 * @returns {Promise<Object>} 合并后的压缩文本、文件地址及前后体积。
 */
async function compileScript(phase) {
  const modules = await readModules(bundles[phase]);
  const handlers = `yt${phase === 'request' ? 'Request' : 'Response'}Handlers`;
  const route = phase === 'request'
    ? `if (/\\/youtubei\\/v1\\/(?:config|log_event)(?:\\?[^#]*)?$/i.test(url)) return ${handlers}.YouTubeConfig();
       if (/\\/youtubei\\/v1\\/(?:player|get_watch|player\\/ad_break)(?:\\?[^#]*)?$/i.test(url)) return ${handlers}.YouTubePlayback();
       return ${handlers}.YouTubeLogger();`
    : `if (/\\/youtubei\\/v1\\/(?:config|log_event)(?:\\?[^#]*)?$/i.test(url)) return ${handlers}.YouTubeConfig();
       if (/\\/youtubei\\/v1\\/(?:browse|next|search)(?:\\?[^#]*)?$/i.test(url)) return ${handlers}.YouTubeFeed();
       if (/\\/youtubei\\/v1\\/(?:player|get_watch|reel\\/reel_watch_sequence)(?:\\?[^#]*)?$/i.test(url)) return ${handlers}.YouTubePlayback();
       return ${handlers}.YouTubeLogger();`;
  const source = `var ${handlers}={${modules.join(',\n')}};
    if (typeof $done === 'function') (function(){
      if (${phase === 'request' ? "typeof $response !== 'undefined'" : "typeof $response === 'undefined'"}) return $done({});
      var url = typeof $request !== 'undefined' ? String($request.url || '') : '';
      // 日志开关是媒体采样的总开关；关闭后不读取采样选项、媒体正文或日志缓存，也不执行日志模块。
      var media = /^https:\\/\\/[\\w-]+\\.googlevideo\\.com\\/(?:videoplayback|initplayback)(?:\\?[^#]*)?$/i.test(url);
      if (media && !(typeof $argument === 'object' && $argument && ($argument.log_enabled === true || $argument.log_enabled === 'true'))) return $done({});
      ${route}
    })();`;
  return minifyBundle(phase, source, new URL(`dist/${phase}.min.js`, root));
}

/**
 * 功能：读取功能源码并包成以模块名为键的独立函数，供合并入口按接口调用。
 * 更新时间：2026-10-06
 * @param {Array<string>} list 模块名称。
 * @returns {Promise<Array<string>>} 对象字面量中的各模块成员文本。
 */
function readModules(list) {
  return Promise.all(list.map(async name => {
    const code = await fs.readFile(new URL(`src/${name}.js`, root), 'utf8');
    return `${name}:function ${name}(){\n${code}\n}`;
  }));
}

/**
 * 功能：压缩合并入口并检查语法；文件头保存合并输入的哈希，保持相同输入生成相同输出。
 * 更新时间：2026-10-06
 * @param {string} name 输出中显示的产物名称。
 * @param {string} source 合并后的未压缩入口。
 * @param {URL} target 产物地址。
 * @returns {Promise<Object>} 压缩文本、文件地址及前后体积。
 */
async function minifyBundle(name, source, target) {
  const hash = createHash('sha256').update(source).digest('hex');
  const result = await minify({[`${name}.js`]: source}, {
    compress: false,
    mangle: {toplevel: false, properties: false},
    keep_fnames: true,
    keep_classnames: true,
    module: false,
    toplevel: false,
    sourceMap: false,
    format: {
      comments: false,
      preamble: `/* 自动生成，功能源码保存在 src/。合并源码 SHA-256: ${hash} */`
    }
  });
  if (!result.code) throw new Error(`${name} 压缩输出为空`);
  const code = result.code + '\n';
  new vm.Script(code, {filename: `${name}.min.js`});
  return {name, code, target, before: Buffer.byteLength(source), after: Buffer.byteLength(code)};
}

/**
 * 功能：生成 Quantumult X 发布包；只含去广告功能模块，由适配层转换运行时接口并注入固定开关。
 * 更新时间：2026-10-06
 * @param {string} phase 请求或响应阶段。
 * @param {boolean} debug 是否生成输出处理结果的调试版；除调试开关外与正式版相同。
 * @param {boolean} [plus] 是否生成合并版响应包：首页响应先去广告，再交给独立的下载菜单脚本处理；其他接口与正式版相同。
 * @returns {Promise<Object>} 压缩文本、文件地址及前后体积。
 */
async function compileQXScript(phase, debug, plus) {
  if (plus && (phase !== 'response' || debug)) throw new Error('合并版只有正式的响应包');
  const modules = await readModules(qxBundles[phase]);
  const runtime = await fs.readFile(new URL('tools/qx-runtime.js', root), 'utf8');
  const saved = JSON.parse(await fs.readFile(new URL('options.json', qxRoot), 'utf8'));
  const regions = ['original', 'CN', 'HK', 'TW', 'US', 'JP', 'KR', 'SG', 'GB', 'DE', 'RU'];
  for (const key of ['background_playback', 'hide_home_shorts']) if (typeof saved[key] !== 'boolean') throw new Error(`options.json 的 ${key} 必须为 true 或 false`);
  if (!regions.includes(saved.playback_region)) throw new Error(`options.json 的 playback_region 必须为 ${regions.join('、')} 之一`);
  const options = {background_playback: saved.background_playback, hide_home_shorts: saved.hide_home_shorts, playback_region: saved.playback_region, script_debug: debug};
  const route = phase === 'request'
    ? `if (/^https:\\/\\/[a-z0-9-]+\\.googlevideo\\.com\\/initplayback(?:\\?[^#]*)?$/i.test(url)) return ytQXEmptyVideo($request, $done);
       if (/\\/youtubei\\/v1\\/(?:player|get_watch|player\\/ad_break)(?:\\?[^#]*)?$/i.test(url)) return handlers.YouTubePlayback();`
    : `if (/\\/youtubei\\/v1\\/(?:browse|next|search)(?:\\?[^#]*)?$/i.test(url)) return handlers.YouTubeFeed();
       if (/\\/youtubei\\/v1\\/(?:player|get_watch|reel\\/reel_watch_sequence)(?:\\?[^#]*)?$/i.test(url)) return handlers.YouTubePlayback();`;
  // 合并版：下载菜单脚本原样包进函数，以形参接收去广告后的正文；去广告模块结束时不直接完成，而是把结果交给它。
  // 菜单脚本放行（返回空对象）时沿用去广告的结果，两者互不知道对方存在。
  const chain = !plus ? '' : `function ytQXDownloadMenu($response, $done){\n${await fs.readFile(new URL('YouTubeDownloadMenu.js', qxDownloadRoot), 'utf8')}\n}
        if (/\\/youtubei\\/v1\\/browse(?:\\?[^#]*)?$/i.test(url)) {
          var ytQXFinish = $done;
          $done = function (output) {
            var body = output && output.body instanceof Uint8Array ? output.body : $response.body;
            if (!(body instanceof Uint8Array)) return ytQXFinish(output);
            ytQXDownloadMenu({statusCode:$response.status, headers:$response.headers, bodyBytes:body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)}, function (result) {
              ytQXFinish(result && result.bodyBytes instanceof ArrayBuffer ? {body:new Uint8Array(result.bodyBytes)} : output);
            });
          };
        }`;
  // 功能源码通过形参取得适配后的接口，无需感知 Quantumult X；请求阶段的 $response 保持未定义。
  const source = `if (typeof $done === 'function') (function(){
      ${runtime}
      var qx = ytQXRuntime(${JSON.stringify(phase)}, ${JSON.stringify(options)});
      if (!qx) return;
      (function($request, $response, $done, $argument, $persistentStore){
        var handlers={${modules.join(',\n')}};
        var url = String($request.url || '');${chain && '\n        ' + chain}
        ${route}
        return $done({});
      })(qx.request, qx.response, qx.done, qx.argument, qx.store);
    })();`;
  if (plus) return minifyBundle('quantumultx plus response', source, new URL('dist/response.min.js', qxPlusRoot));
  return minifyBundle(`quantumultx ${phase}${debug ? ' debug' : ''}`, source, new URL(`dist/${phase}${debug ? '.debug' : ''}.min.js`, qxRoot));
}

/**
 * 功能：由正式片段生成调试片段，只替换标题和脚本地址，保证两者的规则始终一致。
 * 更新时间：2026-10-06
 * @returns {Promise<Object>} 调试片段文本及文件地址。
 */
async function compileQXDebugSnippet() {
  const snippet = await fs.readFile(new URL('YouTubeNoAds.snippet', qxRoot), 'utf8');
  const title = '# YouTube 去广告（Quantumult X）\n';
  if (!snippet.startsWith(title) || !snippet.includes('/dist/request.min.js') || !snippet.includes('/dist/response.min.js')) throw new Error('YouTubeNoAds.snippet 的标题或脚本地址与预期不符');
  const code = '# YouTube 去广告（Quantumult X，调试版）\n# 自动生成，请修改 YouTubeNoAds.snippet 后重新构建。脚本在 Quantumult X 的重写记录中输出每次处理结果，其余与正式版相同；不要与正式版同时启用。\n' +
    snippet.slice(title.length).replace(/\/dist\/(request|response)\.min\.js/g, '/dist/$1.debug.min.js');
  return {name: 'quantumultx debug snippet', code, target: new URL('YouTubeNoAds.debug.snippet', qxRoot), before: Buffer.byteLength(snippet), after: Buffer.byteLength(code)};
}

/**
 * 功能：由去广告片段和下载菜单片段生成合并版片段：响应脚本换成合并包，并附上下载站的代发规则；请求脚本沿用去广告版。
 * 更新时间：2026-10-06
 * @returns {Promise<Object>} 合并版片段文本及文件地址。
 */
async function compileQXPlusSnippet() {
  const snippet = await fs.readFile(new URL('YouTubeNoAds.snippet', qxRoot), 'utf8');
  const download = await fs.readFile(new URL('YouTubeDownloadMenu.snippet', qxDownloadRoot), 'utf8');
  const title = '# YouTube 去广告（Quantumult X）\n', response = '/quantumultx/YouTube/dist/response.min.js';
  const echo = download.split('\n').filter(line => !line.startsWith('#') && line.includes(' url script-echo-response '));
  if (!snippet.startsWith(title) || snippet.split(response).length !== 2 || echo.length !== 1) throw new Error('片段的标题、脚本地址或代发规则与预期不符');
  const code = '# YouTube 去广告 + 第三方下载菜单（Quantumult X，合并版）\n# 自动生成，请修改 YouTubeNoAds.snippet 或 YouTubeDownload/ 后重新构建。同一个首页响应先去广告、再加入“下载视频”“下载音频”菜单；\n' +
    '# 用它替代 YouTubeNoAds.snippet 和 YouTubeDownloadMenu.snippet，三者不要同时启用。以下为去广告片段的说明。\n' +
    snippet.slice(title.length).replace(response, '/quantumultx/YouTubePlus/dist/response.min.js').trimEnd() +
    '\n\n# 下载菜单的代发规则：拦截菜单项打开的地址，由脚本向下载站发 POST 并返回其响应。\n' + echo[0] + '\n';
  return {name: 'quantumultx plus snippet', code, target: new URL('YouTubePlus.snippet', qxPlusRoot), before: Buffer.byteLength(snippet), after: Buffer.byteLength(code)};
}

// 全部文件成功生成并通过语法检查后才开始写入；构建过程不修改源码、主插件或手写的 Quantumult X 片段。
const results = (await Promise.all(Object.keys(bundles).map(compileScript))).concat(
  await Promise.all([false, true].flatMap(debug => Object.keys(qxBundles).map(phase => compileQXScript(phase, debug)))), await compileQXDebugSnippet(), await compileQXScript('response', false, true), await compileQXPlusSnippet());
if (!check) for (const base of [root, qxRoot, qxPlusRoot]) await fs.mkdir(new URL('dist/', base), {recursive: true});
for (const result of results) {
  if (check) {
    const saved = await fs.readFile(result.target, 'utf8').catch(() => null);
    if (saved !== result.code) throw new Error(`构建产物缺失或过期：${fileURLToPath(result.target)}；请重新构建`);
  } else {
    await fs.writeFile(result.target, result.code);
  }
  console.log(`${result.name}: ${result.before} → ${result.after} 字节${result.after < result.before ? `，减少 ${(100 * (1 - result.after / result.before)).toFixed(1)}%` : ''}${check ? '，产物一致' : ''}`);
}
