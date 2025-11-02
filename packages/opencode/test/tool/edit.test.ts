import { describe, expect, test, spyOn } from "bun:test"
import { EditTool } from "../../src/tool/edit"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { FileTime } from "../../src/file/time"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const editTool = await EditTool.init()

describe("tool.edit external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()
    const externalFile = path.join(path.dirname(tmp.path), "external.txt")
    await Bun.write(externalFile, "old content")

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
          FileTime.read(ctx.sessionID, externalFile)

          await editTool.execute(
            {
              filePath: externalFile,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("external_files")
          expect(permissionSpy.mock.calls[0][0].metadata.operation).toBe("edit")
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
    await Bun.write(externalFile, "old content")

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
              {
                filePath: externalFile,
                oldString: "old",
                newString: "new",
              },
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
    await Bun.write(externalFile, "old content")

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
          FileTime.read(ctx.sessionID, externalFile)

          await editTool.execute(
            {
              filePath: externalFile,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          expect(permissionSpy).not.toHaveBeenCalled()

          const content = await Bun.file(externalFile).text()
          expect(content).toBe("new content")
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
    await Bun.write(internalFile, "old content")

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
          FileTime.read(ctx.sessionID, internalFile)

          await editTool.execute(
            {
              filePath: internalFile,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("edit")

          const content = await Bun.file(internalFile).text()
          expect(content).toBe("new content")
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
    await Bun.write(internalFile, "old content")

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
          FileTime.read(ctx.sessionID, internalFile)

          await editTool.execute(
            {
              filePath: internalFile,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          // With edit.enabled: "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()

          const content = await Bun.file(internalFile).text()
          expect(content).toBe("new content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should handle replaceAll parameter", async () => {
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
    await Bun.write(internalFile, "test test test")

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
          FileTime.read(ctx.sessionID, internalFile)

          await editTool.execute(
            {
              filePath: internalFile,
              oldString: "test",
              newString: "pass",
              replaceAll: true,
            },
            ctx,
          )

          expect(permissionSpy).toHaveBeenCalledTimes(1)

          const content = await Bun.file(internalFile).text()
          expect(content).toBe("pass pass pass")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should throw error when oldString not found", async () => {
    await using tmp = await tmpdir()
    const internalFile = path.join(tmp.path, "internal.txt")
    await Bun.write(internalFile, "test content")

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
          FileTime.read(ctx.sessionID, internalFile)

          await expect(
            editTool.execute(
              {
                filePath: internalFile,
                oldString: "nonexistent",
                newString: "new",
              },
              ctx,
            ),
          ).rejects.toThrow("oldString not found in content")

          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should handle empty file creation with oldString empty", async () => {
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
    const newFile = path.join(tmp.path, "new.txt")

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
            {
              filePath: newFile,
              oldString: "",
              newString: "new content",
            },
            ctx,
          )

          expect(permissionSpy).toHaveBeenCalledTimes(1)

          const content = await Bun.file(newFile).text()
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
    await Bun.write(internalFile, "old content")

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
          FileTime.read(ctx.sessionID, internalFile)

          await editTool.execute(
            {
              filePath: internalFile,
              oldString: "old",
              newString: "new",
            },
            ctx,
          )

          // With legacy config format "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
