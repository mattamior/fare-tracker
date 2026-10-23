# 机票盯价 Fare Tracker

珠三角 / 香港出发 · 东南亚好价记录板（纯静态页面）。

## 在线访问（GitHub Pages）

- 仓库：https://github.com/mattamior/fare-tracker
- 页面：https://mattamior.github.io/fare-tracker/

首次启用 Pages 后可能需要 1–2 分钟才会生效。若打开 404，稍等再刷新即可。

## 本地预览

```bash
cd fare-tracker && python3 -m http.server 8765
```

浏览器打开：http://localhost:8765

## 这是什么

给行程管家 / 自己用的轻量「机票好价」记录板：珠三角+香港出发，盯印尼 / 马来 / 泰国 / 越南。纯静态页面，数据在 `data/fares.json`，浏览器里增删改会进 localStorage，并可导出/导入 JSON。

## 默认好价门槛（可在页面「门槛设置」改）

| 国家 | 门槛 CNY |
|------|---------|
| 泰国 | 500 |
| 马来西亚 | 400 |
| 印尼 | 1000 |
| 越南 | 600（默认可改） |

## 功能

- 偏好说明（出发地、重点国家、周末+请假、春节前）
- 首屏直接是机票列表；顶部一行摘要显示已记录 / 好价 / 当前显示条数
- 顶栏：「新增」「历史机票」「明暗切换」常驻；门槛设置 / 导出 / 导入收进「更多」
- 筛选：国家芯片带联动计数和取消状态；手机端单行横向滚动，保留 Tab 键可达。好价二态（只看好价 / 全部），普通票筛选与排序并列。「更多筛选」抽屉按机场、最高价、关键词优先，带可见标题和顶部关闭；修改为草稿，关闭放弃、应用生效，清除条件不改示例显示。全量清空只在已选条件区出现，立即清国家并将好价切为「全部」；示例显示偏好和排序保持不变。手机使用原生模态对话框（背景隔离、焦点约束与恢复、断点切换保留状态）。「恢复默认」回到推荐筛选；远端失败保留本地记录并提示，「重新读取」只重试数据请求且不丢当前筛选
- 排序：下拉或点表头（价格 / 日期 / 发现时间 / 国家）
- 票价行：航线、日期、航司、价格、好价线差额、描边「查看票价」按钮；历史比较、备注、编辑 / 删除收在「详情」里。详情日期始终显示年份；只展示有效的同航线历史比较，不把最低价称为趋势
- 好价对比：列表下方可折叠的「好价对比速览」显示当前筛选下各国家最低价；票价详情的「历史比较」按相同出发机场组合、目的机场与行程类型比较去重后的有效观测，至少 2 条；示例、无效价格、缺机场或无效日期不参与
- 好价高亮：左边条 + 绿色底 +「好价」徽章（克制不花哨）
- 示例数据默认隐藏，可勾选「显示示例」
- 桌面宽行 / 手机纵向布局同一套结构；手机票价卡片更紧凑、查票和详情并排，触控目标 ≥ 44px
- 删除立即生效并提供独立的「撤销」条，5 秒内仅可撤销最近一条；普通成功提示不会覆盖该操作，重复恢复会被阻止，确认清空本地数据会取消待撤销操作
- 增删改表单（出发机场可多选）
- 右侧按国家的价格趋势折线图（纯 SVG）
- 导出 / 导入 JSON；本地改动与文件数据合并显示（主列表以 `data/fares.json` 为准）

## 回归测试

```bash
node scripts/test-regressions.mjs
```

使用 Node.js 内置模块与本机 Chrome/Chromium，不需要安装测试依赖。测试覆盖历史比较有效性与去重、删除 A → 编辑 B → 撤销 A、移动模态焦点/断点、清空范围、远端失败后的重试、国家芯片键盘可达与滚动，以及长航线/长航司、往返、无链接、缺价、多徽标的窄屏布局。视口断言覆盖首张票位置和卡片高度；测试数据为内存夹具，不会写入 `data/fares.json`。可追加 `--screenshots` 生成 390×844、768×1024、1440×900 深浅主题截图，以及 390px 筛选模态截图；默认 Chrome 路径适用于 macOS，也可通过 `CHROME_BIN` 指定其他可执行文件。

