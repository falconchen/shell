# 哔哩哔哩去广告与界面自定义（Quantumult X）

哔哩哔哩 App 的去广告和界面自定义使用第三方项目 [Biliverse](https://biliverse.github.io/)，本仓库不维护它的脚本，只提供一个修复片段，解决它的设置页在 Quantumult X 上打不开的问题。

| 片段 | 来源 | 作用 |
| --- | --- | --- |
| `BiliBili.ADBlock.snippet` | [Biliverse/ADBlock](https://github.com/Biliverse/ADBlock) | 去广告 |
| `Biliverse.Enhanced.snippet` | [Biliverse/Enhanced](https://github.com/Biliverse/Enhanced) | 自定义首页标签、底部导航栏、“我的”页入口 |
| [BiliverseSettingsFix.snippet](BiliverseSettingsFix.snippet) | 本仓库 | 修复 Enhanced 的设置页在 Quantumult X 上“加载失败：HTTP 400” |

三个片段同时启用。ADBlock 和 Enhanced 处理的接口没有重叠，不会互相覆盖。

## 设备反馈（2026-10-07）

用户在 Quantumult X 真机上使用 ADBlock 0.7.3、Enhanced 0.6.0，反馈：

- 启用 ADBlock 后广告消失；
- 启用 Enhanced 后，“我的”页出现 Biliverse 入口，设置页能识别已安装的两个插件；
- 未启用修复片段时，点进插件显示“加载失败：HTTP 400”；启用后设置页正常显示；
- 在设置页编辑首页分区后提示“保存失败，请重试”，重新打开哔哩哔哩后设置实际生效。

没有记录设备型号、系统和哔哩哔哩版本，也没有逐项核对每个开关的效果。

## 安装

1. 在重写引用里依次添加三个地址：

   ```text
   https://github.com/Biliverse/ADBlock/releases/latest/download/BiliBili.ADBlock.snippet
   ```

   ```text
   https://github.com/Biliverse/Enhanced/releases/latest/download/Biliverse.Enhanced.snippet
   ```

   ```text
   https://raw.githubusercontent.com/falconchen/shell/main/quantumultx/Bilibili/BiliverseSettingsFix.snippet
   ```

2. 开启 MitM 和重写，安装并完全信任证书。三个片段都自带 `hostname` 行，引用后自动合并。
3. 完全退出哔哩哔哩再打开。开屏广告有本地缓存，头一两次可能仍会出现。

建议先只装 ADBlock，确认哔哩哔哩能正常使用后再装另外两个，出问题时容易判断是哪一个。

与 YouTube 去广告不同，这里不需要拦 UDP 443。

前两个地址里的 `latest` 会跟随 Biliverse 的最新发布。要固定版本时把 `latest/download` 换成 `download/v0.7.3` 这样的具体版本。

## 设置

不调整时按 Biliverse 的默认配置生效。调整有两个入口，改的是同一份数据。

### App 内设置页

1. 打开哔哩哔哩，进入底部的“我的”。
2. 在“更多服务”里找到 **Biliverse** 入口并点开。
3. 已安装的插件显示版本号，点进 Enhanced 或 ADBlock 逐项调整。
4. 完全退出哔哩哔哩再打开，设置生效。

**这个页面只能在哔哩哔哩 App 内打开。** 用 Safari 访问 `https://biliverse.github.io/settings/` 时，各插件会一直停在“检测中”：页面依赖哔哩哔哩 App 内置浏览器提供的接口，Safari 里没有。

页面底部“请将配置类型设为 PersistentStore”的提示针对 Loon 和 Surge 的模块参数，Quantumult X 不需要处理。

Enhanced 可调的主要项目：

| 分组 | 内容 |
| --- | --- |
| 首页 | 顶部标签页、默认标签页、顶栏左右按钮、标签栏右侧按钮 |
| 底部导航栏 | 首页、动态、发布、会员购、消息、我的 |
| 分区 | 显示哪些分区 |
| 我的 | 快捷入口、创作中心、推荐服务、更多服务 |

ADBlock 可调的是各页面的去广告开关，以及热搜、热门话题、竖屏视频、交互式弹幕、跟踪参数等可选项。

### BoxJS

不想用 App 内设置页时可以改用 BoxJS，它直接读写 Quantumult X 的本地存储，不需要修复片段。

1. 在重写引用里添加 BoxJS：

   ```text
   https://github.com/chavyleung/scripts/raw/master/box/rewrite/boxjs.rewrite.quanx.conf
   ```

2. 用 Safari 打开 `http://boxjs.com`，在“订阅”里添加：

   ```text
   https://github.com/Biliverse/BoxJs/raw/main/BiliBili.boxjs.json
   ```

3. 在“应用”里展开“📺 BiliBili”，调整后保存，完全退出哔哩哔哩再打开。

以上步骤取自 Biliverse 的文档，未在设备上确认。Biliverse 说明未来版本可能不再兼容 BoxJS。

## 设置存在哪里

设置保存在 Quantumult X 提供给脚本的本地存储里，没有上传到哔哩哔哩服务器或其他地方。Enhanced 每次拦住服务器返回的首页标签、“我的”页等数据，按本地保存的设置改写后再交给 App。

- 只在这台设备上、Quantumult X 开着并启用 Enhanced 时生效；停用后恢复成服务器返回的原样。
- 不随账号同步，其他设备和网页端不受影响。
- 卸载 Quantumult X 或清除其数据后，设置丢失，需要重新调整。
- 这块存储由 Quantumult X 里的所有脚本共用，没有按脚本隔离。

## 已知问题

### 设置页“加载失败：HTTP 400”

Enhanced 用 `script-echo-response` 运行设置的存储接口（`/api/get`、`/api/set`、`/api/delete`），接口要求请求带正文，否则返回 400。启用修复片段、改用 `script-request-body` 运行同一份脚本后，问题消失。据此判断原因是 Quantumult X 的 `script-echo-response` 脚本拿不到请求正文，没有通过抓包单独确认。

修复片段引用的脚本与 Enhanced 引用的是同一个地址，本仓库不修改也不保存它。

修复片段与 Enhanced 的规则匹配同一地址，只有一条会生效。启用后若仍是 400，且日志里 `/api/get` 的类型仍是 `script-echo-response`，把修复片段里的那条规则复制到主配置的 `[rewrite_local]`。

### 编辑首页分区后提示“保存失败，请重试”

设置实际已保存，提示可以忽略。

在分区编辑页点“完成”时，App 发出保存请求（`bilibili.app.show.v1.Mixture/RegionShortcut`）。Enhanced 把选择写入本地存储，拦下请求并自行返回一个成功状态，但返回里没有消息体。按 Enhanced 0.6.0 的脚本推断，App 因此把这次回复判为失败；这一点没有通过抓包确认，也不确定其他代理工具上是否同样出现。

本仓库不修复这一项：需要自行接管该请求并重做 Enhanced 的保存逻辑，Enhanced 更新存储格式后容易出错。

## 注意事项

- Biliverse 和 BoxJS 都是第三方脚本，会解密并处理哔哩哔哩 App 的流量，包括登录状态下的请求。本仓库没有审查它们的代码。
- ADBlock 的响应脚本约 1.1 MB，首次加载较慢。
- 不要同时启用其他匹配哔哩哔哩接口的去广告重写。
