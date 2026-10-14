function orderTotal(order) {
  let subtotal = 0
  for (let i = 0; i < order.items.length; i++) {
    subtotal = subtotal + order.items[i].price * order.items[i].qty
  }
  let total
  if (order.coupon === "TEN") {
    total = subtotal - subtotal * 0.1
  } else {
    total = subtotal
  }
  return total
}

function orderTotalWithShipping(order, shipping) {
  let subtotal = 0
  for (let i = 0; i < order.items.length; i++) {
    subtotal = subtotal + order.items[i].price * order.items[i].qty
  }
  let total
  if (order.coupon === "TEN") {
    total = subtotal - subtotal * 0.1
  } else {
    total = subtotal
  }
  return total + shipping
}

module.exports = { orderTotal, orderTotalWithShipping }
