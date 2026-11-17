const http = require("node:http")
const { listOrders } = require("./api/orders")
const { getProduct } = require("./api/products")
const { auditPage } = require("./api/audit")

function pageParam(url) {
  return Number(url.searchParams.get("page") ?? "1")
}

const routes = {
  "/orders": (url) => listOrders(pageParam(url)),
  "/products": (url) => getProduct(url.searchParams.get("id")),
  "/audit": (url) => auditPage(Number(url.searchParams.get("chunk") ?? "0")),
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost")
    const route = routes[url.pathname]
    if (!route) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(route(url)))
  })
  .listen(process.env.PORT ?? 3000)
