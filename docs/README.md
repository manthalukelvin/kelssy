# MyJournal+ PayPal + PayChangu Payment Backend

Ready-to-deploy files for secure PayPal (and compatible with your existing PayChangu) payments on Vercel.

## Folder structure

```
myjournal-paypal/
├── api/
│   ├── lib/
│   │   ├── firebase-admin.js   ← verifies Firebase ID tokens
│   │   └── paypal.js           ← PayPal Orders API helpers
│   └── payments/
│       ├── create-paypal.js    ← POST /api/payments/create-paypal
│       └── verify-paypal.js    ← POST /api/payments/verify-paypal
├── payment.html                ← updated frontend (PayChangu + PayPal)
├── payment-original.html       ← your original file (backup)
└── docs/
    └── README.md
```

## 1. Environment variables (Vercel)

Go to your Vercel project → **Settings → Environment Variables** and add:

| Name | Example | Notes |
|------|---------|-------|
| `PAYPAL_CLIENT_ID` | `Ae...` | From PayPal Developer Dashboard |
| `PAYPAL_CLIENT_SECRET` | `EL...` | From PayPal Developer Dashboard |
| `PAYPAL_MODE` | `sandbox` or `live` | Start with sandbox |
| `PAYPAL_CURRENCY` | `USD` | Optional, defaults to USD |
| `FIREBASE_PROJECT_ID` | `myjournal-plus` | Your Firebase project |
| `FIREBASE_SERVICE_ACCOUNT` | `{...}` | Full JSON of a Firebase service account (one line) |
| `APP_ORIGIN` | `https://myjournalplus.com` | Used for return/cancel URLs |
| `ALLOWED_ORIGIN` | `https://myjournalplus.com` | CORS (or `*` while testing) |

**Important:** After adding/changing any variable → **Redeploy**.

### How to get PayPal credentials

1. Go to https://developer.paypal.com/
2. Create / open an app (Sandbox first)
3. Copy **Client ID** and **Secret**

### How to get Firebase Service Account

1. Firebase Console → Project Settings → Service Accounts
2. Generate new private key
3. Copy the entire JSON content into the `FIREBASE_SERVICE_ACCOUNT` env var (as a single line or properly escaped)

## 2. Deploy the API files

Copy the `api/` folder into the **same Vercel project** that already hosts your PayChangu endpoints  
(currently `myjournalpluspaychangu.vercel.app`).

Your routes will become:

- `POST /api/payments/create-paypal`
- `POST /api/payments/verify-paypal`

(They sit next to your existing `create-paychangu` / `verify-paychangu`.)

## 3. Frontend

Replace your current `payment.html` with the one in this zip (`payment.html`).

It already points to:

```js
const API_BASE = 'https://myjournalpluspaychangu.vercel.app';
```

Change that value if your API host is different.

## 4. Security (same as PayChangu)

- Every request requires a valid **Firebase ID token** in the `Authorization: Bearer ...` header.
- The server verifies the token with Firebase Admin.
- The plan amount is decided **on the server** (never trusted from the client).
- On successful capture we write `premium: true` + plan to Firestore under the authenticated `uid`.

## 5. Test flow (Sandbox)

1. Set `PAYPAL_MODE=sandbox`
2. Redeploy
3. Open the payment page while signed in
4. Choose a plan → click **Pay with PayPal / Card**
5. Log in with a PayPal Sandbox buyer account
6. Approve the payment
7. You should be redirected back and Premium activated

## 6. Go live

1. Create a **Live** app in PayPal Developer Dashboard
2. Put the live Client ID + Secret in Vercel
3. Set `PAYPAL_MODE=live`
4. Redeploy

## Need help?

- Email: support@myjournalplus.com
- WhatsApp: +265 89 614 4664
