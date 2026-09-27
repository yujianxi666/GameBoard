# GameBoard

**A static local game-library board** — a black & white flat UI with a cover grid, list view,
detail modal, and hover spotlight. Covers and metadata are fetched from the Steam store API
by a small build script driven by an editable config file.

**Zero dependencies. No build step required. Just open `index.html`.**

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933.svg?logo=node.js&logoColor=white)

---

本地游戏库展示板：黑白灰扁平界面，横向封面网格 + 收藏夹列表双视图，
封面与资料由脚本按配置文件自动抓取。

**零依赖、无需构建 —— 直接双击 `index.html` 就能看。**

## 特性

- **配置驱动**：游戏清单写在 `games.config.json`，跑一条命令自动抓封面与资料
- **纯静态**：没有框架、没有打包器、没有 CDN 依赖，`file://` 直接打开即可
- **双视图**：封面网格（右侧详情面板）+ 仿 Steam 收藏夹列表
- **搜索与筛选**：中英文名称、开发商、发行商、类型全文搜索；类型标签带数量
- **细节交互**：入场错峰动画、悬停聚焦压暗其余卡片、详情弹窗、键盘快捷键
- **健壮抓取**：封面四级兜底，抓不到自动生成占位图，不会留下坏路径
- **可访问性**：完整键盘操作，遵守 `prefers-reduced-motion`

## 快速开始

```bash
git clone https://github.com/KeepHope2901/GameBoard.git
cd GameBoard
```

然后**双击 `index.html`** 就完成了。仓库里已经带上抓好的封面和生成好的数据，
不联网也能正常浏览。

想换成自己的游戏清单：

```bash
# 1. 编辑 games.config.json，增删 games 数组里的条目
# 2. 抓取封面与资料，并重新生成 js/games.js
node tools/build-games.mjs
```

需要 Node 18 以上（用到了内置的 `fetch`），不需要 `npm install`。

## 配置说明

`games.config.json` 里每个游戏支持的字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `key` | ✔ | 唯一标识，同时决定封面文件名 `covers/<key>.jpg` |
| `label` | ✔ | 卡片上显示的名称（想显示什么就写什么） |
| `appid` | | Steam AppID：自动下载官方 header 图，并抓取全部资料 |
| `cover` | | 图片直链，或本地相对路径。优先级高于 `appid` |
| `accent` | | 卡片标记色，默认 `#e0e0e0` |
| `note` | | 库状态标记，例如 `位于更新队列中` |
| `bubble` | | 封面右上角小圆标里的数字 |
| `meta` | | 非 Steam 游戏可直接写死的资料（`title` / `dev` / `pub` / `genres` / `release` / `desc`） |

**封面来源优先级**：本地路径 → `cover` 直链 → `appid` 的 Steam header 图 → 沿用已有封面 → 生成 SVG 占位图。
任何一步失败都不会留下坏路径，也不会覆盖已经抓好的封面。

### 抓不到封面怎么办

把一张 460×215 左右的横图放进 `covers/`，然后把该项的 `cover` 写成 `covers/你的文件.jpg`。
仓库里已有两处例子：

