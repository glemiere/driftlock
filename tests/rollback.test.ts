import { describe, expect, it, jest } from "@jest/globals";
import { rollbackPatches, commitPlanChanges } from "../src/core/rollback";
import * as runCommands from "../src/core/utils/run-commands";

jest.mock("../src/core/utils/run-commands");

const mockedRunCommand = runCommands.runCommand as jest.MockedFunction<typeof runCommands.runCommand>;

describe("rollback", () => {
  beforeEach(() => {
    mockedRunCommand.mockReset();
  });

  it("rolls back patches in reverse order", async () => {
    mockedRunCommand.mockResolvedValue({ ok: true, stdout: "", stderr: "", code: 0 });
    const patches = [
      { patch: "patch-1", description: "first" },
      { patch: "patch-2", description: "second" },
    ];

    await rollbackPatches(patches, "/repo");

    expect(mockedRunCommand).toHaveBeenCalledTimes(2);
    expect(mockedRunCommand).toHaveBeenNthCalledWith(1, "git apply -R", "/repo", {
      input: "patch-2",
    });
    expect(mockedRunCommand).toHaveBeenNthCalledWith(2, "git apply -R", "/repo", {
      input: "patch-1",
    });
  });

  it("throws when rollback fails", async () => {
    mockedRunCommand.mockResolvedValueOnce({
      ok: false,
      stdout: "",
      stderr: "oops",
      code: 1,
    });

    await expect(
      rollbackPatches([{ patch: "bad" }], "/repo")
    ).rejects.toThrow(/rollback patch/i);
  });

  it("commits changes when add and commit succeed", async () => {
    mockedRunCommand
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "", code: 0 }) // git add
      .mockResolvedValueOnce({ ok: true, stdout: "", stderr: "", code: 0 }); // git commit

    const success = await commitPlanChanges("msg", "/repo");
    expect(success).toBe(true);
    expect(mockedRunCommand).toHaveBeenNthCalledWith(1, "git add -A", "/repo");
    expect(mockedRunCommand).toHaveBeenNthCalledWith(2, 'git commit -m "msg"', "/repo");
  });

  it("returns false when add fails", async () => {
    mockedRunCommand.mockResolvedValueOnce({ ok: false, stdout: "", stderr: "", code: 1 });
    const success = await commitPlanChanges("msg", "/repo");
    expect(success).toBe(false);
  });
});
