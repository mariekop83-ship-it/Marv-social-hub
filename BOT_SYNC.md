# Telegram bot and website are intentionally separate

Mar Social Hub website is a standalone website with its own customer accounts, MySQL wallet, transactions, inventory and purchase history. It does not link or synchronize these records with the Telegram bot. The supplied bot.py was inspected only to reuse provider names/API details where relevant.

The Telegram bot configured in Admin > Website Settings is used only as a payment notification destination. On wallet payment submission, the website attempts to send the payment amount, customer and transfer details, and the uploaded receipt to the configured Telegram chat. This is a one-way notification; it does not link customer accounts, approve payments, change wallet balances, or sync inventory/history.

The website admin panel remains the source of truth for manual payment approval. Every deposit stays Pending until an administrator checks the transfer and approves or rejects it. Approval credits the website wallet and records a transaction. Rejection does not credit the wallet.
