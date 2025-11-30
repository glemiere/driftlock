#!/usr/bin/env node

import { Command } from "commander";
import { runAuditCommand } from "./commands/audit";

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
  .action(runAuditCommand);

program.parse();
