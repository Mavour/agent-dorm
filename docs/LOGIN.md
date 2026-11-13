# Login Dorm

Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` in `.env` to enable the Dorm login
page. These existing variables now supply the form credentials; browsers no
longer receive a native Basic Auth challenge. No extra dependency is required.

The checked **Ingat perangkat ini** option creates a persistent HttpOnly,
SameSite=Strict cookie for 30 days. With it unchecked, the browser gets a session
cookie and the server enforces an eight-hour maximum. Private browsing or deleting
site data requires signing in again. Use the same hostname when reopening Dorm.

Keep `.data/auth-sessions.json` across deployments and PM2 restarts. It contains
hashed random session identifiers, expiration times, and a salted account
fingerprint. Raw tokens and passwords are not saved there. The file is created
with mode 0600 on Linux; `.data/` is excluded from Git. Changing the configured
account invalidates all previous sessions. Use a single Node/PM2 instance with
this local session store.

**Keluar** revokes the current device's session on disk and closes its realtime
connection. Login failures are limited per client IP. WebSocket tickets are
short-lived, single-use, and tied to an unexpired session.

Use HTTPS for internet access, especially with Fintrack financial data. HTTPS
responses set Secure cookies. An HTTPS reverse proxy must forward the original
`Host`, `X-Forwarded-Proto`, cookies, and the `/ws` upgrade. If an existing reverse
proxy also enables `auth_basic`, disable that extra layer when switching to this
form login; otherwise its independent native dialog will still appear.

Validation covers persistent sessions across server restarts, expiration,
revocation, credential changes, forged tokens, cross-origin requests, brute-force
limits, and logout of active realtime connections. Responsive checks use mobile
and iPad viewport sizes in a browser; this is not a physical-device test.
