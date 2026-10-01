# 回放接力

把自己的 B 站长直播回放，自动拆成最多两小时的独立片段，预览后依次投稿。直接使用云端回放，无需下载、转码或重新上传。

## 工具地址与作者

| 项目 | 地址 |
| --- | --- |
| 工具主页 / 源码 / 安装说明 | [github.com/ChenYilei2016/cyl-bili-replay-submit](https://github.com/ChenYilei2016/cyl-bili-replay-submit) |
| 扩展安装 ZIP（直接拖入 Chrome） | [下载 v0.1.0 安装包](https://github.com/ChenYilei2016/cyl-bili-replay-submit/raw/refs/heads/main/dist/cyl-bili-replay-submit-extension-0.1.0.zip) |
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

1. [下载扩展安装 ZIP](https://github.com/ChenYilei2016/cyl-bili-replay-submit/raw/refs/heads/main/dist/cyl-bili-replay-submit-extension-0.1.0.zip)，保留 ZIP 文件，无需解压。
2. 使用 Chrome 120 或更高版本，在地址栏输入 `chrome://extensions`，开启右上角「开发者模式」。
3. 将 `cyl-bili-replay-submit-extension-0.1.0.zip` 拖进这个扩展管理页面，按 Chrome 提示完成加载。

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

## 暂停、失败和恢复

- 「暂停队列」会等待当前请求返回，停止后续片段，不取消已经发送的投稿请求。
- 每段发送前先保存「正在提交」状态。成功的段会记录为「已提交」，重新打开工作台后不会自动重复投稿。
- B 站明确拒绝请求时标为「提交失败」。在官方页面处理登录、验证码、风控或额度提示后，点击该段「准备重试」，再继续队列。工具不会绕过这些限制。
- 网络超时、响应无法解析或工作台在提交中关闭时标为「待核对」。先等待服务端处理并到官方「已发布片段」核对标题和时间，再明确选择「已核对：已提交」或「已核对：未提交」。不会自动重试结果不明确的 POST。
- 投稿过的分段计划保持原范围，避免修改分段长度后重复覆盖已提交内容。记录按账号和回放 ID 保存在当前 Chrome 本地扩展存储中，可导出 JSON。
- 回放断流时按官方接口返回的可用时间区间规划，空白区间不单独投稿；每次请求的起止时间跨度也不超过 7200 秒。含官方受限内容的回放会阻止整场自动任务，需在官方页面先处理。

## 实现边界

这是本地 Chrome Manifest V3 扩展，无运行依赖、服务端、账号密码输入或 Cookie 导出。仅申请 `activeTab`、`scripting`、`storage`：点击扩展时授权当前页，在原 B 站页面中执行请求。登录 Cookie 和 CSRF 只在该页面内用于请求 B 站，扩展只保存账号 ID、回放参数、标题和队列进度。一次只运行一个工作台队列。

当前支持自己的主播回放，统一使用原回放封面、正常倍速，不自动添加字幕、付费观看或预约。弹幕同步选项根据官方账号权限开放。Chrome 关闭后不会继续投稿，当前版本没有后台定时任务。

本工具没有解除平台限制：单段仍不超过两小时，整场投稿权限仍以 B 站为准。B 站[直播回放规则说明](https://www.bilibili.com/blackboard/era/q9k5jdgJKZ4oFzUW.html)说明回放保留 14 天，整场投稿需要开播时 500 粉丝以上，片段投稿供所有主播使用。

## 本地预览和验证

需要 Node.js 22 或更高版本，无需 `npm install`：

```sh
npm test
npm run preview
```

打开 `http://127.0.0.1:5817` 可使用 **7 小时交互演示**。该页面由独立演示适配器提供数据，投稿按钮只运行模拟队列，不会读取 B 站账号或发送真实投稿。演示进度使用独立的 localStorage，正式扩展使用 Chrome 扩展存储，两者互不影响。

核心逻辑位于 `extension/core.js`，B 站页面桥接位于 `extension/bilibili.js`，工作台位于 `extension/app.js` 和 `extension/styles.css`。`tests/selfcheck.mjs` 是一个无框架的可运行检查，覆盖连续/断流分段、暂停恢复、结果不明确时停止、账号切换和实际请求格式。

已通过核心自检和实际浏览器中的模拟流程：7 小时生成四段、提交第一段后暂停、刷新恢复为 1/4、继续时跳过第一段，最终完成 4/4。演示页的「重置演示」可清空独立的模拟进度，重新体验；它不会修改正式扩展的记录。

2026-10-01 已从当前官方剪辑页核对以下网页内部接口和参数，来源是[官方共享脚本](https://s1.hdslb.com/bfs/static/blive/web-cut/assets/_plugin-vue_export-helper-CJRD6JuW.js)及[官方剪辑脚本](https://s1.hdslb.com/bfs/static/blive/web-cut/assets/quickPublish-e1bFho-8.js)：

- `GetSliceStream`：读取 `live_key`、`start_time`、`end_time` 对应的时间区间。
- `AnchorGetSettings`：读取当前回放的弹幕投稿权限。
- `AnchorPublishVideoSlice`：以表单提交 `live_key`、`start_ts`、`end_ts`、`av_title`、`av_cover`、`av_highlight`、`with_subtitle`、`with_danmaku`、`with_reserve`、`csrf`。

这些是当前官方网页使用的内部接口，不是稳定的公开 SDK 合约。页面或接口改变时，工具会显示失败并暂停。开发期间没有发布用户回放；真实账号读取和真实投稿需要安装扩展后在目标账号验证。
