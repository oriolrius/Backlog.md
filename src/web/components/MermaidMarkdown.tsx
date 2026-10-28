import { useEffect, useMemo, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import { usePlantUmlServer } from "../contexts/PlantUmlServerContext";
import { useTaskIdIndex } from "../contexts/TaskIdIndexContext";
import { renderMermaidIn } from "../utils/mermaid";
import { fenceBarePlantUmlBlocks, renderPlantUmlIn } from "../utils/plantuml";
import { createTaskIdLinkPlugin } from "../utils/task-id-links";

interface Props {
	source: string;
}

/**
 * Remark plugin that switches HTML syntax off in the Markdown parser, so tag-like text such
 * as `<repo>` is always plain text and the preview shows it as written, in prose and in code alike.
 *
 * This is also what keeps HTML in Markdown files inert. The preview library turns any HTML
 * the parser reports into real elements, and its `skipHtml` option does not switch that step
 * off, so `<script>`, `<img onerror=...>` and type strings such as `Result<List<MenuItem>>`
 * must never be reported as HTML. Autolinks (`<https://example.com>`, `<user@example.com>`)
 * are separate Markdown syntax and still link.
 * Mermaid diagrams are drawn from code blocks afterwards; `renderMermaidIn` keeps HTML out of those.
 */
function treatHtmlAsText(this: { data(): object }): void {
	// The processor's shared settings, where the Markdown parser looks up its extensions.
	const settings: { micromarkExtensions?: unknown[] } = this.data();
	settings.micromarkExtensions ??= [];
	// "htmlFlow" is block-level HTML and "htmlText" is inline HTML in micromark, the parser behind remark.
	settings.micromarkExtensions.push({ disable: { null: ["htmlFlow", "htmlText"] } });
}

function keepHashLinksInCurrentRoute(url: string, key: string): string {
	if (key !== "href" || !url.startsWith("#") || typeof window === "undefined") {
		return url;
	}

	return `${window.location.pathname}${window.location.search}${url}`;
}

export default function MermaidMarkdown({ source }: Props) {
	const ref = useRef<HTMLDivElement | null>(null);
	const diagramSource = useMemo(() => fenceBarePlantUmlBlocks(source), [source]);
	const plantUmlServer = usePlantUmlServer();
	const taskIdIndex = useTaskIdIndex();
	const remarkPlugins = useMemo(() => [treatHtmlAsText, createTaskIdLinkPlugin(taskIdIndex)], [taskIdIndex]);

	useEffect(() => {
		if (!ref.current) return;

		// Render diagrams after the markdown has been rendered
		// Use requestAnimationFrame to ensure MDEditor has finished rendering
		const frameId = requestAnimationFrame(() => {
			if (ref.current) {
				void renderMermaidIn(ref.current);
				void renderPlantUmlIn(ref.current, { serverUrl: plantUmlServer });
			}
		});

		return () => cancelAnimationFrame(frameId);
	}, [diagramSource, plantUmlServer]);

	return (
		// Diagram renderers replace DOM nodes outside React, so rebuild their subtree when inputs change.
		<div key={JSON.stringify([diagramSource, plantUmlServer])} ref={ref} className="wmde-markdown">
			<MDEditor.Markdown
				source={diagramSource}
				urlTransform={keepHashLinksInCurrentRoute}
				remarkPlugins={remarkPlugins}
			/>
		</div>
	);
}
