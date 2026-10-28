# Zarea Platform — next-generation B2B commodity marketplace

A working concept platform for **Zarea Limited** (PSX: ZAL). It covers everything zarea.com offers today, rebuilt with a stronger UI/UX, and adds the features that leading B2B marketplaces (IndiaMART, Udaan, OfBusiness, Infra.Market, Alibaba) use to win and keep buyers.

> Concept proposal. Cement, biomass, grains and sugar prices are taken from the zarea.com price board (28 Oct 2026); other prices, all supplier businesses, orders and price history are demo data.

See **[PROPOSAL.md](PROPOSAL.md)** for the audit of the current site, competitor benchmark and feature rationale, and **[SECURITY.md](SECURITY.md)** for the security review.

## Run

```bash
npm start          # http://localhost:3100
npm test           # 16 end-to-end + security tests
npm run reset      # wipe and reseed the database
```

Node.js ≥ 22.13. **Zero npm dependencies** — HTTP server, JSON API and SQLite (`node:sqlite`) are all built in.

### Demo accounts (seed data — never created in `NODE_ENV=production`)

| Role | Email | Password |
|---|---|---|
| Buyer (verified, Rs 25 Lac credit) | `buyer@demo.test` | `demo1234` |
| Buyer (unverified) | `newbuyer@demo.test` | `demo1234` |
| Supplier | `punjab@demo.test`, `margalla@demo.test`, `seaport@demo.test`, `indus@demo.test`, `greenfield@demo.test`, `sunline@demo.test` | `demo1234` |
| Admin | `admin@demo.test` | `admin123` |

Demo order to track: `ZR-DEMO01`.

## Features

### Parity with zarea.com (rebuilt)
| zarea.com today | This platform |
|---|---|
| 13 categories, brand filter, location select | Faceted search: category, brand, city, verified-only, sort, live text search |
| Daily price table ("Change" always 0; most categories "No Data") | Price board for every listing with 1/7/30-day change, sparklines, sorting, CSV download |
| Get a quote (ready-mix) | Full multi-supplier **RFQ bidding** with comparison and one-click award |
| Credit (biomass only, login before form) | **Zarea Credit for all categories**, instant public eligibility score, application, admin approval, credit line and dues |
| Zarea AI chat | Zarea AI answering from live data — prices, comparisons, trends, freight, construction estimates, credit, order tracking — in English **and Roman Urdu** |
| Become a supplier form | Supplier onboarding + full **supplier dashboard** (listings, price updates, RFQ inbox, order fulfilment) |
| Logistics "real-time tracking" (marketing copy) | Working freight calculator (4 truck types × 14 cities) and order tracking with dispatch vehicle and proof of delivery |
| Investor relations | FY26 highlights, growth bars, IPO facts, links to PSX and reports |

### New features proposed
- **Cart & checkout** that splits orders per supplier with freight per shipment.
- **Four payment options**: escrow (released on delivery), Zarea Credit, advance transfer, cash on delivery.
- **Delivered-cost calculator** on every product page.
- **Price alerts.** A buyer's alert triggers automatically when a supplier changes a price.
- **Project estimator (BOQ)**: covered area in, then cement, steel, bricks, sand and crush quantities priced live, and one click adds everything to the cart.
- **Ratings and reviews** after delivery. These feed the supplier's rating.
- **Buyer dashboard**: orders with a timeline, RFQ bid comparison, credit line, alerts and profile/KYC status.
- **Admin console**:
  - GMV by category
  - KYC verification queue
  - credit decisions
  - payment reconciliation
  - leads and supplier applications
  - CSV exports
- **Live price ticker** across the site, plus a home-page "market movers" table.
- **Public open-RFQ board** that shows demand to suppliers. Buyer identity stays private.

## Architecture

```
server.js   HTTP server, security middleware, JSON API (≈60 routes), static files
db.js       SQLite schema, seed catalogue (49 products, 6 suppliers), 90-day price history
ai.js       Zarea AI intent engine (prices, compare, trend, freight, BOQ, credit, tracking)
public/     17 pages, vanilla ES modules, one CSS design system
tests/      node:test suite — functional flows + attack cases
tools/      page scaffolder (shared <head>)
```

## Production roadmap
1. **Payments:** a JazzCash/Easypaisa/1LINK gateway and bank escrow partner.
2. **Lending partner:** an NBFC or bank, so credit decisions use the eCIB and Tasdeeq credit bureau.
3. **Notifications:** WhatsApp Business API for order, bid and alert notifications.
4. **Urdu UI and mobile app:** a full Urdu (RTL) interface, and a React Native app sharing this API.
5. **Fleet tracking:** GPS feeds from the in-house fleet funded by the IPO, shown as a live map in tracking.
6. **Documents:** sales-tax invoices and e-way documents as PDF, plus FBR integration.
7. **Real AI:** an LLM behind the existing `ai.js` contract, kept grounded on marketplace data.
8. **Infrastructure:** Postgres, Redis sessions, object storage for KYC documents, and an audit log.