## GitHub Pages 怎么工作

本仓库是静态站，Pages 从 **`main` 分支根目录** 发布：

| 路径 | 作用 |
|------|------|
| `index.html` | 入口页面 |
| `assets/` | CSS / JS |
| `data/` | `fares.json`、`settings.json`（站点读取） |
| `scripts/` | 本地 CLI（写入 JSON），不影响线上页面 |

更新票价数据：改 `data/fares.json`（或用下方 CLI）后 push 到 `main`，Pages 会重新构建；浏览器刷新即可看到新数据。页面内增删改只存在你自己的浏览器 localStorage，**不会**写回仓库。

在仓库 Settings → Pages 中确认：

- Source：Deploy from a branch
- Branch：`main` / `/ (root)`

## 给其他 Agent 写入数据

### 方式 A：CLI 追加（推荐）

```bash
cd fare-tracker
node scripts/add-fare.mjs \
  --origin CAN,SZX \
  --country 泰国 \
  --city 曼谷 \
  --airport BKK \
  --trip 往返 \
  --depart 2026-11-06 \
  --return 2026-11-09 \
  --airline 狮航 \
  --stops 直飞 \
  --price 468 \
  --notes "周末+请一天假"
```

或：

```bash
node scripts/add-fare.mjs --json '{"origin":["HKG"],"destination_country":"越南","destination_city":"胡志明市","destination_airport":"SGN","trip_type":"往返","depart_date":"2026-11-14","return_date":"2026-11-16","airline":"越捷","stops":"直飞","price_cny":560,"notes":"扫票写入"}'
```

写入后刷新页面即可看到（读取 `data/fares.json`）。若已部署 Pages，需要再 `git push` 才会更新线上。

### 方式 B：直接改 JSON

编辑 `data/fares.json`，保持结构：

```json
{
  "version": 1,
  "updated_at": "2026-10-12T03:35:00+08:00",
  "next_id": 5,
  "fares": [
    {
      "id": 4,
      "origin": ["CAN"],
      "destination_country": "马来西亚",
      "destination_city": "槟城",
      "destination_airport": "PEN",
      "trip_type": "往返",
      "depart_date": "2026-11-20",
      "return_date": "2026-11-23",
      "airline": "亚航",
      "stops": "直飞",
      "price_cny": 390,
      "notes": "",
      "found_at": "2026-10-12T12:00:00+08:00",
      "meets_deal_bar": true,
      "deal_bar_override": null,
      "is_example": false
    }
  ]
}
```

门槛读 `data/settings.json`。

**票价变化快照（可选字段）**：自动扫票在同一单程航线/日期发现不同价格（上涨或下跌）时，新增带观测时间的快照，并把此前仍有效的记录标记为取代：`"superseded_by": <新记录 id>`、`"superseded_at": "<新记录 found_at>"`。旧记录保留；价格未变化则不新增。若价格回到历史上出现过的金额，且观测时间点不同，仍记录为新观测；页面按标准化时间点去重（时区偏移写法不同但瞬间相同的记录只算一次）。空扫描或扫描失败不推断旧票失效，也不更改旧记录状态。页面上被取代记录显示「已取代」徽标并划线。

**历史机票页**：出行日已过（单程看出发日，往返看返程日，按 Asia/Shanghai 当天判断）的记录不再混在「票价列表」里，改由顶栏「历史机票（N）」按钮切换查看，地址为 `#history`；数据文件不变，过期判断完全在页面端完成。

### 方式 C：Google Flights 自动扫票（headless Chrome）

