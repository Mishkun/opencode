import { describe, expect, test, spyOn } from "bun:test"
import { WriteTool } from "../../src/tool/write"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { FileTime } from "../../src/file/time"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const writeTool = await WriteTool.init()

describe("tool.write external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "existing")

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

          // Mark file as read to bypass FileTime.assert (file exists)
          FileTime.read(ctx.sessionID, externalFile)

          await writeTool.execute({ filePath: externalFile, content: "test" }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("external_files")
          expect(permissionSpy.mock.calls[0][0].metadata.operation).toBe("write")
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
              edit: {
                enabled: "allow",
                external_files: "deny",
              },
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
            writeTool.execute({ filePath: externalFile, content: "test" }, ctx),
          ).rejects.toThrow("is not in the current working directory")
          expect(permissionSpy).not.toHaveBeenCalled()
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
              edit: {
                enabled: "allow",
                external_files: "allow",
              },
            },
          }),
        )
      },
    })
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "existing")

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

          // Mark file as read to bypass FileTime.assert (file exists)
          FileTime.read(ctx.sessionID, externalFile)

          await writeTool.execute({ filePath: externalFile, content: "test" }, ctx)

          expect(permissionSpy).not.toHaveBeenCalled()

          const content = await Bun.file(externalFile).text()
          expect(content).toBe("test")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should allow internal files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              edit: {
                enabled: "ask",
                external_files: "ask",
              },
            },
          }),
        )
      },
    })
    const internalFile = path.join(tmp.path, "internal.txt")

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

          await writeTool.execute({ filePath: internalFile, content: "internal content" }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("write")

          const content = await Bun.file(internalFile).text()
          expect(content).toBe("internal content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should respect permission config for internal files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              edit: {
                enabled: "allow",
                external_files: "ask",
              },
            },
          }),
        )
      },
    })

    const internalFile = path.join(tmp.path, "internal.txt")

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

          await writeTool.execute({ filePath: internalFile, content: "internal content" }, ctx)

          // With edit.enabled: "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()

          const content = await Bun.file(internalFile).text()
          expect(content).toBe("internal content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should create new file when it does not exist", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              edit: {
                enabled: "ask",
                external_files: "ask",
              },
            },
          }),
        )
      },
    })
    const newFile = path.join(tmp.path, "new-file.txt")

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

          await writeTool.execute({ filePath: newFile, content: "new content" }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].metadata.exists).toBe(false)

          const content = await Bun.file(newFile).text()
          expect(content).toBe("new content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should overwrite existing file", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              edit: {
                enabled: "ask",
                external_files: "ask",
              },
            },
          }),
        )
      },
    })
    const existingFile = path.join(tmp.path, "existing.txt")
    await Bun.write(existingFile, "old content")

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

          // Mark file as read to bypass FileTime.assert
          FileTime.read(ctx.sessionID, existingFile)

          await writeTool.execute({ filePath: existingFile, content: "new content" }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].metadata.exists).toBe(true)

          const content = await Bun.file(existingFile).text()
          expect(content).toBe("new content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should backward compatible with legacy config format", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            permission: {
              edit: "allow",
            },
          }),
        )
      },
    })

    const internalFile = path.join(tmp.path, "internal.txt")

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

          await writeTool.execute({ filePath: internalFile, content: "content" }, ctx)

          // With legacy config format "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
