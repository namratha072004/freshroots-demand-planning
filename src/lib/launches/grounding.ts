import type { GroundedResponse } from "../gemini";

export interface Candidate {
  title: string;
  summary: string;
  /** Grounding chunks whose text spans overlap this lead. Only these can source it. */
  chunks: { uri: string; title: string }[];
}

interface ListItem {
  title: string;
  summary: string;
  /** Byte span of the item in the response text (the unit Google's offsets use). */
  start: number;
  end: number;
}

const ITEM = /^(\s*)(?:\d+[.)]|[-*•])\s+(.*)$/;
const strip = (s: string) => s.replace(/\*\*|__/g, "").replace(/^\*+|\*+$/g, "").replace(/\s+/g, " ").trim();

function splitTitle(body: string): { title: string; summary: string } | null {
  const bold = /^\*\*(.+?)\*\*\s*[:\-–—]?\s*(.*)$/.exec(body);
  if (bold) return { title: strip(bold[1]).replace(/[:\-–—]\s*$/, "").trim(), summary: strip(bold[2]) };
  const plain = /^(.{3,120}?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(body);
  return plain ? { title: strip(plain[1]), summary: strip(plain[2]) } : null;
}

/** Read a numbered or bulleted list ("1. **Brand Product**: one sentence") from the model's text. */
export function parseLeadList(text: string): ListItem[] {
  const out: ListItem[] = [];
  let cur: { body: string; indent: number; start: number; end: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const t = splitTitle(cur.body.trim());
    if (t && t.title && t.summary && t.title.length <= 200 && t.summary.length <= 400) out.push({ ...t, start: cur.start, end: cur.end });
    cur = null;
  };
  let offset = 0;
  for (const line of text.split("\n")) {
    const bytes = Buffer.byteLength(line, "utf8");
    const m = ITEM.exec(line);
    if (m && (!cur || m[1].length <= cur.indent)) {
      flush();
      cur = { body: m[2], indent: m[1].length, start: offset, end: offset + bytes };
    } else if (cur && line.trim() !== "") {
      // Continuation or nested bullet: part of the same lead.
      cur.body += " " + (m ? m[2] : line.trim());
      cur.end = offset + bytes;
    } else if (cur && line.trim() === "") {
      flush();
    }
    offset += bytes + 1; // the newline
  }
  flush();
  return out;
}

/**
 * Match each lead to the grounding chunks that support its text. A lead no grounding support overlaps has
 * no grounded source and gets no chunks (the caller drops it).
 */
export function candidatesFromResponse(res: GroundedResponse): Candidate[] {
  return parseLeadList(res.text).map((item) => {
    const idx = new Set(res.supports.filter((sp) => sp.start < item.end && sp.end > item.start).flatMap((sp) => sp.chunkIndices));
    const chunks = [...idx].map((i) => res.chunks[i]).filter((c): c is { uri: string; title: string } => !!c && !!c.uri);
    return { title: item.title, summary: item.summary, chunks };
  });
}
