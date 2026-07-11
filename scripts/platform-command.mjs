/** Resolve npm without relying on shell-specific npm/npx shims. */
export function platformInvocation(
  command,
  args,
  {
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    nodeExecPath = process.execPath,
  } = {},
) {
  if ((command === "npm" || command === "npx") && npmExecPath) {
    return {
      command: nodeExecPath,
      args: [npmExecPath, ...(command === "npx" ? ["exec", "--"] : []), ...args],
    };
  }
  if (platform === "win32" && (command === "npm" || command === "npx")) {
    throw new Error("npm_execpath is unavailable; run package smoke through `npm run package:smoke`.");
  }
  return { command, args };
}
