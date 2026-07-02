# PayPal 集成方案:按案件一次性付费解锁分析

## 集成位置(推荐)

在 `/analysis/$disputeId` 分析结果页设置付费墙,而不是提交表单前。

理由:
- 用户填完 3 步向导 + 上传证据后,转化率最高
- 后台已经跑完完整 AI 分析,前端"遮罩"高价值内容即可
- 免费预览建立信任:展示"胜算强/中/弱" + 引用法条数量,隐藏正文
- 一次性付费,无订阅管理复杂度

## 用户流程

```text
Wizard(免费) → 提交 → AI 分析(免费,后台运行)
        ↓
分析页免费层:
  ✓ 结论摘要
  ✓ 法条名称
  ✗ 法条正文/金额计算/申诉信正文 (blur)
        ↓
点击解锁 → PayPal Smart Buttons(一次性)
        ↓
capture 成功 + webhook 兜底 → disputes.paid=true
        ↓
分析页刷新 → 全部解锁
```

## 技术方案

### 1. 数据库
- `disputes` 加列:`paid boolean default false`, `paid_at timestamptz`
- 新表 `payments`(user_id, dispute_id, paypal_order_id unique, amount_cents, currency, status, raw_payload jsonb)
- RLS + GRANT:用户只 SELECT 自己的;写入只走 service_role

### 2. 后端
- `createOrder` server fn(`requireSupabaseAuth`):校验 dispute 归属 → 调 PayPal `POST /v2/checkout/orders` → 返回 order_id
- `captureOrder` server fn(`requireSupabaseAuth`):调 `capture` → 写 `payments` + 更新 `disputes.paid`
- `/api/public/paypal-webhook` server route:验签(`/v1/notifications/verify-webhook-signature`) → 事件 `PAYMENT.CAPTURE.COMPLETED` 幂等入库

### 3. 前端
- `PaywallGate.tsx`:未付费时 blur + CTA
- `PayPalCheckoutButton.tsx`:用 `@paypal/react-paypal-js`,`createOrder` / `onApprove` 调 server fn
- 修改 `analysis.$disputeId.tsx`:读 `paid` 字段,包住 3 个高价值区块;capture 后 `router.invalidate()`

### 4. Secrets(实施阶段用 `add_secret` 打开安全表单)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_ENV`(`sandbox` / `live`)

### 5. 定价
默认 USD $9.90 / 案件,金额与币种存 DB 便于后续本地化。

## 明确不做
- 订阅 / 会员 / 次卡
- 平台代收商家退款转付用户(合规复杂)
- 提交前付费墙(伤转化)
- 改动 AI 分析本身

## 需要你确认

1. 单价 **$9.90** 可以吗?
2. **PayPal Business 账号 + Developer App** 你已经有了吗?没有的话,进 build 后我先给申请步骤再让你填 secret。

这两点回 OK 就开工。