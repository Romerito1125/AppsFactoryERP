// Markdown mínimo y seguro (sin HTML) para las respuestas de Mundi:
// títulos, negritas, cursivas, código, listas y tablas.

function renderInline(text, keyPrefix) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isDivider = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function MundiMarkdown({ text }) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|") && isDivider(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div className="mundi-table-wrap" key={key}>
          <table>
            <thead>
              <tr>{header.map((cell, c) => <th key={c}>{renderInline(cell, `${key}h${c}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell, `${key}${r}${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p className="mundi-md-heading" key={key}>{renderInline(heading[2], key)}</p>);
      i += 1;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key}>{items.map((item, n) => <li key={n}>{renderInline(item, `${key}${n}`)}</li>)}</List>,
      );
      continue;
    }
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !(lines[i].trim().startsWith("|") && isDivider(lines[i + 1] ?? ""))
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key}>
        {paragraph.map((row, n) => (
          <span key={n}>
            {n > 0 && <br />}
            {renderInline(row, `${key}${n}`)}
          </span>
        ))}
      </p>,
    );
  }
  return <div className="mundi-md">{blocks}</div>;
}
