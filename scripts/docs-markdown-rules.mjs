/**
 * Return one-based line numbers containing a backslash-escaped backtick
 * outside a fenced code block.
 *
 * CommonMark treats code-span contents literally, so `\`` inside a prose
 * code span renders the backslash rather than escaping the delimiter.
 */
export function backslashEscapedBacktickLines(source) {
  const result = [];
  const lines = source.split("\n");
  let fence = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.trimStart().match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence.marker &&
        fenceMatch[1].length >= fence.length &&
        fenceMatch[2].trim() === ""
      ) {
        fence = null;
      }
      continue;
    }

    if (
      fenceMatch &&
      (
        fenceMatch[1][0] === "~" ||
        !fenceMatch[2].includes("`")
      )
    ) {
      fence = {
        length: fenceMatch[1].length,
        marker: fenceMatch[1][0],
      };
      continue;
    }

    if (line.includes("\\`")) result.push(index + 1);
  }

  return result;
}
