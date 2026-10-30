# 回放接力

<img src="extension/icons/logo.svg" alt="回放接力 Logo" width="80" height="80">

把自己的 B 站长直播回放，自动拆成最多两小时的独立片段，预览后依次投稿。直接使用云端回放，无需下载、转码或重新上传。

也支持普通 B 站视频下载：视频页右上角直接展开下载面板，保存当前分 P 的视频、音频或封面；进入 UP 主页后，可以勾选视频批量下载。

**工具的优势：自动分段省操作，也保留推荐、搜索的分发机会。** 按 B 站当前[直播回放规则](https://www.bilibili.com/blackboard/era/q9k5jdgJKZ4oFzUW.html)，回放里的「整场投稿」不参与推荐、搜索等公域场景分发；「投片段」所有主播均可使用，会进入这些分发场景。本工具沿用「投片段」流程，让长回放有机会被新观众发现；分发机会不等于保证播放量或涨粉。

## 工具地址与作者

| 项目 | 地址 |
| --- | --- |
| 工具主页 / 源码 / 安装说明 | [github.com/ChenYilei2016/cyl-bili-replay-submit](https://github.com/ChenYilei2016/cyl-bili-replay-submit) |
| 扩展安装 ZIP（直接拖入 Chrome） | [下载 v0.5.1 安装包](https://github.com/ChenYilei2016/cyl-bili-replay-submit/raw/refs/heads/main/dist/cyl-bili-replay-submit-extension-0.5.1.zip) |
| 源码 ZIP 下载 | [下载 main 分支](https://github.com/ChenYilei2016/cyl-bili-replay-submit/archive/refs/heads/main.zip) |
| 作者 B 站主页 | [球磨川みそぎ · UID 1790439](https://space.bilibili.com/1790439) |
| 本机交互演示 | [http://127.0.0.1:5817](http://127.0.0.1:5817)（本机启动 `npm run preview` 后打开） |

作者：**球磨川みそぎ / ChenYilei2016**。工具是本地 Chrome 扩展，实际工作台入口是在 B 站「投片段」页面点击扩展图标；上面的 GitHub 地址用于获取代码和安装说明，本机演示地址只在运行演示的电脑上可用。

也可以通过 Git 获取：

```sh
git clone git@github.com:ChenYilei2016/cyl-bili-replay-submit.git
cd cyl-bili-replay-submit
```

## 分段效果

7 小时回放默认生成：

| 片段 | 回放范围 | 时长 |
| --- | --- | --- |
| 01 | 00:00:00–02:00:00 | 2 小时 |
| 02 | 02:00:00–04:00:00 | 2 小时 |
| 03 | 04:00:00–06:00:00 | 2 小时 |
| 04 | 06:00:00–07:00:00 | 1 小时 |

## 安装和使用

### 快捷安装：拖入 ZIP（推荐）

1. [下载扩展安装 ZIP](https://github.com/ChenYilei2016/cyl-bili-replay-submit/raw/refs/heads/main/dist/cyl-bili-replay-submit-extension-0.5.1.zip)，保留 ZIP 文件，无需解压。
2. 使用 Chrome 120 或更高版本，在地址栏输入 `chrome://extensions`，开启右上角「开发者模式」。
3. 将 `cyl-bili-replay-submit-extension-0.5.1.zip` 拖进这个扩展管理页面，按 Chrome 提示完成加载，然后刷新已经打开的 B 站页面。

扩展安装 ZIP 的根目录直接包含 `manifest.json` 和扩展运行文件，符合[扩展 ZIP 打包要求](https://developer.chrome.com/docs/webstore/prepare)。Chrome 的扩展管理页[支持 ZIP 拖放](https://github.com/chromium/chromium/blob/main/chrome/browser/resources/extensions/drag_and_drop_handler.ts)。GitHub 的「Download ZIP」下载的是整个项目源码，按下方目录方式安装。

### 源码目录安装

1. [下载源码 ZIP](https://github.com/ChenYilei2016/cyl-bili-replay-submit/archive/refs/heads/main.zip) 并解压，或执行上面的 `git clone`。
2. 使用 Chrome 120 或更高版本，在地址栏打开 `chrome://extensions`，开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择解压或克隆后项目中的 **extension** 目录。安装的是本地开发版本，不是 Chrome 商店版本。

### 开始投稿

1. 在 B 站网页登录自己的账号，打开[直播中心 → 直播回放](https://link.bilibili.com/p/center/index#/my-room/live-record)，点击目标场次的「投片段」。
2. 在这个剪辑页点击工具栏的「回放接力」扩展图标。若图标未显示，可在 Chrome 的扩展菜单中固定。
3. 工作台会读取回放范围。填写回放标题，点击「更新分段计划」，检查每段标题和时间；单段标题也可以直接修改。
4. 点击「开始依次投稿」，核对确认弹窗后开始。保持原 B 站剪辑页和工作台打开。

默认每段 120 分钟，请求之间至少间隔 15 秒；可调整为 1–120 分钟和 5–300 秒。每段都单独投稿，编号自动生成；取消勾选可以跳过尚未提交的段。可用标题变量是 `{title}`、`{date}`、`{index}`、`{total}`、`{start}`、`{end}`，最终标题最多 80 个字符。

B 站片段投稿会在个人空间和动态展示。工具的「已提交」表示官方接口接收成功，视频生成、审核和最终发布状态请在[稿件管理](https://member.bilibili.com/platform/upload-manager/article)或直播回放的「已发布片段」中查看。

## 下载普通视频

1. 打开 B 站普通视频播放页（`/video/BV…` 或 `/video/av…`），多 P 视频先选中要保存的分 P。
2. 点击页面右上角「下载视频」，下载面板直接在当前页展开。工具栏扩展图标也会展开同一个面板；直播回放的「投片段」页仍进入分段投稿工作台。
3. 在「视频下载」选择清晰度，保存带声音的视频；也可以分别保存「仅视频」「仅音频」或封面。下载从原 B 站页面的隐藏帧发起，不打开新标签页，文件名包含视频标题、BV 号和分 P，保存位置遵循浏览器的下载设置。
4. 实际进度和失败原因在 Chrome 下载列表中查看。视频地址过期时点击「重新读取」，再下载。

清晰度以 B 站当前账号实际返回为准；请求较高清晰度却被降级时，会提示实际清晰度。AAC 音频按实际码率标注，只有接口返回 FLAC 轨时才标为无损。纯视频不含声音，独立音视频不会自动合并；完整视频接口返回多个文件时，会列出所有分段供逐个保存。不提供番剧下载。

流程来自对本机「哔哩哔哩下载助手」1.5.8 安装包的只读核对，详见[下载流程核对记录](docs/research/bilibili-download-helper.md)。本项目自行实现页面读取、格式解析和浏览器保存，不依赖该插件的服务端或外部转换工具。

## 在 UP 主页勾选、批量下载

1. 进入 UP 主页的「投稿 → 视频」，在视频封面勾选「选择下载」。可以只选一个，也可以点右上角「下载已选」面板中的「全选当前页」。
2. 可以在当前主页翻页继续勾选，一次最多选择 100 个视频；「清空已选」只清除选择，不删除已保存的文件。
3. 在面板中选择优先清晰度，点击「开始下载」。默认优先 720P，下载带声音的视频；多 P 视频逐 P 保存，一个 P 对应多个文件时保留全部文件。实际清晰度按 B 站返回结果显示。
4. 队列等待当前文件完成后，再处理下一个文件，并保留请求间隔。点击「暂停后续」会在当前文件完成后暂停；继续时跳过已经完成的文件。失败会停止队列，处理 Chrome 或 B 站提示后可「重试并继续」。

Chrome 首次提示下载多个文件时，需要允许本站下载多个文件。保持 UP 主页打开，关闭面板不会停止队列；刷新或关闭主页会结束本次选择和队列，已经启动的文件仍由 Chrome 接管。下载中改变勾选不会改写当前队列，暂停或完成后可点「按当前勾选重建」。

工具读取主页已展示的视频卡片，不会为了建立列表拉取 UP 的全部投稿。每个所选视频只读取一次分 P 列表，再按需获取各 P 的下载地址；每个队列同一时间只下载一个文件。

## 用回放画面换封面

1. 在工作台「投稿封面」点击「打开回放选画面」，回到原 B 站剪辑页。
2. 使用官方播放器拖到回放里的任意位置，播放到喜欢的画面后暂停。
3. 回到工作台，点击「使用当前画面」，即可预览这张截图。可以反复换图，也可以点击「恢复原封面」。
4. 检查标题和分段，点击「开始依次投稿」；确认弹窗会再次展示本次封面。

各分段统一使用选中的这张封面。截图保存在本机，调整标题或复用历史命名时继续保留；确认投稿时才上传到 B 站，上传成功后所有分段复用同一个封面地址。上传失败时停止流程，不发送视频投稿请求；队列已有投稿记录后保持原封面。

截帧沿用官方「使用当前帧」的尺寸，保持原画面比例并补黑边生成 1600×900 JPEG。截图数据上限 2 MiB，不下载整场视频；上传成功后本机队列只保留封面地址。封面绑定当前账号和回放，切换回放时不会从命名历史带入上一场的图。

## 作者信息与命名历史

安装包自带作者 **球磨川みそぎ / ChenYilei2016**、B 站 UID **1790439** 和主页链接。Chrome 扩展详情的描述中可查看作者，工作台侧栏会显示作者署名；点击页脚「关于作者」可查看版本、B 站主页、GitHub 主页及项目地址。

工具栏、工作台与下载面板使用统一的「播放＋循环接力」蓝绿图标。矢量源文件位于 `extension/icons/logo.svg`，同时提供 16、32、48、128 像素 PNG，供 Chrome 工具栏、扩展管理和页面图标使用。

- 点击「更新分段计划」或确认开始投稿后，记录本次回放标题和标题格式。按 B 站登录账号分别保存，最多保留最近 20 组；相同名字和格式会去重并排到最近，同名但不同格式分别保留。
- 新回放默认带入该账号最近一次使用的名字和格式，也可以在「历史命名」中一键选择，立即生成当前回放的分段预览。`{date}`、`{index}`、`{total}`、`{start}`、`{end}` 都按当前回放计算，字面文本原样保留；建议用 `{date}` 表达日期。
- 当前回放已有队列时优先恢复原队列。有投稿记录的队列保持原命名，历史选择不覆盖已提交或待核对的片段。首次启用此功能会从本工具此前保存的队列中恢复命名；不读取 B 站以前手动投稿的视频标题。

历史保存在当前 Chrome 的扩展本地数据中。更新时保留原扩展，通过原已加载目录更新文件后在 `chrome://extensions` 点击「重新加载」，可继续使用该扩展已有的数据；重新安装为不同扩展 ID、卸载或换用其他浏览器不会自动迁移历史。

## 暂停、失败和恢复

- 「暂停队列」会等待当前请求返回，停止后续片段，不取消已经发送的投稿请求。
- 每段发送前先保存「正在提交」状态。成功的段会记录为「已提交」，重新打开工作台后不会自动重复投稿。
- B 站明确拒绝请求时标为「提交失败」。在官方页面处理登录、验证码、风控或额度提示后，点击该段「准备重试」，再继续队列。工具不会绕过这些限制。
- 网络超时、响应无法解析或工作台在提交中关闭时标为「待核对」。先等待服务端处理并到官方「已发布片段」核对标题和时间，再明确选择「已核对：已提交」或「已核对：未提交」。不会自动重试结果不明确的 POST。
- 投稿过的分段计划保持原范围，避免修改分段长度后重复覆盖已提交内容。记录按账号和回放 ID 保存在当前 Chrome 本地扩展存储中，可导出 JSON。
- 回放断流时按官方接口返回的可用时间区间规划，空白区间不单独投稿；每次请求的起止时间跨度也不超过 7200 秒。含官方受限内容的回放会阻止整场自动任务，需在官方页面先处理。

## 实现边界

这是本地 Chrome Manifest V3 扩展，无运行依赖、服务端、账号密码输入或 Cookie 导出。`activeTab`、`scripting`、`storage` 用于页面请求和本机进度；自动显示下载入口需要 `www.bilibili.com`、`bilibili.com`、`space.bilibili.com` 的站点访问权限。内容脚本仅在视频页及 UP 空间运行；面板只在普通视频、主页和投稿视频列表中显示，展开后才加载界面，开始批量下载后才读取所选视频接口。页面内面板复用扩展自己的界面，相关机制见 [Chrome 内容脚本文档](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)和[页面资源声明](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources)。

`declarativeNetRequestWithHostAccess` 及 `bilivideo.com`、`bilivideo.cn`、`hdslb.com` 的 CDN 权限用于文件保存。原 B 站页面使用 `strict-origin-when-cross-origin` 发起隐藏帧导航，让浏览器带上 B 站 Referer；附件规则精确匹配本次完整下载地址的 `sub_frame` 请求，设置文件名，不影响播放器媒体请求。多个面板的启动阶段通过浏览器锁协调，文件被 Chrome 接受后释放规则，再允许下一个启动。`downloads` 权限用于确认本次文件开始，以及跟踪批量队列对应文件的完成和失败，不使用扩展页直接下载媒体，不保存其他下载记录。登录 Cookie 和 CSRF 只在 B 站页面内用于请求 B 站，扩展不持久化普通视频的临时下载地址。原有投稿进度和命名历史仍保存在本机；一次只运行一个投稿工作台队列。

分段投稿支持自己的主播回放，可统一使用原封面或选中的回放截图，保持正常倍速，不自动添加字幕、付费观看或预约。弹幕同步选项根据官方账号权限开放。Chrome 关闭后不会继续投稿，当前版本没有后台定时任务。

本工具没有解除平台限制：单段仍不超过两小时，整场投稿权限仍以 B 站为准。B 站[直播回放规则说明](https://www.bilibili.com/blackboard/era/q9k5jdgJKZ4oFzUW.html)说明回放保留 14 天，整场投稿需要开播时 500 粉丝以上，片段投稿供所有主播使用。

## 本地预览和验证

需要 Node.js 22 或更高版本，无需 `npm install`：

```sh
npm test
npm run preview
```

打开 `http://127.0.0.1:5817` 可使用 **7 小时交互演示**。该页面由独立演示适配器提供数据，投稿按钮只运行模拟队列，不会读取 B 站账号或发送真实投稿。演示进度使用独立的 localStorage，正式扩展使用 Chrome 扩展存储，两者互不影响。

核心逻辑位于 `extension/core.js`，命名历史位于 `extension/naming-history.js`，B 站页面桥接和截帧上传位于 `extension/bilibili.js`，工作台位于 `extension/app.js` 和 `extension/styles.css`。`tests/selfcheck.mjs` 是一个无框架的可运行检查，覆盖分段、暂停恢复、命名历史、账号隔离、截帧尺寸，以及封面上传和投稿参数。

普通视频下载的页面桥接、地址解析和浏览器适配位于 `extension/video-download.js`，页面内入口位于 `extension/download-content.js`，界面位于 `extension/download.html`、`extension/download-app.js` 和 `extension/download.css`。UP 视频勾选位于 `extension/uploader-selection.js`，批量队列位于 `extension/batch-download.js`，批量界面位于 `extension/batch-download.html` 和 `extension/batch-download-app.js`。

`tests/download-selfcheck.mjs` 验证当前分 P、两种播放格式、音轨标注、隐藏帧下载和入口分流；`tests/batch-download-selfcheck.mjs` 验证多 P、多文件、串行下载、暂停继续、失败停止和监听器清理。启动 `npm run preview` 后，还可打开[视频页浮层演示](http://127.0.0.1:5817/video/BV1DEMO11111/)和[UP 勾选批量演示](http://127.0.0.1:5817/1790439/upload/video)。演示使用真实的界面与队列代码，通过独立演示适配器模拟结果，不读取账号或下载真实文件。

已通过核心自检和实际浏览器中的模拟流程：7 小时生成四段、提交第一段后暂停、刷新恢复为 1/4、继续时跳过第一段，最终完成 4/4。演示页的「重置演示」可清空独立的模拟进度，重新体验；它不会修改正式扩展的记录。

2026-10-01 已从当前官方剪辑页核对以下网页内部接口和参数，来源是[官方共享脚本](https://s1.hdslb.com/bfs/static/blive/web-cut/assets/_plugin-vue_export-helper-CJRD6JuW.js)及[官方剪辑脚本](https://s1.hdslb.com/bfs/static/blive/web-cut/assets/quickPublish-e1bFho-8.js)：

- `GetSliceStream`：读取 `live_key`、`start_time`、`end_time` 对应的时间区间。
- `AnchorGetSettings`：读取当前回放的弹幕投稿权限。
- `AnchorPublishVideoSlice`：以表单提交 `live_key`、`start_ts`、`end_ts`、`av_title`、`av_cover`、`av_highlight`、`with_subtitle`、`with_danmaku`、`with_reserve`、`csrf`。

封面上传已核对[官方素材脚本](https://s1.hdslb.com/bfs/static/blive/web-cut/assets/material-Dm-7vzwL.js)：调用 `https://api.bilibili.com/x/upload/web/image?csrf=…`，以 multipart 表单提交 `bucket=live` 和 JPEG `file`，使用返回的 `data.location` 作为 `av_cover`。

这些是当前官方网页使用的内部接口，不是稳定的公开 SDK 合约。页面或接口改变时，工具会显示失败并暂停。开发期间没有发布用户回放或上传真实封面；真实账号读取、封面上传和投稿需要安装扩展后在目标账号验证。
