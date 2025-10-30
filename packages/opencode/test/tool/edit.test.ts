import { describe, expect, test, spyOn } from "bun:test"
import { EditTool } from "../../src/tool/edit"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const editTool = await EditTool.init()

describe("tool.edit external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "line 1\nline 2\nline 3")

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ctx = {
            sessionID: "test",
            messageID: "msg",
            callID: "call",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
          }

          await editTool.execute(
            { filePath: externalFile, oldString: "line 2", newString: "modified" },
            ctx,
          )

          expect(permissionSpy).toHaveBeenCalled()
          const externalFilesCall = permissionSpy.mock.calls.find(
            (call) => call[0].type === "external_files",
          )
          expect(externalFilesCall).toBeDefined()
          expect(externalFilesCall[0].metadata.operation).toBe("edit")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should allow external files when configured to allow", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              external_files: "allow",
            },
          }),
        )
      },
    })

    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "line 1\nline 2\nline 3")

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ctx = {
            sessionID: "test",
            messageID: "msg",
            callID: "call",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
          }

          await editTool.execute(
            { filePath: externalFile, oldString: "line 2", newString: "modified" },
            ctx,
          )

          const externalFilesCall = permissionSpy.mock.calls.find(
            (call) => call[0].type === "external_files",
          )
          expect(externalFilesCall).toBeUndefined()

          const file = Bun.file(externalFile)
          const content = await file.text()
          expect(content).toContain("modified")
          expect(content).not.toContain("line 2")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should deny external files when configured to deny", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              external_files: "deny",
            },
          }),
        )
      },
    })

    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "line 1\nline 2\nline 3")

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ctx = {
            sessionID: "test",
            messageID: "msg",
            callID: "call",
            agent: "build",
            abort: AbortSignal.any([]),
            metadata: () => {},
          }

          await expect(
            editTool.execute(
              { filePath: externalFile, oldString: "line 2", newString: "modified" },
              ctx,
            ),
          ).rejects.toThrow("is not in the current working directory")
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
