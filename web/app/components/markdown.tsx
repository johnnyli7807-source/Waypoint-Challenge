// Inline markdown: **bold**, *italic*, line breaks. Nothing else.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br/>");
}

export default function Markdown({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }}
    />
  );
}
