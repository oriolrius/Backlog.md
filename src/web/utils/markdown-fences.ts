const FENCE_REGEX = /^([ \t]*)(`{3,}|~{3,})/;
const INDENT_REGEX = /^[ \t]*/;

interface CodeFence {
	readonly marker: string;
	readonly indent: number;
}

/**
 * For each line of `source`, whether it belongs to a fenced code block, fence lines included.
 * Callers use this to leave code alone while rewriting prose.
 */
export function fencedCodeLines(source: string): boolean[] {
	const lines = source.split("\n");
	const fenced = lines.map(() => false);
	let fence: CodeFence | null = null;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";

		if (fence) {
			if (isClosingFence(line, fence)) {
				fenced[index] = true;
				fence = null;
				continue;
			}
			if (!leavesContainer(line, fence)) {
				fenced[index] = true;
				continue;
			}
			// The block that held the fence ended, so the fence did too, and this line is prose.
			fence = null;
		}

		fence = openingFence(line);
		if (fence) fenced[index] = true;
	}

	return fenced;
}

function openingFence(line: string): CodeFence | null {
	const match = FENCE_REGEX.exec(line);
	const marker = match?.[2];
	if (!marker) return null;
	// A backtick fence's info string may not contain another backtick.
	if (marker.startsWith("`") && line.slice(match[0].length).includes("`")) return null;
	return { marker, indent: indentWidth(match[1] ?? "") };
}

function isClosingFence(line: string, fence: CodeFence): boolean {
	const match = FENCE_REGEX.exec(line);
	const marker = match?.[2];
	if (!marker || marker[0] !== fence.marker[0] || marker.length < fence.marker.length) return false;
	return line.slice(match[0].length).trim() === "";
}

/**
 * Markdown also ends a fenced block when the block containing it ends, which a line scanner can
 * only see as a non-blank line indented less than the fence itself.
 */
function leavesContainer(line: string, fence: CodeFence): boolean {
	if (line.trim() === "") return false;
	return indentWidth(INDENT_REGEX.exec(line)?.[0] ?? "") < fence.indent;
}

function indentWidth(whitespace: string): number {
	let width = 0;
	for (const character of whitespace) width += character === "\t" ? 4 - (width % 4) : 1;
	return width;
}
