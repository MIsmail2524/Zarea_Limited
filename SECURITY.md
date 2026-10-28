# Security — Zarea platform

Built with the hardening learned from the Wahdat review, and verified by `tests/api.test.js` (run `npm test`).

| Threat | Control | Test |
|---|---|---|
| Unauthenticated DoS via malformed URL/cookie | Guarded decoding; strict session-id format; last-resort error handler per request | `malformed URL and cookie do not crash the server` |
| Path traversal | Separator-aware root check, null-byte rejection | `path traversal is blocked` |
| CSRF | JSON-only API (`415` otherwise), Origin must match Host on writes, `SameSite=Strict` cookies | `CSRF: non-JSON and cross-origin writes are rejected` |
| Clickjacking / XSS impact | Strict CSP (`script-src 'self'`, no inline scripts), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, COOP, Referrer-Policy, Permissions-Policy, HSTS in production | `security headers present` |
| Stored XSS | All user data rendered via HTML escaping; AI replies rendered as text/tables, links restricted to same-origin paths | `stored XSS payloads…` |
| IDOR / broken access control | Every buyer/supplier query scoped by owner id; role checks on all admin routes | `role and ownership checks (IDOR)` |
| Privilege escalation at sign-up | Only `buyer`/`supplier` roles accepted | `register enforces password policy…` |
| Credential attacks | scrypt hashing, dummy-hash timing equalisation, per-account lockout (5 → 15 min), per-IP login limits, password policy | `login: no user enumeration, lockout…` |
| Session fixation / theft | New 192-bit id on login, old one destroyed; HttpOnly; `__Host-` + Secure in production | — |
| Business-logic abuse | MOQ, credit limit, KYC-gated credit/bidding/listings, order state machine (vehicle required to dispatch, cancel only before dispatch), RFQ award once | `buyer checkout…`, `RFQ → bid → award…` |
| Data leakage via public tracking | Tracking returns status and dates only — no prices, names, phones or vehicles | `public tracking leaks no private data` |
| CSV/formula injection | Formula-prefixed cells neutralised, all cells quoted | `CSV export neutralises formula injection` |
| Resource exhaustion | 64 KB body limit, header/request timeouts, rate limits per bucket, bounded maps with cleanup | `oversized body rejected` |
| Default credentials in production | Demo users not seeded when `NODE_ENV=production`; admin password from `SEED_ADMIN_PASSWORD` or random | — |

## Production checklist
- HTTPS + `NODE_ENV=production`; set `SEED_ADMIN_PASSWORD`; rotate after first login.
- Move sessions to Redis/Postgres for multiple instances; add 2FA for admin and suppliers.
- Store KYC documents in private object storage with signed URLs; malware-scan uploads.
- Centralised logs and alerting on spikes of 401/403/429.
