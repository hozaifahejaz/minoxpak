# Minoxpak

Storefront website for Minoxpak minoxidil spray for hair loss and hair regrowth.

The site is a single static page: `index.html` (inline CSS and JavaScript, no build step).

## Run locally

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## How orders work

There is no backend. The checkout form builds an order message and opens WhatsApp to +92 310 3699935 with it filled in. The customer presses send, and the order is confirmed by replying there. Nothing is stored on a server.

## Files

- `index.html`: the store (inline CSS and JavaScript)
- `bottle3d.js`: the 3D bottle in the hero
- `bottle-men.webp`, `bottle-women.webp`: still renders of that bottle, used on plan cards, in the cart and as the hero fallback
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
- Analytics: events are pushed to `window.dataLayer`, but no tag manager or pixel is installed yet
