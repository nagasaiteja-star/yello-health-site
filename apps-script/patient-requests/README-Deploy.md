# Yello Patient Requests — deploy (≈5 min, signed in as dr.nagasaiteja@yello.health)

Every "booking" on yello.health is a **request**: nothing is booked or charged online. Requests land in a Sheet, you get an email for each one, and the team calls to confirm the time, the partner centre and the final price.

1. Create a Google Sheet named **Yello Patient Requests**. Open **Extensions → Apps Script** and paste `Code.gs`.
2. In the editor, select `setup` and click **Run**. Approve the permissions (Sheets, Drive, mail). This creates the tabs Bookings, Prescriptions, Contact and Subscribers, plus a Drive folder for prescriptions. Alerts go to **dr.nagasaiteja@yello.health** (partners@yello.health is a group that also delivers to Teja and Kiran); change `ALERT_EMAIL` under Script properties to send them elsewhere.
3. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Access: Anyone*. Copy the `/exec` URL.
4. Paste it into `assets/leads-config.js` as `LEADS_API`, then commit and push (ask Teja before pushing).

Until step 4 is done, every form on the site tells people to call or WhatsApp +91 99599 53699 instead. No request is silently lost.

Working the queue: set the `status` column (new → called → confirmed / not interested) as the team works through requests.
