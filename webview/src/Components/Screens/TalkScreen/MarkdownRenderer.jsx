import React, { useEffect, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import mermaid from "mermaid";

import "katex/dist/katex.min.css";
import "./MarkdownRenderer.css";

// Mermaid einmal initialisieren.
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
});

function MermaidDiagram({ chart }) {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setSvg("");
      setError("");

      try {
        const result = await mermaid.render(diagramId, chart);

        if (!cancelled) {
          setSvg(result.svg);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Mermaid diagram could not be rendered."
          );
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, diagramId]);

  if (error) {
    return (
      <div className="markdown-mermaid-error">
        <p>Mermaid-Diagramm konnte nicht dargestellt werden:</p>
        <pre>
          <code>{chart}</code>
        </pre>
        <small>{error}</small>
      </div>
    );
  }

  if (!svg) {
    return <div className="markdown-mermaid-loading">Diagramm wird geladen …</div>;
  }

  return (
    <div
      className="markdown-mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const components = {
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },

  pre({ children }) {
    if (
        React.isValidElement(children) &&
        /language-mermaid/.test(children.props.className || "")
    ) {
        return children;
    }

    return <pre className="markdown-code-block">{children}</pre>;
    },

  code({ className, children, ...props }) {
    const isMermaid = /language-mermaid/.test(className || "");

    if (isMermaid) {
      return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
    }

    return (
      <code className={className || "markdown-inline-code"} {...props}>
        {children}
      </code>
    );
  },

  table({ children }) {
    return (
      <div className="markdown-table-wrapper">
        <table>{children}</table>
      </div>
    );
  },
};

export default function MarkdownRenderer({ content = "" }) {
  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { plainText: ["mermaid"] }],
        ]}
        components={components}
      >
        {String(content)}
      </ReactMarkdown>
    </div>
  );
}