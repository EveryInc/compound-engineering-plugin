const { SEAT_CAP } = require("../src/seat-cap.js");
if (SEAT_CAP !== 3) {
  console.error("SEAT_CAP: expected 3, got " + SEAT_CAP);
  process.exit(1);
}
