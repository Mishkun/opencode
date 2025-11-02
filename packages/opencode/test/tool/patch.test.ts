import { describe, expect, test, spyOn } from "bun:test"
import path from "path"
import { PatchTool } from "../../src/tool/patch"
import { Instance } from "../../src/project/instance"
import { Permission } from "../../src/permission"
import { FileTime } from "../../src/file/time"
import { tmpdir } from "../fixture/fixture"
import * as fs from "fs/promises"

const ctx = {
  sessionID: "test",
  messageID: "",
  toolCallID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
}

const patchTool = await PatchTool.init()

describe("tool.patch", () => {
  test("should validate required parameters", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(patchTool.execute({ patchText: "" }, ctx)).rejects.toThrow(
          "patchText is required",
        )
      },
    })
  })

  test("should validate patch format", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await expect(patchTool.execute({ patchText: "invalid patch" }, ctx)).rejects.toThrow(
          "Failed to parse patch",
        )
      },
    })
  })

  test("should handle empty patch", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const emptyPatch = `*** Begin Patch
*** End Patch`

        await expect(patchTool.execute({ patchText: emptyPatch }, ctx)).rejects.toThrow(
          "No file changes found in patch",
        )
      },
    })
  })

  test("should reject files outside working directory", async () => {
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
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const maliciousPatch = `*** Begin Patch
*** Add File: /etc/passwd
+malicious content
*** End Patch`

        await expect(patchTool.execute({ patchText: maliciousPatch }, ctx)).rejects.toThrow(
          "is not in the current working directory",
        )
      },
    })
  })

  test("should handle simple add file operation", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: test-file.txt
+Hello World
+This is a test file
*** End Patch`

        const result = await patchTool.execute({ patchText }, ctx)

        expect(result.title).toContain("files changed")
        expect(result.metadata.diff).toBeDefined()
        expect(result.output).toContain("Patch applied successfully")

        // Verify file was created
        const filePath = path.join(fixture.path, "test-file.txt")
        const content = await fs.readFile(filePath, "utf-8")
        expect(content).toBe("Hello World\nThis is a test file")
      },
    })
  })

  test("should handle file with context update", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: config.js
+const API_KEY = "test-key"
+const DEBUG = false
+const VERSION = "1.0"
*** End Patch`

        const result = await patchTool.execute({ patchText }, ctx)

        expect(result.title).toContain("files changed")
        expect(result.metadata.diff).toBeDefined()
        expect(result.output).toContain("Patch applied successfully")

        // Verify file was created with correct content
        const filePath = path.join(fixture.path, "config.js")
        const content = await fs.readFile(filePath, "utf-8")
        expect(content).toBe(
          'const API_KEY = "test-key"\nconst DEBUG = false\nconst VERSION = "1.0"',
        )
      },
    })
  })

  test("should handle multiple file operations", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: file1.txt
+Content of file 1
*** Add File: file2.txt
+Content of file 2
*** Add File: file3.txt
+Content of file 3
*** End Patch`

        const result = await patchTool.execute({ patchText }, ctx)

        expect(result.title).toContain("3 files changed")
        expect(result.metadata.diff).toBeDefined()
        expect(result.output).toContain("Patch applied successfully")

        // Verify all files were created
        for (let i = 1; i <= 3; i++) {
          const filePath = path.join(fixture.path, `file${i}.txt`)
          const content = await fs.readFile(filePath, "utf-8")
          expect(content).toBe(`Content of file ${i}`)
        }
      },
    })
  })

  test("should create parent directories when adding nested files", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: deep/nested/file.txt
+Deep nested content
*** End Patch`

        const result = await patchTool.execute({ patchText }, ctx)

        expect(result.title).toContain("files changed")
        expect(result.output).toContain("Patch applied successfully")

        // Verify nested file was created
        const nestedPath = path.join(fixture.path, "deep", "nested", "file.txt")
        const exists = await fs
          .access(nestedPath)
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(true)

        const content = await fs.readFile(nestedPath, "utf-8")
        expect(content).toBe("Deep nested content")
      },
    })
  })

  test("should generate proper unified diff in metadata", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        // First create a file with simple content
        const patchText1 = `*** Begin Patch
*** Add File: test.txt
+line 1
+line 2
+line 3
*** End Patch`

        await patchTool.execute({ patchText: patchText1 }, ctx)

        // Now create an update patch
        const patchText2 = `*** Begin Patch
*** Update File: test.txt
@@
 line 1
-line 2
+line 2 updated
 line 3
*** End Patch`

        const result = await patchTool.execute({ patchText: patchText2 }, ctx)

        expect(result.metadata.diff).toBeDefined()
        expect(result.metadata.diff).toContain("@@")
        expect(result.metadata.diff).toContain("-line 2")
        expect(result.metadata.diff).toContain("+line 2 updated")
      },
    })
  })

  test("should handle complex patch with multiple operations", async () => {
    await using fixture = await tmpdir()

    await Instance.provide({
      directory: fixture.path,
      fn: async () => {
        const patchText = `*** Begin Patch
*** Add File: new.txt
+This is a new file
+with multiple lines
*** Add File: existing.txt
+old content
+new line
+more content
*** Add File: config.json
+{
+  "version": "1.0",
+  "debug": true
+}
*** End Patch`

        const result = await patchTool.execute({ patchText }, ctx)

        expect(result.title).toContain("3 files changed")
        expect(result.metadata.diff).toBeDefined()
        expect(result.output).toContain("Patch applied successfully")

        // Verify all files were created
        const newPath = path.join(fixture.path, "new.txt")
        const newContent = await fs.readFile(newPath, "utf-8")
        expect(newContent).toBe("This is a new file\nwith multiple lines")

        const existingPath = path.join(fixture.path, "existing.txt")
        const existingContent = await fs.readFile(existingPath, "utf-8")
        expect(existingContent).toBe("old content\nnew line\nmore content")

        const configPath = path.join(fixture.path, "config.json")
        const configContent = await fs.readFile(configPath, "utf-8")
        expect(configContent).toBe('{\n  "version": "1.0",\n  "debug": true\n}')
      },
    })
  })
})

