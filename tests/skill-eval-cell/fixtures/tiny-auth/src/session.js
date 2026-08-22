module.exports = function sessionCookie(token) {
  return `session=${token}; HttpOnly; Path=/`
}
