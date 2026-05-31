## 诊断结论

你的 Bright Data 配置完全正确：
- Type = Browser API ✓
- Host = `brd.superproxy.io:9222` ✓
- `BRIGHT_DATA_BROWSER_ZONE` = 纯 zone 名 ✓（代码会自己拼 `brd-customer-XXX-zone-YYY`）
- `BRIGHT_DATA_BROWSER_PASSWORD` = zone access parameter 密码 ✓

URL 生成结果是合法的：`wss://brd-customer-hl_340d21df-zone-<zone>:<pwd>@brd.superproxy.io:9222`，这正是 Bright Data 官方 puppeteer 样例的格式。

真正的问题是 **Deno 的内置 `WebSocket` 在 TLS 握手时声明 h2/h3 ALPN**，而 Bright Data 边缘节点只接受 HTTP/1.1 升级，于是返回 `NoApplicationProtocol` 致命 alert——在凭据被发送之前就断了。这是 Deno 运行时限制，不是 Bright Data 也不是你的配置问题。

## 方案：把这个调用搬到 Cloudflare Worker

本项目同时有两套后端：
- `supabase/functions/*`（Deno 运行时）—— 当前 `bright-data-service.ts` 在这里，所以撞到 ALPN
- `src/routes/api/*` + `src/lib/*.functions.ts`（Cloudflare Worker 运行时，TanStack server function）

**Cloudflare Worker 的 `fetch()` 配合 `Upgrade: websocket` header 走的是标准 HTTP/1.1 升级**，不存在 Deno 那种 ALPN 协商问题，正好对得上 Bright Data 的要求。这是最小代价的修复路径。

## 具体步骤

1. **新建 `src/lib/scraping-browser.server.ts`**
   - 用 `fetch('https://brd.superproxy.io:9222/', { headers: { Upgrade: 'websocket', ... }, ... })` 拿到 `WebSocket` 对象（Workers 标准 API：`response.webSocket`）
   - 用 Basic Auth header 传 `brd-customer-XXX-zone-YYY:PWD`，避免 URL embedded credentials
   - 实现极简 CDP 客户端：`Target.createTarget` → `Target.attachToTarget` → `Page.enable` → `Page.navigate` → 监听 `Page.loadEventFired` → `Runtime.evaluate('document.documentElement.outerHTML')`
   - 30s 超时；返回 `{ html, status, mode: 'scraping_browser_cf' }`

2. **新建 `src/lib/scrape.functions.ts`**
   - `export const scrapeUrl = createServerFn({ method: 'POST' }).inputValidator(z.object({ url, source })).handler(...)`
   - source ∈ {`trip`, `sg_cccs`} → 调 `scraping-browser.server.ts`
   - 其他 source → fallback 到现有 Web Unlocker HTTP path（直接在 server function 里 fetch Bright Data Web Unlocker REST）
   - 写入同一张 `scrape_cache` 表（已有）

3. **改造 `supabase/functions/analyze-dispute`**
   - 当需要 `trip` / `sg_cccs` 的 HTML 时，从 edge function 里 `fetch()` 调用上面的 TanStack server route（同域，无 CORS）
   - 其他 source 继续走 edge function 内现有的 Web Unlocker 路径，不动

4. **保留 fallback**
   - 如果 Cloudflare WebSocket upgrade 也意外失败（罕见但要兜底），server function 返回 `{ error: 'browser_unreachable' }`，`analyze-dispute` 回落到 `knowledge.ts` 本地法律基线 + AI 推理（即你已有的 Trip.com 兜底逻辑）

5. **实测验证**
   - 清 `scrape_cache` 中 `trip` / `sg_cccs` 行
   - 在前端跑一次完整 dispute 分析，检查 Worker 日志确认 mode=`scraping_browser_cf`、`html_size > 50KB`
   - 同时确认 `sg_case` 仍走 Web Unlocker 不受影响

## 风险与边界

- Cloudflare Worker 的 outbound WebSocket 有 ~30s CPU 时间上限。Bright Data Scraping Browser 单次请求 15–30s 在范围内，但如果目标站慢，可能踩边。会在 server function 里设 25s navigation 超时主动放弃。
- Workers WebSocket API 是同步消息模型（`ws.addEventListener('message', ...)`），不是 Node `ws` 库；CDP 客户端要自己手写 id→Promise 映射，约 80 行代码。
- 不动 `bright-data-service.ts` 里 Web Unlocker 的部分，避免回归 `sg_case` 这个已经能跑通的链路。

## 不做的事

- 不写 raw TLS + 手搓 WebSocket frame（你之前否决过类似复杂度的方案）
- 不接 Firecrawl（你明确要求继续用 Bright Data）
- 不改 Bright Data zone 类型（Browser API 就是对的）
