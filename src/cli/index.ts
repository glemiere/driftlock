#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("driftlock")
  .description(
    "A configurable AI orchestrator to fight entropy in your codebase."
  )
  .helpOption("-h, --help", "display help information");

program
  .command("audit")
  .description("Run driftlock auditors")
  .argument(
    "[auditors]",
    "comma-separated list of auditors (e.g. complexity,security)"
  )
  .action((auditors: string | undefined) => {
    const auditorList = auditors
      ? auditors.split(",").map((a) => a.trim()).filter(Boolean)
      : [];

    if (auditorList.length === 0) {
      console.log("Running audit with all configured auditors");
    } else {
      console.log("Running audit with auditors:", auditorList.join(", "));
    }
  });

program.parse();
