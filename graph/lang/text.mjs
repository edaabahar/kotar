// Text helpers shared by the language adapters.

// Comments removed, string contents emptied, newlines kept (so line numbers stay right).
export function sanitize(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      out += '""';
      i += q.length;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src.startsWith(q, i)) {
          i += q.length;
          break;
        }
        if (src[i] === "\n") {
          out += "\n";
          if (!triple) break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function indentOf(line) {
  let w = 0;
  for (const ch of line) {
    if (ch === "\t") w += 4;
    else if (ch === " ") w += 1;
    else break;
  }
  return w;
}