Google Flights 对无 JS 的请求只会返回空壳，Skyscanner / Kayak / Kiwi 等则会返回 captcha 或纯 JS 页面，`curl` / `fetch` 都取不到价。本脚本改用本机 Chrome 无头渲染，再从渲染结果中解析单程直飞票价。

```bash
node scripts/scan-google-flights.mjs --from SZX --to KUL --date 2026-11-06
```

输出 JSON 数组（每条含航线、航司、起飞时间、时长、CNY 票价与可回溯的 Google Flights 搜索 URL）。自动任务把输出存到文件后交给 `record-scan-fare.mjs`：

```bash
node scripts/scan-google-flights.mjs --from SZX --to KUL --date 2026-11-06 > /tmp/scan.json
node scripts/record-scan-fare.mjs --scan /tmp/scan.json
```

限制与注意：

- 需要 macOS 上已安装 Chrome / Chromium / Edge（可用 `--chrome <path>` 指定）；每次渲染约 3–10 秒。
- 只解析**单程、直飞**卡片；往返、经停不抓。
- 票价是查询时刻的快照，含税但可能随库存变动；写入时把来源 URL 放进 `notes`，便于复核。
- 高频请求可能触发 Google 风控或页面结构变动导致解析为空；脚本此时输出 `[]` 并以 0 退出。自动任务把空数组和扫描失败都当作“状态未知”，跳过本轮且不把已有票标为失效；不得伪造数据。
- 抓取 Google Flights 可能与其服务条款存在冲突，是否长期启用由项目所有者决定。

## 目录

```
fare-tracker/
  index.html
  assets/app.css
  assets/app.js
  data/fares.json      # 主数据（Agent 写入这里）
  data/settings.json   # 门槛与偏好
  scripts/add-fare.mjs # CLI 追加
  scripts/scan-google-flights.mjs # Google Flights 扫票（headless Chrome）
  scripts/record-scan-fare.mjs # 记录价格变化与取代关系
  scripts/test-regressions.mjs # 无依赖浏览器回归测试
  scripts/serve.sh     # 可选启动脚本
  README.md
```

## 说明

- 页面增删改默认写在浏览器 localStorage，**不会**自动改 `data/fares.json`（静态站无写权限）。要用文件持久化请走 CLI / 手改 JSON，并 push 才能更新 Pages。
- 「清空本地改动」只清浏览器侧，不影响 `data/fares.json`。
- 预置带「示例」标记的数据，页面默认隐藏；勾选「显示示例」才可见。真实票价请覆盖或追加。

## 图标与许可

页面图标改编自 [Uber Base Web](https://github.com/uber/baseweb)（npm：`baseui` v18.2.0）公开 Icon 资源，**MIT License**（Copyright (c) Uber Technologies, Inc.）。

- 许可全文：[`assets/BASEUI-ICON-LICENSE.txt`](./assets/BASEUI-ICON-LICENSE.txt)
- 简要说明：[`assets/BASEUI-ICONS-NOTICE.txt`](./assets/BASEUI-ICONS-NOTICE.txt)
- Sprite：[`assets/uber-icons.svg`](./assets/uber-icons.svg)

其中 `hide` / `show` 图标上游标注源自 Steven Schoger 的 view-hide / view-show（CC BY 4.0），已随 Base Web 源文件保留署名信息。

功能补充：票价详情显示「历史比较」（数据不足时明确提示，不绘制或声称趋势）；单程票可展开「推荐返程」（约 +4 / +7 / +10 天，匹配同航线往返记录与备注）。桌面与手机使用同一套票价行结构（桌面宽行、手机纵向）。

## Agnir Project Instructions

This section is a **backward-compatible locator only**. Canonical Agnir activation and Project-operation instructions live in [`AGNIR.md`](./AGNIR.md). Do not duplicate or fork that procedure here.

Fresh activation path: `AGENTS.md` → `AGNIR.md` → `AGNIR.yaml` → declared `.agnir/` memory.
