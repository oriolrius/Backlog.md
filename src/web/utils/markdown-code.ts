import { fromMarkdown } from "mdast-util-from-markdown";

/** Code-block lines, including fences, using the preview's CommonMark parser for container boundaries. */
export function codeBlockLines(source: string): boolean[] {
	const codeLines = source.split("\n").map(() => false);
	const nodes = [...fromMarkdown(source).children];

	while (nodes.length > 0) {
		const node = nodes.pop();
		if (node?.type === "code" && node.position) {
			for (let index = node.position.start.line - 1; index < node.position.end.line; index++) {
				codeLines[index] = true;
			}
		} else if (node && "children" in node) {
			nodes.push(...node.children);
		}
	}

	return codeLines;
}
