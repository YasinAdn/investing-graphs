# InvestGraph — Regal Dark Investing & Savings Studio

Multi-page investing & savings calculator with a **Regal Dark** (obsidian & champagne gold) theme, **100% live market feeds** (no dummy/test quotes), **GSAP chart & KPI animations**, **Three.js 3D Pillars View**, and **18 popular currencies including PKR**.

## Dedicated Pages

1. **Savings Calculator (`index.html`)** — Grow My Savings vs. Inflation Purchasing Power, **Reach a Money Goal** reverse monthly calculator, and collapsible Year-by-Year table.
2. **Pakistan Stocks — PSX (`psx.html`)** — Live PSX indices (`KSE100`, `KMI30`, `KSE30`), market status, 11 live PSX companies with real 1-year % & dividend yield from `dps.psx.com.pk`, and PSX growth projector.
3. **US Stocks — NASDAQ (`nasdaq.html`)** — Live historical price graphs (`1D`–`5Y`) for `NASDAQ-100`, `QQQ`, `S&P 500`, `NVDA`, `AAPL`, `MSFT` converted into your currency, plus future monthly growth calculator.
4. **Crypto (`crypto.html`)** — 1-second real-time Binance WebSocket price stream and historical charts (`1D`–`5Y`) for `BTC`, `ETH`, `SOL`, `BNB`, `XRP` in your selected currency, plus monthly buying simulator.
5. **Currencies & FX (`currencies.html`)** — Live historical exchange-rate graphs (`USD→PKR`, `AED→PKR`, `GBP→PKR`, `EUR→PKR`, etc.) and live converter across 18 currencies.
6. **Compare All (`compare.html`)** — Side-by-side comparison of Savings, PSX, NASDAQ, and Crypto with 1-click starter mixes and live 5-year return sync.

## Deploying to Vercel

This folder is ready for zero-config Vercel deployment (`vercel.json` + `/api/live/all.js` + `/api/live/history.js`, Node `>=18` with zero npm dependencies):

1. Deploy directly from `investing-graphs/`:
   ```bash
   cd investing-graphs
   npx vercel --prod
   ```
   Or import the repository in the Vercel dashboard and set **Root Directory** to `investing-graphs`.
2. On Vercel, `/api/live/all` and `/api/live/history` run as serverless functions (auto-polling every 5s for live PSX, NASDAQ & FX), while **Binance WebSocket** streams 1-second live crypto updates directly in the browser.

## Running Locally

```bash
cd investing-graphs
npm start
```

Open [http://localhost:4173](http://localhost:4173) (or double-click `start.bat` on Windows).

## Running Tests

```bash
npm test
```
