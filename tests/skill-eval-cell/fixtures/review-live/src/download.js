import { loadReport } from "./store.js";
import { assertOwner } from "./access.js";
export function downloadJson(reports, id, userId) {
  const report = loadReport(reports, id);
  assertOwner(report, userId);
  return {status: 200, headers: {"content-type": "application/json"}, body: JSON.stringify({columns: report.columns, rows: report.rows})};
}
