# Minoxpak

Storefront website for Minoxpak minoxidil spray for hair loss and hair regrowth.

The site is a single static page: `index.html` (inline CSS and JavaScript, no build step).

## Run locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## How orders work

The checkout form builds an order message and opens WhatsApp to +92 310 3699935 with it filled in. The customer presses send, and the order is confirmed by replying there.

At the same time the order is saved to a Google Sheet, so it is not lost if the customer never presses send. The sheet also lists customers due to reorder each morning. Setup: `google-sheet/README.md`.

## Settings

Everything you switch on lives in `config.js`: the order sheet URL, Google Analytics ID, Meta Pixel ID, DRAP number and the pay-now discount. Empty values stay switched off.

## Files

- `index.html`: the store (inline CSS and JavaScript)
- `bottle3d.js`: the 3D bottle in the hero
- `bottle-men.webp`, `bottle-women.webp`: still renders of that bottle, used on plan cards, in the cart and as the hero fallback
- `config.js`: settings (see above)
- `analytics.js`: loads Google Analytics and the Meta Pixel when their IDs are set
- `google-sheet/`: the Apps Script that saves orders and finds reorder reminders
- `minoxidil-*.html`, `pages.css`: guide pages for Google (5% vs 2%, side effects, price, beard)
- `policies.html`: shipping, returns and privacy
- `favicon.svg`, `og-image.jpg`, `robots.txt`, `sitemap.xml`: icons, link preview and search engine files

## Still to confirm before launch

- Product prices, sizes and bundles, and that 6 sprays of the real pump equal 1 mL
- Logo and real product photos
- The derma roller add-on price (Rs. 1,500) and whether women should get a 6 month pack
- DRAP registration and pharmacy licence details
- The shipping, returns and privacy terms in `policies.html`
- Real customer reviews (the sample reviews were removed)
- A real domain: the canonical, sitemap and link preview addresses use `minoxpak.onrender.com`
- Analytics: add the GA4 and Meta Pixel IDs to `config.js`
- Courier: turn on "open parcel before payment" with the courier, since the site promises it
- Prices also appear in `minoxidil-price-pakistan.html` and the product schema in `index.html`; update them together