- **Minecraft**：Steam 上没有原版，配置里直接写了官方素材地址。
- **蔚蓝档案**：Steam 页面是 [app/3557620](https://store.steampowered.com/app/3557620/)，
  但它部分 CDN 域名与 `appdetails` 接口在部分地区取不到，所以配置里直接写明了 header 图地址。

## 项目结构

```
GameBoard/
├─ index.html            页面结构（标题区 / 工具栏 / 网格 / 列表 / 详情面板 / 弹窗）
├─ favicon.svg           站点图标（黑白）
├─ games.config.json     ★ 游戏清单配置，增删游戏改这里
├─ css/styles.css        全部样式（黑白灰扁平风）
├─ js/app.js             渲染与交互逻辑
├─ js/games.js           生成的数据（由脚本写出，请勿手改）
├─ covers/               封面图（460×215）
│  ├─ meta-cache.json    Steam 资料缓存，避免重复请求接口
│  └─ *.jpg / *.svg      抓到的封面；抓不到时生成 .svg 占位图
└─ tools/build-games.mjs 读取配置 → 抓取封面与资料 → 写出 js/games.js
```

## 数据来源

| 数据 | 来源 |
| --- | --- |
| 封面图 | Steam CDN `steam/apps/<appid>/header.jpg`（460×215 横向） |
| 名称 / 开发商 / 发行商 / 发行日期 / 类型 / 简介 | Steam 商店 API `appdetails`（英文 + 简体中文各取一次） |
| AppID | Steam 商店搜索 API `storesearch` 逐条核对 |
| 非 Steam 游戏 | `games.config.json` 里的 `meta` 字段 |

> 本项目只读取 Steam 的公开商店接口，不涉及登录、账号或任何私有数据。

## 部署到 GitHub Pages

因为整个项目是纯静态的，仓库推上去后：

1. 打开仓库 **Settings → Pages**
2. Source 选 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`
3. 稍等片刻，访问 `https://keephope2901.github.io/GameBoard/`

## 界面与配色

扁平风格：几乎不用圆角（`--hair: 2px`）、不用半透明玻璃面板、不用彩色发光，
层次只靠纯色底与 1px 分隔线，接近 Steam 客户端的观感。

- **底色** `#0b0b0d`，面板 `#141416` / `#1a1a1d`，分隔线 `#262629`
- **文字** `#f2f2f2` / 次级 `#9a9aa0` / 弱化 `#6b6b71`
- **强调**：选中态用白色实心块 + 反白文字；卡片选中用左侧 3px 竖条标记
- **封面保留彩色**，是整页唯一的色彩焦点

主按钮默认白底黑字，悬浮时反相为深底白字，在任何底色的面板上都保持清晰可读。

## 交互与快捷键

**入场**：卡片错峰轻微上移；网格顶部扫过一条细亮线；背景有极淡网格与缓慢上升的星点。

**悬停聚焦**：指针移到某张卡片时其余卡片压暗，被指向的卡片轻微放大、封面高光斜掠，
并浮出「查看详情」。聚焦由 `.is-spotlight` / `.is-hot` 类驱动（而非 `:hover`），
以避免与入场动画的关键帧互相覆盖。

| 按键 | 作用 |
| --- | --- |
| `/` | 聚焦搜索框 |
| `1` / `2` | 切换网格 / 列表视图 |
| `Enter` | 打开当前选中游戏的弹窗 |
| `Esc` | 关闭弹窗 |

## 常见问题

**Q：为什么双击 `index.html` 能跑，不用起服务器？**

`js/app.js` 与 `js/games.js` 都是普通脚本（非 ES Module），数据通过 `window.GAMES` /
`window.GENRES` 传递。模块导入在 `file://` 下会被 CORS 拦截，改用普通脚本后
本地打开与 HTTP 访问表现一致。想用服务器也可以：

```bash
python -m http.server 8752   # 访问 http://127.0.0.1:8752/
```

**Q：抓取时报 `unable to verify the first certificate`？**

部分机器（装了抓包或安全软件的证书链）会让 Node 默认不信任 HTTPS 证书。
脚本检测到这类错误时会**自动带 `--use-system-ca` 重新执行一次**，无需手动加参数。

**Q：`meta-cache.json` 是干什么的？可以删吗？**

它是 Steam 公开资料的本地缓存，避免每次跑脚本都重复请求接口。删掉的话下次运行会重新抓取。

## License

代码与文档以 [MIT](LICENSE) 协议开源。

⚠️ **`covers/` 下的游戏封面图与 `js/games.js` 中的游戏名称、简介等文字资料，
版权归各游戏开发商与发行商所有，不在 MIT 授权范围内**，仅作技术演示收录。
详见 [LICENSE](LICENSE) 末尾的说明。
