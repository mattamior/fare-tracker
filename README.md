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
- 列表筛选（国家 / 关键词 / 只看好价）与表头排序
- 低于门槛高亮「好价」
- 增删改表单（出发机场可多选）
- 右侧按国家的价格趋势折线图（纯 SVG）
- 导出 / 导入 JSON；本地改动与文件数据合并显示

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

## 目录

```
fare-tracker/
  index.html
  assets/app.css
  assets/app.js
  data/fares.json      # 主数据（Agent 写入这里）
  data/settings.json   # 门槛与偏好
  scripts/add-fare.mjs # CLI 追加
  scripts/serve.sh     # 可选启动脚本
  README.md
```

## 说明

- 页面增删改默认写在浏览器 localStorage，**不会**自动改 `data/fares.json`（静态站无写权限）。要用文件持久化请走 CLI / 手改 JSON，并 push 才能更新 Pages。
- 「清空本地改动」只清浏览器侧，不影响 `data/fares.json`。
- 预置带「示例」标记的数据，真实票价请覆盖或追加。
