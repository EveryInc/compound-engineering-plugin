import { quote } from "../rates.js"

export function checkoutPage(_req, res) {
  res.send(`<h1>Checkout</h1>
<form method="post" action="/checkout">
  <label>Postcode <input name="postcode"></label>
  <button>Get shipping quote</button>
</form>`)
}

export async function submitCheckout(req, res) {
  const result = await quote({ postcode: req.body.postcode, weight_grams: 500 })
  if (!result.ok) return res.status(502).send(`<p class="error">Shipping unavailable: ${result.error}</p>`)
  res.send(`<h1>Checkout</h1><p>Shipping: ${result.price} USD</p>`)
}