describe("tool.patch external files", () => {
  test("should ask permission for external files with default config", async () => {
    await using tmp = await tmpdir()

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const patchText = `*** Begin Patch
*** Add File: ../external.txt
+external content
*** End Patch`

          await patchTool.execute({ patchText }, ctx)

          // Should ask for external_files permission (edit.enabled is "allow" by default)
          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("external_files")
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

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const patchText = `*** Begin Patch
*** Add File: ../external.txt
+external content
*** End Patch`

          await expect(patchTool.execute({ patchText }, ctx)).rejects.toThrow(
            "is not in the current working directory",
          )
          expect(permissionSpy).not.toHaveBeenCalled()
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should allow internal files with permission check", async () => {
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

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const patchText = `*** Begin Patch
*** Add File: internal.txt
+internal content
*** End Patch`

          await patchTool.execute({ patchText }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("edit")

          const filePath = path.join(tmp.path, "internal.txt")
          const content = await fs.readFile(filePath, "utf-8")
          expect(content).toBe("internal content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should respect permission config", async () => {
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

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const patchText = `*** Begin Patch
*** Add File: internal.txt
+internal content
*** End Patch`

          await patchTool.execute({ patchText }, ctx)

          // With edit.enabled: "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()

          const filePath = path.join(tmp.path, "internal.txt")
          const content = await fs.readFile(filePath, "utf-8")
          expect(content).toBe("internal content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should validate all file paths before processing", async () => {
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

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mix of valid and invalid paths
          const patchText = `*** Begin Patch
*** Add File: valid.txt
+valid content
*** Add File: ../external.txt
+external content
*** End Patch`

          await expect(patchTool.execute({ patchText }, ctx)).rejects.toThrow(
            "is not in the current working directory",
          )

          // Should not call permission or create any files
          expect(permissionSpy).not.toHaveBeenCalled()

          const validPath = path.join(tmp.path, "valid.txt")
          const exists = await fs
            .access(validPath)
            .then(() => true)
            .catch(() => false)
          expect(exists).toBe(false)
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })

  test("should handle update operations on internal files", async () => {
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
    const testFile = path.join(tmp.path, "test.txt")
    await fs.writeFile(testFile, "line 1\nline 2\nline 3")

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mark file as read to bypass FileTime.assert
          FileTime.read(ctx.sessionID, testFile)

          const patchText = `*** Begin Patch
*** Update File: test.txt
@@
 line 1
-line 2
+line 2 updated
 line 3
*** End Patch`

          await patchTool.execute({ patchText }, ctx)

          expect(permissionSpy).toHaveBeenCalledTimes(1)
          expect(permissionSpy.mock.calls[0][0].type).toBe("edit")

          const content = await fs.readFile(testFile, "utf-8")
          // Note: patch may add trailing newline
          expect(content.trim()).toBe("line 1\nline 2 updated\nline 3")
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

    const permissionSpy = spyOn(Permission, "ask").mockImplementation(async () => Promise.resolve())

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const patchText = `*** Begin Patch
*** Add File: internal.txt
+internal content
*** End Patch`

          await patchTool.execute({ patchText }, ctx)

          // With legacy config format "allow", should not ask permission
          expect(permissionSpy).not.toHaveBeenCalled()

          const filePath = path.join(tmp.path, "internal.txt")
          const content = await fs.readFile(filePath, "utf-8")
          expect(content).toBe("internal content")
        },
      })
    } finally {
      permissionSpy.mockRestore()
    }
  })
})
