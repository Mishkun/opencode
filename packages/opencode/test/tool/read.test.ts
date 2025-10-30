import { describe, expect, test, spyOn } from "bun:test"
import { ReadTool } from "../../src/tool/read"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const readTool = await ReadTool.init()

describe("tool.read external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "external content")

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

          await readTool.execute({ filePath: externalFile }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("external_files")
          expect(permissionSpy.mock.calls[0][0].metadata.operation).toBe("read")
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
    await Bun.write(externalFile, "external content")

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

          const result = await readTool.execute({ filePath: externalFile }, ctx)

          expect(permissionSpy).not.toHaveBeenCalled()
          expect(result.output).toContain("external content")
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
    await Bun.write(externalFile, "external content")

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

          await expect(readTool.execute({ filePath: externalFile }, ctx)).rejects.toThrow(
            "is not in the current working directory",
          )
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
                "*/docs/*": "allow",
                "*": "deny",
              },
            },
          }),
        )
      },
    })

    const docsDir = path.join(path.dirname(tmp.path), "docs")
    await Bun.write(path.join(docsDir, ".keep"), "")
    const docsFile = path.join(docsDir, "README.md")
    await Bun.write(docsFile, "docs content")

    const otherFile = path.join(path.dirname(tmp.path), "other.txt")
    await Bun.write(otherFile, "other content")

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

          const docsResult = await readTool.execute({ filePath: docsFile }, ctx)
          expect(docsResult.output).toContain("docs content")
          expect(permissionSpy).not.toHaveBeenCalled()

          await expect(readTool.execute({ filePath: otherFile }, ctx)).rejects.toThrow(
            "is not in the current working directory",
          )
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should respect bypassCwdCheck", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "external content")

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
            extra: { bypassCwdCheck: true },
          }

          await readTool.execute({ filePath: externalFile }, ctx)

          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
