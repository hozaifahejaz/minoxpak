# Order sheet setup (about 10 minutes, once)

This saves every website order into a Google Sheet, even when the customer never presses Send in
WhatsApp, and every morning lists customers who are about to run out so you can remind them.

1. Go to sheets.google.com and create a blank sheet. Name it "Minoxpak orders".
2. In the sheet, open **Extensions → Apps Script**. Delete what is there and paste in all of `Code.gs`. Press Save.
3. In the function menu at the top, pick **setup** and press **Run**. Google asks you to allow access to
   your sheet and email: allow it (it says "unverified app" because you wrote it yourself; choose
   Advanced → Go to project).
4. Press **Deploy → New deployment**. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**. Press Deploy.
5. Copy the **Web app URL** (it ends in `/exec`) and put it in `config.js` as `orderEndpoint`, or send it to Claude.

## Using it

- Each new order arrives with status **New: check WhatsApp**. If the customer never sent the WhatsApp
  message, call or chat with them from the **Call or chat** link.
- Change the status as the order moves: Confirmed, Shipped, Delivered, Refused or Cancelled.
- **Reorder due** is set to 5 days before their supply runs out. Every morning at about 9 the
  **Reorder due** tab lists confirmed, shipped or delivered customers who are due, and you get an email.
  Press the link to open WhatsApp with the reminder written, send it, then tick **Reminder sent**.
- If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.
