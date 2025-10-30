import { describe, expect, test } from "bun:test"
import { expandPermissionPatterns } from "../../src/util/permission"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"
import * as os from "os"

describe("util.permission.expandPermissionPatterns", () => {
  test("should expand tilde to home directory", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "~/projects/*": "allow",
          "~/documents/*/file.txt": "deny",
        }

        const expanded = expandPermissionPatterns(patterns)
        const homedir = os.homedir()

        expect(expanded[`${homedir}/projects/*`]).toBe("allow")
        expect(expanded[`${homedir}/documents/*/file.txt`]).toBe("deny")
      },
    })
  })

  test("should expand relative paths from Instance.directory", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "../sibling/*": "allow",
          "./current/*": "deny",
        }

        const expanded = expandPermissionPatterns(patterns)
        const parent = path.dirname(tmp.path)

        expect(expanded[`${parent}/sibling/*`]).toBe("allow")
        expect(expanded[`${tmp.path}/current/*`]).toBe("deny")
      },
    })
  })

  test("should preserve absolute paths unchanged", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "/absolute/path/*": "allow",
          "/another/absolute": "deny",
        }

        const expanded = expandPermissionPatterns(patterns)

        expect(expanded["/absolute/path/*"]).toBe("allow")
        expect(expanded["/another/absolute"]).toBe("deny")
      },
    })
  })

  test("should preserve wildcards in patterns", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "~/projects/*/src/*": "allow",
          "../*/test/*.ts": "deny",
        }

        const expanded = expandPermissionPatterns(patterns)
        const homedir = os.homedir()
        const parent = path.dirname(tmp.path)

        expect(expanded[`${homedir}/projects/*/src/*`]).toBe("allow")
        expect(expanded[`${parent}/*/test/*.ts`]).toBe("deny")
      },
    })
  })

  test("should handle complex relative paths with ..", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "../../grandparent/*": "allow",
        }

        const expanded = expandPermissionPatterns(patterns)
        // ../../ resolves two levels up, then /grandparent is a literal directory name
        const twoLevelsUp = path.dirname(path.dirname(tmp.path))
        const expected = path.join(twoLevelsUp, "grandparent/*")

        expect(expanded[expected]).toBe("allow")
      },
    })
  })

  test("should handle patterns without wildcards", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "~/specific/file.txt": "allow",
          "../other.txt": "deny",
        }

        const expanded = expandPermissionPatterns(patterns)
        const homedir = os.homedir()
        const parent = path.dirname(tmp.path)

        expect(expanded[`${homedir}/specific/file.txt`]).toBe("allow")
        expect(expanded[`${parent}/other.txt`]).toBe("deny")
      },
    })
  })

  test("should preserve wildcard-only patterns", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const patterns = {
          "*": "ask",
        }

        const expanded = expandPermissionPatterns(patterns)

        // Wildcard-only should be treated as relative and resolved
        expect(expanded[`${tmp.path}/*`]).toBe("ask")
      },
    })
  })
})
