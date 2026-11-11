import {test} from "node:test";
import assert from "node:assert/strict";
import {downloadJson} from "./src/download.js";
const reports = new Map([["r1", {ownerId:"u1",columns:["name","total"],rows:[["A", "5"]]}]]);
test("owner downloads JSON", () => assert.equal(downloadJson(reports,"r1","u1").status,200));
test("non-owner gets 403", () => assert.throws(() => downloadJson(reports,"r1","u2"), {status:403}));
test("missing report gets 404", () => assert.throws(() => downloadJson(reports,"missing","u1"), {status:404}));
