import * as path from "path"
import * as os from "os"
import { Instance } from "../project/instance"

/**
 * Expands path patterns in permission configs to absolute paths.
 * Supports:
 * - Tilde expansion: ~/path -> /Users/username/path
 * - Relative paths: ../path -> resolved from Instance.directory
 * - Absolute paths: /path -> unchanged
 * - Wildcard patterns: Preserves wildcards while expanding base path
 */
export function expandPermissionPatterns(
  permissions: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(permissions).map(([pattern, value]) => {
      // Handle tilde expansion first
      let expandedPattern = pattern
      if (pattern.startsWith("~/")) {
        expandedPattern = path.join(os.homedir(), pattern.slice(2))
      } else if (pattern.startsWith("~")) {
        expandedPattern = path.join(os.homedir(), pattern.slice(1))
      } else if (!path.isAbsolute(pattern)) {
        // For relative paths, we need to preserve wildcards
        // Find where wildcards start
        const parts = pattern.split("/")
        let wildcardIndex = -1

        for (let i = 0; i < parts.length; i++) {
          if (parts[i].includes("*")) {
            wildcardIndex = i
            break
          }
        }

        if (wildcardIndex >= 0) {
          // Split into base path (before wildcard) and wildcard pattern
          const baseParts = parts.slice(0, wildcardIndex)
          const wildcardParts = parts.slice(wildcardIndex)

          // Resolve the base path
          const basePath =
            baseParts.length > 0
              ? path.resolve(Instance.directory, baseParts.join("/"))
              : Instance.directory

          // Combine resolved base with wildcard parts
          expandedPattern = `${basePath}/${wildcardParts.join("/")}`
        } else {
          // No wildcards - resolve the entire path
          expandedPattern = path.resolve(Instance.directory, pattern)
        }
      }
      // else: already absolute, leave as-is

      return [expandedPattern, value]
    }),
  )
}
