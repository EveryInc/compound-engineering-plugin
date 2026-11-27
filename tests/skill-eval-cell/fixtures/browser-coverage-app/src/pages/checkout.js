import { charge } from "../payments.js"

export function checkoutPage(_req, res) {
  res.send(`<h1>Checkout</h1>
<form method="post" action="/checkout">
  <input name="card" placeholder="Card number">
  <input name="total" type="hidden" value="19.99">
  <button>Pay</button>
</form>`)
}

export async function submitCheckout(req, res) {
  const result = await charge({ card: req.body.card, amount: req.body.total })
  if (!result.ok) return res.status(402).send(`<p class="error">Payment failed: ${result.error}</p>`)
  res.send("<h1>Order placed</h1>")
}
