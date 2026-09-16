import { useEffect, useMemo, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import { usePlantUmlServer } from "../contexts/PlantUmlServerContext";
import { useTaskIdIndex } from "../contexts/TaskIdIndexContext";
import { fencedCodeLines } from "../utils/markdown-fences";
import { renderMermaidIn } from "../utils/mermaid";
import { fenceBarePlantUmlBlocks, renderPlantUmlIn } from "../utils/plantuml";
import { createTaskIdLinkPlugin } from "../utils/task-id-links";

interface Props {
	source: string;
}

const URI_AUTOLINK_PREFIX_REGEX = /^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\u0000-\u0020]*>/;
const EMAIL_AUTOLINK_PREFIX_REGEX = /^<[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z0-9-]+>/;

function escapeAngleBrackets(line: string): string {
	return line.replace(/<(?=[A-Za-z])/g, (match, offset, fullText) => {
		const remaining = fullText.slice(offset);
		if (URI_AUTOLINK_PREFIX_REGEX.test(remaining) || EMAIL_AUTOLINK_PREFIX_REGEX.test(remaining)) {
			return match;
		}
		return "&lt;";
	});
}

// Fenced code is already rendered inertly, and escaping inside it would corrupt diagram source
// such as `<IP>` or `<<interface>>`, so only prose is escaped.
function sanitizeMarkdownSource(source: string): string {
	const fenced = fencedCodeLines(source);

	return source
		.split("\n")
		.map((line, index) => (fenced[index] ? line : escapeAngleBrackets(line)))
		.join("\n");
}

function keepHashLinksInCurrentRoute(url: string, key: string): string {
	if (key !== "href" || !url.startsWith("#") || typeof window === "undefined") {
		return url;
	}

	return `${window.location.pathname}${window.location.search}${url}`;
}

export default function MermaidMarkdown({ source }: Props) {
	const ref = useRef<HTMLDivElement | null>(null);
	const safeSource = useMemo(() => sanitizeMarkdownSource(fenceBarePlantUmlBlocks(source)), [source]);
	const taskIdIndex = useTaskIdIndex();
	const plantUmlServer = usePlantUmlServer();
	const remarkPlugins = useMemo(() => [createTaskIdLinkPlugin(taskIdIndex)], [taskIdIndex]);

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
	}, [safeSource, plantUmlServer]);

	return (
		<div ref={ref} className="wmde-markdown">
			<MDEditor.Markdown
				source={safeSource}
				urlTransform={keepHashLinksInCurrentRoute}
				remarkPlugins={remarkPlugins}
			/>
		</div>
	);
}
