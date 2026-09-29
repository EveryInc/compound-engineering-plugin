export function requireUser(req: any, res: any, next: any) { if (!req.user) return res.redirect("/login"); next() }
