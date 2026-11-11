export function loadReport(reports, id) {
  const report = reports.get(id);
  if (!report) throw Object.assign(new Error("Not found"), {status: 404});
  return report;
}
