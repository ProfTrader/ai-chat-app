import type { ResearchDoc } from "@/types";

/**
 * Tradeify research corpus — competitive, product, support/tech, and help-desk
 * analysis gathered from the web via the Exa MCP on 2026-06-30.
 *
 * Figures (pricing, drawdown, payout caps) reflect Tradeify 3.0 as of mid-2026
 * and the firm adjusts them frequently — always re-verify against the live site
 * / Help Center before quoting to a client. Sourced from Tradeify's own Help
 * Center and site plus third-party review/comparison sites.
 */

// The competitive/product/support corpus lives with the Risk Team, who run the
// drawdown and breach-policy comparisons against the client (Tradeify). This id
// must match a real seeded project (see TEAM_PROJECTS in data-store.ts) or the
// per-project research filter in chat-session-provider drops every doc.
const PROJECT_ID = "proj-risk";
const INGESTED_AT = "2026-06-30T00:00:00.000Z";

type SeedInput = Omit<
  ResearchDoc,
  "id" | "projectId" | "source" | "createdAt" | "updatedAt"
>;

const docs: SeedInput[] = [
  // ───────────────────────── PRODUCT ─────────────────────────
  {
    kind: "product",
    entity: "Tradeify",
    title: "Product line overview — Lightning, Growth & Select",
    summary:
      "Tradeify (Tradeify Holdings, Corp., Boca Raton FL; founded Jun 2024, formerly linked to Leeloo) is a US futures prop firm offering three routes to a simulated funded account: Lightning Funded (instant, no evaluation), Growth (one-step eval), and Select (one-step eval, newest/best, launched Dec 2025). All funded accounts are simulated but payouts are real cash. Account sizes $25K–$150K; 90/10 profit split from the first payout; no activation fees; EOD trailing drawdown at every stage.",
    content:
      "## Three product lines (all one-time purchase under Tradeify 3.0, no recurring subscription, no activation fee)\n\n" +
      "- **Lightning Funded** — direct-to-sim-funded, pay a one-time fee, skip the evaluation. Sizes $25K/$50K/$100K/$150K. Indicative one-time fees ~$345–$796. For experienced traders who reliably pass evals and want to remove friction.\n" +
      "- **Growth** — original one-step evaluation track. Daily loss limit + EOD trailing drawdown; no consistency rule during eval, 35% consistency once funded. Sizes $50K/$100K/$150K (no $25K).\n" +
      "- **Select** (launched Dec 2025, the flagship) — single-phase eval, 40% consistency rule, minimum 3 trading days, **no daily loss limit during eval**. After passing, choose **Select Flex** (5 winning days → withdraw up to 50% of profit, higher caps, no DLL, no funded consistency) or **Select Daily** (daily payouts, has a DLL). The 'evaluate first, choose payout model later' structure is a genuine differentiator.\n\n" +
      "## Shared economics\n" +
      "- Profit split **90/10** from the first payout across all sim-funded lines.\n" +
      "- **EOD trailing drawdown** everywhere (vs intraday at Apex/TPT) — the single biggest structural advantage Tradeify markets.\n" +
      "- **No activation fee** to convert a passed eval to funded (competitors charge $130–$349).\n" +
      "- Advanced plan discontinued for new purchases Dec 2025 (existing holders can still reset/renew).\n" +
      "- Marketed capital 'up to $750K' = 5 × $150K accounts.",
    sourceUrl: "https://propfirmhero.com/prop-trading-firms/futures/tradeify",
    tags: ["tradeify", "products", "lightning", "growth", "select", "pricing"],
  },
  {
    kind: "product",
    entity: "Tradeify",
    title: "Select evaluation & funded paths (Flex vs Daily)",
    summary:
      "Select is Tradeify's newest one-step evaluation: 40% consistency rule, min 3 trading days, no daily loss limit during eval — only EOD trailing drawdown. After passing, the trader permanently picks Select Flex (5 winning days, no DLL, no funded consistency, withdraw up to 50% of profit subject to per-account cap) or Select Daily (daily payout eligibility, has a DLL and 35% funded consistency).",
    content:
      "## Select evaluation (same for all sizes)\n" +
      "- **40% consistency rule**: no single day's profit may exceed 40% of total profit accumulated to the payout/activation date — mathematically forces a 3-day minimum.\n" +
      "- Only risk rule during eval is **EOD trailing drawdown** (no separate daily circuit breaker).\n" +
      "- Indicative eval params: $50K → target $3,000 / drawdown $2,000 / 6 minis (60 micros); $100K → $6,000 / $3,000 / 12 minis; $150K → $9,000 / $4,500 / 15 minis.\n\n" +
      "## After passing — choose ONE funded path (permanent for that account)\n" +
      "| Feature | Select Flex | Select Daily |\n" +
      "| --- | --- | --- |\n" +
      "| Payout frequency | After 5 winning days | Daily |\n" +
      "| Daily loss limit | None | Yes |\n" +
      "| Funded consistency | None | 35% |\n" +
      "| Drawdown | EOD trailing | EOD trailing |\n" +
      "| Profit split | 90/10 | 90/10 |\n" +
      "| Withdraw | up to 50% of total profit, per-account cap (e.g. ~$3,000 on $50K) | daily, lower caps |\n\n" +
      "After the first Flex payout, each subsequent payout requires the balance to be higher than at the previous request (even by $1). Select Flex is widely reviewed as the cleanest funded futures account in the market.",
    sourceUrl:
      "https://help.tradeify.co/en/articles/12853921-select-evaluation-accounts",
    tags: ["tradeify", "select", "flex", "daily", "evaluation", "consistency"],
  },
  {
    kind: "product",
    entity: "Tradeify",
    title: "Tradeify 3.0 changes & Elite live-capital path",
    summary:
      "Tradeify 3.0 (shipped Jun 2026) moved all plans to one-time purchase (no subscriptions), added new platforms and risk tools, and introduced Performance Reward Pools on the Elite live path. After 3 approved payouts on one account (or 10 across accounts) a trader can transition to Tradeify Elite — real live capital with reward pools up to $18,000 per account (with Select multiplier).",
    content:
      "## Tradeify 3.0 (June 2026, 'biggest overhaul')\n" +
      "- **Subscriptions gone** — every plan is a one-time purchase fee.\n" +
      "- Select & Growth saw a ~3% price increase across site/checkout/partner integrations.\n" +
      "- New platforms, automation, and risk tools; redesigned experience.\n\n" +
      "## Tradeify Elite (live capital)\n" +
      "- Qualify by hitting **3 approved payouts on a single account** (or 10 across multiple).\n" +
      "- **Performance Reward Pool** per account on transition to live: $25K→$2,000, $50K→$4,000, $100K→$8,000, $150K→$12,000 (standard); with Select plan multiplier up to $3,000 / $6,000 / $12,000 / $18,000.\n" +
      "- Each account has an independent pool; breached accounts forfeit the remainder. 5 × $150K = up to $60K–$90K total reward pool.\n\n" +
      "## Live Funded payout policy (distinct from sim)\n" +
      "- Starting-balance withdrawals staged (50% after 10 traded days / 5 days >$200 profit; 100% after 30 days >$200) at 90/10.\n" +
      "- Above starting balance: daily requests, rolling 24h, $250 min, **80/20** split.\n" +
      "- Profit Target $15,000 above starting balance unlocks a Merit Account (up to 5 live accounts); Merit payouts at 70/30 once $3,000 profit reached.",
    sourceUrl:
      "https://tradeify.co/post/tradeify-3-0-here-and-everything-just-changed",
    tags: ["tradeify", "tradeify-3.0", "elite", "live-funded", "reward-pool"],
  },

  // ───────────────────────── COMPETITOR ─────────────────────────
  {
    kind: "competitor",
    entity: "Topstep",
    title: "Topstep vs Tradeify",
    summary:
      "Topstep (founded 2012, Chicago) is the oldest, most brand-recognized futures prop firm — cheapest entry (~$49/mo for 50K), simplest rules, EOD trailing drawdown, and a strong educational reputation. It enforces a consistency rule (Topstep does; Tradeify Select eval does too at 40%). Topstep's split is 100% on the first $5K then 90/10; payouts are weekly. Tradeify counters with instant funding, one-time pricing, and far faster (daily/sub-hour) payouts.",
    content:
      "## Topstep snapshot\n" +
      "- Founded 2012, Chicago — longest track record, highest brand trust, best for beginners/discipline-building.\n" +
      "- 50K Combine ~$49–$165/mo depending on source/promo; profit target $3,000 (50K); $1,000 daily loss limit (static); EOD trailing drawdown.\n" +
      "- Consistency rule on eval (40–50% of target); min ~5 trading days.\n" +
      "- Split: 100% on first $5K–$10K then 90/10; payout cadence weekly (5 winning days standard / 3 days + 40% on consistency path).\n" +
      "- Platforms: NinjaTrader / Tradovate / TradingView.\n\n" +
      "## vs Tradeify\n" +
      "- **Tradeify wins**: instant funding (no eval option), one-time pricing, daily/sub-hour payouts, $250 min withdrawal, EOD trailing everywhere.\n" +
      "- **Topstep wins**: brand credibility, cheapest monthly entry, educational structure, longest history.\n" +
      "- Both use EOD trailing drawdown — similar risk feel during the day.",
    sourceUrl:
      "https://comparepropfirms.com/tradeify-vs-apex-trader-funding-vs-topstep-head-to-head-comparison-2026/",
    tags: ["competitor", "topstep", "comparison", "pricing", "payouts"],
  },
  {
    kind: "competitor",
    entity: "Apex Trader Funding",
    title: "Apex Trader Funding vs Tradeify",
    summary:
      "Apex (founded 2021) is the largest futures prop firm by volume, known for aggressive 80–90%-off discounts, account stacking (up to 20 accounts / $300K+), and the most generous split threshold — 100% on the first $25K then 90/10. Post-March-2026 overhaul: one-time payments, choice of EOD or intraday drawdown, 50% consistency rule, MAE rule removed. Payouts are slower (8 trading days). Tradeify differentiates on instant funding, EOD-only simplicity, and daily/fast payouts.",
    content:
      "## Apex snapshot\n" +
      "- Founded 2021; largest by trader volume; frequent 80–90% off eval promos.\n" +
      "- March 2026 overhaul: one-time payments (vs monthly), **choice of EOD or intraday** drawdown, 50% consistency (loosened from 30%), MAE rule removed.\n" +
      "- 50K eval often ~$147 (heavily discounted); target $3,000; no daily loss limit (trailing only); funded fee ~$85/mo.\n" +
      "- Split **100% on first $25K** then 90/10 (best first-tier threshold); payout after 8 trading days + consistency; $500 min.\n" +
      "- Account stacking: up to 20 accounts; allows automated strategies.\n\n" +
      "## vs Tradeify\n" +
      "- **Apex wins**: highest 100% split threshold ($25K), massive account stacking, deepest discounts, account sizes up to $300K.\n" +
      "- **Tradeify wins**: instant funding, EOD-only (Apex's legacy intraday trailing is harsher), much faster payouts (daily vs 8-day), no activation fee.",
    sourceUrl:
      "https://comparepropfirms.com/tradeify-vs-apex-trader-funding-vs-topstep-head-to-head-comparison-2026/",
    tags: ["competitor", "apex", "comparison", "drawdown", "account-stacking"],
  },
  {
    kind: "competitor",
    entity: "Take Profit Trader",
    title: "Take Profit Trader (TPT) vs Tradeify",
    summary:
      "Take Profit Trader (founded 2021, Windermere FL) runs a simple one-step 'Test' (6% target, 5 min trading days), pays out daily from day one (24–48h, among the fastest alongside Tradeify), and has the widest platform support. Watch-outs: PRO split is only 80/20 (need PRO+ for 90/10), a $130 activation fee on moving to PRO, news-trading restrictions, no overnight holds, and intraday trailing drawdown on funded PRO accounts. Tradeify counters with EOD trailing on funded accounts and overnight holds.",
    content:
      "## TPT snapshot\n" +
      "- Founded 2021, Windermere FL; one-step 'Test' (6% target, 5 winning days), no consistency rule on standard plans.\n" +
      "- Daily payouts from day one (24–48h turnaround) — fastest tier alongside Tradeify.\n" +
      "- Split 80/20 (PRO) → 90/10 (PRO+, unlocked on performance, not purchase); **$130 activation fee** to move to PRO.\n" +
      "- Drawdown: EOD on eval, **intraday on funded PRO** (harsher); news trading restricted (1–2 min buffer); no overnight holds.\n" +
      "- Widest platform support (NinjaTrader, Tradovate, TradingView, Sierra Chart, Quantower, 10+).\n" +
      "- Note: BBB has shown a 'Pattern of Complaints' alert — review payout terms carefully.\n\n" +
      "## vs Tradeify\n" +
      "- **TPT wins**: widest platform list, high-variance-friendly (no consistency on standard).\n" +
      "- **Tradeify wins**: EOD trailing on funded (TPT goes intraday), overnight holds allowed, no activation fee, choose-your-payout-model (Select).",
    sourceUrl:
      "https://futuresproptrading.com/comparisons/",
    tags: ["competitor", "take-profit-trader", "tpt", "payouts", "drawdown"],
  },
  {
    kind: "competitor",
    entity: "MyFundedFutures",
    title: "MyFundedFutures (MFFU) vs Tradeify",
    summary:
      "MyFundedFutures (founded 2023) is frequently rated best overall value — no activation fee, next-business-day payouts via RiseWorks, and three plans (Core cheapest ~$77–97/mo, Rapid best 90/10 split, Pro highest caps). It offers generous drawdown room (e.g. $2K on 50K Starter) and clean static/EOD rules depending on plan. Tradeify's edge is instant funding, the Select choose-later model, and same-day/sub-hour payouts.",
    content:
      "## MFFU snapshot\n" +
      "- Founded 2023; retired Starter/Expert/Milestone in Jul 2025 → **Core / Rapid / Pro**.\n" +
      "- No activation fee (removed Jul 2025); no daily loss limit on any plan; overnight holds allowed.\n" +
      "- 50K eval ~$77–$97/mo (Core); target ~6–8%; drawdown ~$1.5K–$2K depending on plan (Core EOD, Rapid intraday, Pro EOD).\n" +
      "- Split: 80/20 (Core) / 90/10 (Rapid) / 80/20 (Pro); payout cadence 5 winning days (Core/Rapid) or 14 days (Pro); next-business-day processing via RiseWorks.\n" +
      "- Multi-account: 5 funded $50K, 3 funded $100K/$150K.\n\n" +
      "## vs Tradeify\n" +
      "- **MFFU wins**: high Trustpilot, best-value monthly pricing, generous drawdown room, plan flexibility.\n" +
      "- **Tradeify wins**: instant funding option, one-time purchase (no monthly), Select 'evaluate-then-choose' payout model, sub-hour payouts.\n" +
      "- Both use RiseWorks-style processors and skip activation fees.",
    sourceUrl: "https://traderssecondbrain.com/guides/best-futures-prop-firms",
    tags: ["competitor", "myfundedfutures", "mffu", "value", "payouts"],
  },
  {
    kind: "competitor",
    entity: "Futures prop firm market",
    title: "Competitive landscape & Tradeify positioning (2026)",
    summary:
      "In the 2026 futures prop market, common positioning: Topstep = beginners/brand, Apex = cost & account stacking, MyFundedFutures = drawdown room/value, Take Profit Trader = fast payouts/flexibility, Tradeify = instant funding + daily/sub-hour payouts + EOD-everywhere. Tradeify's verified payouts cited at $125M–$250M+, ~4.6–4.7 Trustpilot. Its durable differentiators are one-time pricing, no activation fee, EOD trailing at all stages, and the Select choose-your-payout model.",
    content:
      "## Where each firm 'wins' (per multi-firm comparisons)\n" +
      "- **Topstep** — beginners, cleanest rules, brand credibility.\n" +
      "- **Apex** — cost (deep discounts), account stacking (up to 20), 100% first-$25K split.\n" +
      "- **MyFundedFutures** — drawdown room, best monthly value, plan choice.\n" +
      "- **Take Profit Trader** — fast daily payouts, widest platform support, high-variance flexibility.\n" +
      "- **Tradeify** — instant funding, daily/sub-hour payouts, EOD trailing everywhere, Select choose-later model.\n\n" +
      "## Tradeify's defensible differentiators\n" +
      "1. **EOD trailing drawdown at every stage** (eval → funded → Elite), vs intraday trailing at Apex/TPT funded.\n" +
      "2. **One-time purchase, no subscriptions, no activation fee** (Tradeify 3.0).\n" +
      "3. **Select** 'pass first, choose Flex vs Daily later' — unique payout-model flexibility.\n" +
      "4. **Speed**: payouts in minutes/hours incl. weekends; $250 min; advertised 0% payout denial rate.\n" +
      "5. **Clear path to live capital** (Elite) with Performance Reward Pools.\n\n" +
      "## Trust signals\n" +
      "- Verified payouts cited $125M–$250M+; Trustpilot ~4.6–4.7 (160+ reviews); CEO Brett Simberkoff; founded Jun 2024.",
    sourceUrl: "https://tradetanto.com/learn/futures-prop-firm-comparison",
    tags: ["competitor", "landscape", "positioning", "differentiators"],
  },

  // ───────────────────────── SUPPORT / TECH ─────────────────────────
  {
    kind: "support_tech",
    entity: "Tradeify",
    title: "Supported platforms & broker connections",
    summary:
      "Tradeify routes through three broker connections chosen at checkout — Tradovate, Rithmic, and WealthCharts — and you're locked to that broker's platform ecosystem until you buy a new account (all three cost the same). Tradovate (default) unlocks Tradovate web/mobile + NinjaTrader + TradingView; Rithmic unlocks TradeSea, Quantower, Sierra Chart, R|Trader; WealthCharts unlocks its native platform. Account metrics (balance, drawdown, P&L) update in real time on the Tradeify dashboard.",
    content:
      "## Broker → platform map (pick ONE broker at checkout)\n" +
      "- **Tradovate** (default, cloud-first) → Tradovate Web/Desktop/Mobile, **NinjaTrader 8**, **TradingView** (via Tradovate add-on), Group Trading for multi-account.\n" +
      "- **Rithmic** (low-latency, scalpers/order-flow) → **TradeSea**, **Quantower**, **Sierra Chart**, **R|Trader Pro**.\n" +
      "- **WealthCharts** → WealthCharts native platform (visual strategy, trade copier, research); added Feb 22, 2026.\n\n" +
      "## Key rules\n" +
      "- All three brokers cost the same — no platform surcharge.\n" +
      "- One broker = its full platform lineup; switching brokers requires buying a new evaluation account (no mid-eval swaps).\n" +
      "- **NinjaTrader** charting/order entry works on sim via Tradovate creds; NinjaTrader **Brokerage** (real CME execution) is gated to Elite Live (after 3 payouts on one account / 10 across).\n" +
      "- **ProjectX was discontinued** at Tradeify on Feb 28, 2026 (Topstep exclusivity).\n" +
      "- Data flows from CME/CBOT/NYMEX/COMEX through the broker to the front-end terminal.",
    sourceUrl:
      "https://help.tradeify.co/en/articles/10468221-supported-platforms",
    tags: ["support", "platforms", "tradovate", "rithmic", "wealthcharts", "brokers"],
  },
  {
    kind: "support_tech",
    entity: "Tradeify",
    title: "Platform setup — Tradovate, NinjaTrader & TradingView + data agreement",
    summary:
      "Tradeify issues Tradovate credentials at activation (login at trader.tradovate.com). The #1 setup mistake is connecting NinjaTrader/TradingView before signing Tradovate's Non-Professional Data Agreement — without it, data is delayed 10+ min, charts go stale, and NinjaTrader/connections fail. After signing, wait ~10–15 min for data activation. NinjaTrader is downloaded via Tradeify's Tradovate trader-download page (not NinjaTrader.com), is Windows-only, and connects in 'Simulation' mode. TradingView connects via the Tradovate add-on; select Non-Professional status to avoid data fees up to ~$300/mo.",
    content:
      "## Tradovate (primary) first-time setup\n" +
      "1. Go to https://trader.tradovate.com/welcome and log in with Tradeify-issued Tradovate username/password.\n" +
      "2. **Sign the Non-Professional Data Agreement FIRST** — critical. Without it: 10+ min delayed data, stale charts, broken order execution, failed NinjaTrader connection.\n" +
      "3. Wait ~10–15 min for data permissions to activate.\n\n" +
      "## NinjaTrader 8\n" +
      "- Download from Tradeify's Tradovate trader-download page (NOT NinjaTrader.com).\n" +
      "- Connect using Tradeify Tradovate creds; select connection 'NinjaTrader'/Tradovate routing; **account type = Simulation**.\n" +
      "- Windows-only (Mac → Parallels/Boot Camp/VPS). Custom NinjaScript indicators supported (Tradovate's own indicator library is fixed).\n\n" +
      "## TradingView\n" +
      "- Enable the **TradingView add-on inside Tradovate settings**; authenticate with Tradeify creds; sign data agreement.\n" +
      "- Real-time data activation ~10–90 min; choose **Non-Professional** to avoid fees up to ~$300/mo.\n" +
      "- Two-way sync: trades placed in TradingView appear on Tradovate + Tradeify dashboards instantly.",
    sourceUrl:
      "https://help.tradeify.co/en/collections/11501719-trading-platforms-products",
    tags: ["support", "setup", "ninjatrader", "tradingview", "tradovate", "data-agreement"],
  },
  {
    kind: "support_tech",
    entity: "Tradeify",
    title: "TradeSea AI platform & automation policy",
    summary:
      "TradeSea is Tradeify's AI-powered, TradingView-style browser platform (launched Mar 24, 2026 with Tradeify 3.0), free during beta and free for Rithmic users. It runs on the Rithmic connection, has a separate login (app.tradesea.ai via Google/email OTP), and includes Polaris, Compass, and Station AI features plus a fast DOM, copy trading, and built-in risk controls. Tradeify explicitly allows personal automation bots; third-party routers like PickMyTrade send TradingView alerts to a Tradeify Tradovate account (~$50/mo flat).",
    content:
      "## TradeSea (Tradeify's AI platform)\n" +
      "- Launched **Mar 24, 2026** (Tradeify 3.0); browser-based (no install), at **app.tradesea.ai**.\n" +
      "- Sign in via Google or email OTP — **separate login** from Rithmic creds, but tied to the Rithmic connection on your account.\n" +
      "- Free during beta / free for Rithmic users; TradingView-style charts, fast DOM, built-in risk controls, copy trading.\n" +
      "- AI features: **Polaris, Compass, Station**.\n\n" +
      "## Automation\n" +
      "- Tradeify **explicitly allows personal automation bots**.\n" +
      "- **PickMyTrade** integrates natively: add Tradeify (Tradovate) as broker, authenticate, generate webhook URL + JSON, paste into a TradingView alert. ~$50/mo flat across all your Tradeify accounts. Sub-second TradingView-alert → Tradovate-fill.\n" +
      "- Rithmic automation also supported (via Quantower/NinjaTrader where offered).",
    sourceUrl: "https://pickmytrade.trade/prop-firm-faq/tradeify-faq",
    tags: ["support", "tradesea", "automation", "ai", "pickmytrade", "rithmic"],
  },
  {
    kind: "support_tech",
    entity: "Tradeify",
    title: "Platform troubleshooting — connections, data feed & login",
    summary:
      "Tradeify's Help Center has a dedicated troubleshooting set: platform connection issues, data-feed/market-data problems (delayed quotes, missing data, disconnects, sync), and login/authentication errors. The recurring root cause for NinjaTrader/TradingView failures is the unsigned Tradovate Non-Professional Data Agreement; the standard fix is log into trader.tradovate.com first, sign the agreement, wait ~15 min, then reconnect in Simulation/Demo mode.",
    content:
      "## Common issue → fix\n" +
      "- **NinjaTrader won't connect to Tradovate creds** → log into trader.tradovate.com FIRST, sign the data agreement, wait ~15 min, reconnect, select 'Demo'/'Simulation' environment.\n" +
      "- **Delayed/stale quotes, missing data, feed disconnects** → almost always the unsigned data agreement or unactivated permissions; re-check non-professional status and allow activation time.\n" +
      "- **Login/auth errors** → use Tradeify-issued credentials from the dashboard (not self-created accounts); reset via Help Center login guide.\n\n" +
      "## Help Center troubleshooting collections\n" +
      "- Platform Connection Troubleshooting\n" +
      "- Data Feed Issues & Market Data Troubleshooting\n" +
      "- Login Troubleshooting Guide\n\n" +
      "Categories in Common FAQs: Account Management, Payouts & Profit Sharing, Trading Rules & Compliance, Platform & Technical, Account Types, Grand Cup, Tradeify Crypto.",
    sourceUrl: "https://help.tradeify.co/en/articles/12268494-common-faqs",
    tags: ["support", "troubleshooting", "data-feed", "login", "connection"],
  },

  // ───────────────────────── HELP DESK ─────────────────────────
  {
    kind: "help_desk",
    entity: "Tradeify",
    title: "Consistency rule explained",
    summary:
      "Tradeify's consistency rule caps how much any single trading day can contribute to total profit: 40% during the Select evaluation (forcing a 3-day minimum), and 35% on Growth/Select-Daily funded accounts (resets after each approved payout). Example: if total profit is $5,000, the best single day must be ≤ $2,000 under a 40% rule. Select Flex funded accounts have no consistency rule.",
    content:
      "## How it works\n" +
      "- **No single day's profit may exceed X% of total profit** accumulated to the payout/activation date.\n" +
      "  - **Select evaluation: 40%** → mathematically requires ≥3 trading days to pass.\n" +
      "  - **Growth funded: 35%** (resets after each approved payout).\n" +
      "  - **Select Daily funded: 35%**; **Select Flex funded: none**.\n" +
      "- Example (40% rule, $5,000 total): best day ≤ $2,000.\n\n" +
      "## Why it exists\n" +
      "- Forces a real track record rather than a single lucky day; aligns with how Tradeify validates traders before live capital.\n" +
      "- Purpose is to build consistent habits, not to trap traders.",
    sourceUrl:
      "https://help.tradeify.co/en/articles/10468320-rules-consistency-rule",
    tags: ["help-desk", "rules", "consistency", "evaluation"],
  },
  {
    kind: "help_desk",
    entity: "Tradeify",
    title: "Trailing max drawdown (EOD) & hard breach",
    summary:
      "Tradeify uses End-of-Day (EOD) trailing max drawdown at all stages: the max-loss floor updates once per day at the 5 PM EST session close based on the highest EOD balance — intraday unrealized gains don't raise it. But touching the floor intraday is an immediate hard breach (account ends). The floor locks permanently once EOD balance reaches starting balance + max drawdown + $100, or when a payout is requested; after locking it becomes a static floor.",
    content:
      "## EOD trailing drawdown\n" +
      "- Floor recalculates **once per day at 5 PM EST** off your highest EOD balance — more room intraday than tick-by-tick (intraday) trailing used by some competitors.\n" +
      "- **Hard breach**: if your account *touches* the drawdown floor at any moment (e.g. 11 AM), you fail immediately — even if you'd have recovered by close.\n\n" +
      "## When the floor locks (becomes static)\n" +
      "- Automatically when **EOD balance ≥ starting balance + max drawdown + $100** (e.g. ~$52,100 on a $50K / $2,000-DD account; ~$52,600 on a $2,500-DD account), OR\n" +
      "- When you **manually request a payout** (locking is part of the payout process).\n" +
      "- Once locked, the floor never moves against you again, no matter how far the account drops.\n\n" +
      "Indicative funded drawdowns: $25K→$1,000, $50K→$2,000, $100K→$3,000–$4,000, $150K→$4,500–$6,000 (varies by line).",
    sourceUrl:
      "https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns",
    tags: ["help-desk", "rules", "drawdown", "eod", "hard-breach"],
  },
  {
    kind: "help_desk",
    entity: "Tradeify",
    title: "Payout policies & process (Rise)",
    summary:
      "Sim-funded payouts are 90/10 (trader/firm) with a $250–$1,000 minimum depending on account type and per-payout caps that scale with account size (e.g. ~$3K on $50K Select Flex, higher on $100K/$150K). Payouts process within minutes to ~24h, including weekends, via Rise (Tradeify's payout processor) — set up once, then subsequent payouts skip verification. Select Daily pays daily; Select Flex/Growth/Lightning pay after winning-day cycles. A pending payout can be lost if the account breaches drawdown before it's paid.",
    content:
      "## Profit split & minimums\n" +
      "- **90/10** on all sim-funded lines from the first payout (Live Funded above starting balance is 80/20; Merit 70/30).\n" +
      "- Minimum withdrawal ~$250 (some sources cite $500–$1,000 by account type).\n\n" +
      "## Caps & cadence\n" +
      "- Per-payout caps scale with size (e.g. ~$3,000 on $50K Select Flex; higher on $100K/$150K).\n" +
      "- **Select Daily** = daily; **Select Flex** = after 5 winning days, withdraw up to 50% of total profit; **Growth/Lightning** = 5-day cycles.\n" +
      "- After the first Flex payout, each next request needs a higher balance than the previous one.\n\n" +
      "## Process\n" +
      "1. Meet payout requirements, submit via the **Tradeify dashboard**.\n" +
      "2. Verify once with **Rise** (primary payout processor) via emailed link; subsequent payouts skip this.\n" +
      "3. Funds in minutes–24h, incl. weekends. Tradeify advertises a **0% payout denial rate**.\n\n" +
      "## Gotcha\n" +
      "- A submitted/approved payout is still **lost if the account breaches the drawdown floor before it's processed** — don't trade aggressively while a payout is pending.",
    sourceUrl: "https://proptradingvibes.com/blog/tradeify-faq",
    tags: ["help-desk", "payouts", "rise", "profit-split", "caps"],
  },
];

/** The Tradeify research corpus as fully-formed ResearchDoc rows. */
export const tradeifyResearchDocs: ResearchDoc[] = docs.map((doc, index) => ({
  ...doc,
  id: `research-tradeify-${String(index + 1).padStart(2, "0")}`,
  projectId: PROJECT_ID,
  source: "exa",
  createdAt: INGESTED_AT,
  updatedAt: INGESTED_AT,
}));
