import { test } from "node:test";
import assert from "node:assert/strict";
import { parseServiceQuery } from "./driver.js";

test("the driver state is read from sc query output", () => {
  const running = "SERVICE_NAME: rawaccel\n        TYPE               : 1  KERNEL_DRIVER\n        STATE              : 4  RUNNING\n";
  assert.equal(parseServiceQuery(running), "RUNNING");
  assert.equal(parseServiceQuery("        STATE              : 1  STOPPED\n"), "STOPPED");
  assert.equal(parseServiceQuery("[SC] OpenService FAILED 1060:"), null);
});
