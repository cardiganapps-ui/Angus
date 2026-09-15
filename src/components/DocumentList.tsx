import { useEffect, useState, type CSSProperties } from "react";
import type { Document } from "../types";
import { fileIcon, fileUrl, formatFileSize, isImageMime } from "../lib/files";
import { formatShort } from "../utils/dates";
import { Icon } from "./Icon";

const stagger = (i: number) => ({ "--stagger-i": Math.min(i, 12) }) as CSSProperties;

/** A 44px thumbnail for image rows; falls back to the icon while (or if) the URL doesn't resolve. */
function Thumb({ doc }: { doc: Document }) {
  const [url, setUrl] = useState<string | null>(null);
  const image = doc.kind === "file" && isImageMime(doc.mime) && !!doc.r2Path;
  useEffect(() => {
    if (!image || !doc.r2Path) return;
    let alive = true;
    void fileUrl(doc.r2Path, doc.name).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [image, doc.r2Path, doc.name]);
  if (image && url) return <img className="doc-thumb" src={url} alt="" loading="lazy" />;
  return (
    <span className={`doc-icon doc-icon--${doc.kind === "link" ? "link" : isImageMime(doc.mime) ? "image" : "file"}`}>
      <Icon name={fileIcon(doc.mime, doc.kind)} size={18} />
    </span>
  );
}

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ── DocumentList ──
   Files and links as rows: thumbnail or type icon, name, size · date
   (or the link's host). Tapping opens the viewer (files) or the link. */
export function DocumentList({ documents, onOpen, emptyBody }: { documents: Document[]; onOpen: (doc: Document) => void; emptyBody: string }) {
  if (documents.length === 0) return <div className="money-list-empty">{emptyBody}</div>;
  return (
    <>
      {documents.map((doc, i) => (
        <button key={doc.id} type="button" className="row-item list-entry-stagger doc-row" style={stagger(i)} onClick={() => onOpen(doc)}>
          <Thumb doc={doc} />
          <div className="row-content">
            <div className="row-title">{doc.name}</div>
            <div className="row-sub">
              {doc.kind === "link" && doc.url
                ? linkHost(doc.url)
                : [formatFileSize(doc.sizeBytes), formatShort(doc.createdAt)].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span className="row-chevron" aria-hidden="true">
            <Icon name="chevron-right" size={16} />
          </span>
        </button>
      ))}
    </>
  );
}
