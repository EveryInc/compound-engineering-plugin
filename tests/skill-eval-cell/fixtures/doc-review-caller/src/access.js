export function assertOwner(report, userId) {
  if (report.ownerId !== userId) throw Object.assign(new Error("Forbidden"), {status: 403});
}
