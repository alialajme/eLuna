import { processOutbox } from "@ayvana/db";
import { handleCaseEvent, sweepCaseSla } from "./handlers";

const CASE_EVENT_PREFIX = "case.";

async function tick() {
  await processOutbox(async (event) => {
    if (event.type.startsWith(CASE_EVENT_PREFIX)) await handleCaseEvent(event);
  });
  await sweepCaseSla();
}

async function main() {
  console.info("[cases-worker] started");
  for (;;) {
    await tick().catch((e) => console.error("[cases-worker]", e));
    await new Promise((r) => setTimeout(r, 5000));
  }
}

void main();
