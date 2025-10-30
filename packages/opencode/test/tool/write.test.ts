import { describe, expect, test, spyOn } from "bun:test"
import { WriteTool } from "../../src/tool/write"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const writeTool = await WriteTool.init()

describe("tool.write external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")

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

          await writeTool.execute({ filePath: externalFile, content: "test content" }, ctx)

          expect(permissionSpy).toHaveBeenCalled()
          const externalFilesCall = permissionSpy.mock.calls.find(
            (call) => call[0].type === "external_files",
          )
          expect(externalFilesCall).toBeDefined()
          expect(externalFilesCall[0].metadata.operation).toBe("write")
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

          await writeTool.execute({ filePath: externalFile, content: "test content" }, ctx)

          const externalFilesCall = permissionSpy.mock.calls.find(
            (call) => call[0].type === "external_files",
          )
          expect(externalFilesCall).toBeUndefined()

          const file = Bun.file(externalFile)
          expect(await file.exists()).toBe(true)
          expect(await file.text()).toBe("test content")
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
            writeTool.execute({ filePath: externalFile, content: "test content" }, ctx),
          ).rejects.toThrow("is not in the current working directory")
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should match patterns correctly", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              external_files: {
                "*/output/*": "allow",
                "*": "deny",
              },
            },
          }),
        )
      },
    })

    const outputDir = path.join(path.dirname(tmp.path), "output")
    await Bun.write(path.join(outputDir, ".keep"), "")
    const outputFile = path.join(outputDir, "result.txt")

    const otherFile = path.join(path.dirname(tmp.path), "other.txt")

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

          await writeTool.execute({ filePath: outputFile, content: "output content" }, ctx)
          const file = Bun.file(outputFile)
          expect(await file.exists()).toBe(true)
          expect(permissionSpy).not.toHaveBeenCalled()

          await expect(
            writeTool.execute({ filePath: otherFile, content: "other content" }, ctx),
          ).rejects.toThrow("is not in the current working directory")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
