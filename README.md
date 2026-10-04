# Taitech Market

Marketplace for buyers and suppliers in South Sudan. No dependencies: only Node.js 18+ is needed.

## Run in VS Code
1. Install Node.js from nodejs.org, then open this folder in VS Code (File > Open Folder).
2. Press F5 ("Run Taitech Market"), or run `npm start` in the terminal.
3. Open http://localhost:3000
## Deploy to GitHub + Render
1. Create a GitHub repository and push this project to it.
2. In Render, create a new Web Service and connect the GitHub repo.
3. Use the following settings:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Add env vars: `PORT=10000`, `DB_FILE=/var/data/taitech-market-db.json`
4. Enable a persistent disk on Render if you want buyer accounts and orders to survive redeploys.
5. After deployment, share the live URL Render gives you.

## What is included
- `server.js`: REST API with phone + password accounts (scrypt hashing, signed tokens), products, stock, orders and order status. Prices, bulk discounts, delivery fees and stock are all checked on the server.
- `public/index.html`: the shop, supplier hub, English/Arabic (RTL), dark mode.
- `public/sw.js` + `manifest.json`: the shell works offline and can be installed on a phone. Orders placed offline are queued and sent when the connection returns.
- `data/seed.json`: starting catalogue. `data/db.json` is created on first run (delete it to reset).

## Before real customers use it
1. **Payments**: edit `requestPayment()` in `server.js` and connect the MTN MoMo (Collections `requestToPay`) or Digicash merchant API. You need a merchant account with each provider. Until then orders are saved as "pending" and the buyer's transaction ID is shown to the supplier.
2. **Hosting**: browsers only install the app and cache offline over HTTPS. Deploy to a small VPS, Render or Railway, and put HTTPS in front.
3. **Database**: `db.json` is fine for a pilot. Move to PostgreSQL or SQLite when you have many users.
4. **Sample data**: replace the prices and delivery fees in `data/seed.json` and in `TOWNS` in `server.js`.
5. **Translations**: have native speakers review the Arabic and add other languages in the `TXT` and `AU` objects in `index.html`.

