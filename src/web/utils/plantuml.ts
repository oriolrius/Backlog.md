// The engine is imported through Bun's `file` loader, so these resolve to asset URLs and the
// ~5 MB of PlantUML/Graphviz code stays out of the browser chunk until a diagram needs it.
import engineAssetUrl from "@plantuml/core/plantuml.js" with { type: "file" };
import themesAssetUrl from "@plantuml/core/themes.js" with { type: "file" };
import vizAssetUrl from "@plantuml/core/viz-global.js" with { type: "file" };
import { fencedCodeLines } from "./markdown-fences";

interface PlantUmlModule {
	renderToString: (
		lines: string[],
		onSuccess: (svg: string) => void,
		onError: (message: string) => void,
		options?: { dark?: boolean },
	) => void;
}

type PlantUmlGlobal = typeof globalThis & {
	__PLANTUML_MOCK__?: PlantUmlModule;
	Viz?: unknown;
};

export interface PlantUmlRenderOptions {
	/** Render through this PlantUML server instead of the bundled engine. */
	serverUrl?: string | undefined;
}

const CODE_BLOCK_SELECTOR = "pre > code.language-plantuml, pre > code.language-puml";
const WRAPPER_CLASS = "plantuml";
// The directive must own its line, apart from PlantUML's optional diagram name, so that prose
// mentioning @startuml cannot capture the paragraphs that follow it. Four spaces or more would be
// an indented code block, which stays code.
const START_REGEX = /^( {0,3})@start([a-z]+)(?:[ \t]+\S+)?[ \t\r]*$/i;
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
// Everything that can run code or retarget a link once the SVG is in the document.
const UNSAFE_ELEMENTS = new Set(["script", "foreignobject", "animate", "animatetransform", "set", "handler"]);
const BASE64_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

let enginePromise: Promise<PlantUmlModule> | null = null;

/**
 * Wraps bare `@startuml ... @enduml` regions in a plantuml code fence so they reach the renderer
 * instead of being parsed as prose. Regions already inside a code fence are left alone, and a
 * region without its closing `@end...` is not touched so it cannot swallow the rest of the document.
 */
export function fenceBarePlantUmlBlocks(source: string): string {
	if (!source.includes("@start")) return source;

	const lines = source.split("\n");
	const fenced = fencedCodeLines(source);
	const result: string[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const start = fenced[index] ? null : START_REGEX.exec(line);
		const end = start ? findClosingLine(lines, fenced, index, start[2] ?? "") : -1;
		if (end === -1) {
			result.push(line);
			continue;
		}

		// Fence at the diagram's own indentation so a diagram inside a list stays in that list.
		const indent = start?.[1] ?? "";
		result.push(`${indent}\`\`\`plantuml`);
		for (let inner = index; inner <= end; inner++) result.push(lines[inner] ?? "");
		result.push(`${indent}\`\`\``);
		index = end;
	}

	return result.join("\n");
}

function findClosingLine(lines: string[], fenced: boolean[], start: number, keyword: string): number {
	const endRegex = new RegExp(`^[ \\t]*@end${keyword}[ \\t\\r]*$`, "i");
	for (let index = start + 1; index < lines.length; index++) {
		if (fenced[index]) return -1;
		if (endRegex.test(lines[index] ?? "")) return index;
	}
	return -1;
}

/**
 * Replaces every rendered PlantUML code block inside `element` with its diagram. Blocks that fail
 * to render keep their original source visible.
 */
export async function renderPlantUmlIn(element: HTMLElement, options: PlantUmlRenderOptions = {}): Promise<void> {
	// Check for diagrams before touching the engine so plain markdown never downloads it.
	const blocks = Array.from(element.querySelectorAll(CODE_BLOCK_SELECTOR)) as HTMLElement[];
	if (blocks.length === 0) return;

	const diagrams = blocks
		.map((code) => ({ block: code.parentElement, source: code.textContent ?? "" }))
		.filter((diagram): diagram is { block: HTMLElement; source: string } => Boolean(diagram.block));

	if (options.serverUrl) {
		for (const diagram of diagrams) {
			await renderThroughServer(diagram.block, diagram.source, options.serverUrl);
		}
		return;
	}

	let engine: PlantUmlModule;
	try {
		engine = await ensurePlantUml();
	} catch (error) {
		console.warn("Failed to load PlantUML", error);
		return;
	}

	const dark = isDarkMode();
	for (const diagram of diagrams) {
		try {
			const svg = await renderToSvg(engine, diagram.source, dark);
			const diagramElement = parseDiagramSvg(svg);
			if (diagramElement) mount(diagram.block, diagramElement);
		} catch (error) {
			console.warn("plantuml render failed", error);
		}
	}
}

async function renderThroughServer(block: HTMLElement, source: string, serverUrl: string): Promise<void> {
	try {
		const image = document.createElement("img");
		image.src = `${serverUrl.replace(/\/+$/, "")}/svg/${await encodePlantUmlSource(source)}`;
		image.alt = "PlantUML diagram";
		const wrapper = mount(block, image);
		// The server answers after the swap, so put the source back if it never produces an image.
		image.addEventListener("error", () => wrapper.replaceWith(block), { once: true });
	} catch (error) {
		console.warn("plantuml render failed", error);
	}
}

function mount(block: HTMLElement, diagram: Element): HTMLElement {
	const wrapper = document.createElement("div");
	wrapper.className = WRAPPER_CLASS;
	wrapper.appendChild(diagram);
	block.replaceWith(wrapper);
	return wrapper;
}

function isDarkMode(): boolean {
	return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

async function ensurePlantUml(): Promise<PlantUmlModule> {
	const mock = (globalThis as PlantUmlGlobal).__PLANTUML_MOCK__;
	if (mock) return mock;

	if (!enginePromise) {
		enginePromise = loadEngine().catch((error: unknown) => {
			enginePromise = null;
			throw error;
		});
	}
	return enginePromise;
}

async function loadEngine(): Promise<PlantUmlModule> {
	// The specifiers are computed so the bundler leaves these as runtime requests for the assets.
	const viz = (await import(assetSpecifier(vizAssetUrl))) as { default?: unknown };
	(globalThis as PlantUmlGlobal).Viz ??= viz.default ?? viz;
	// Registers globalThis.PLANTUML_THEMES, which the engine needs for `!theme` directives.
	await import(assetSpecifier(themesAssetUrl));
	return (await import(assetSpecifier(engineAssetUrl))) as PlantUmlModule;
}

function assetSpecifier(url: string): string {
	return new URL(url, document.baseURI).href;
}

function renderToSvg(engine: PlantUmlModule, source: string, dark: boolean): Promise<string> {
	return new Promise((resolve, reject) => {
		engine.renderToString(source.split("\n"), resolve, (message) => reject(new Error(message)), { dark });
	});
}

/** Parses engine output into a sanitized SVG element, or null when it is not usable SVG. */
function parseDiagramSvg(markup: string): Element | null {
	const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
	const svg = parsed.documentElement;
	if (svg?.localName.toLowerCase() !== "svg" || parsed.getElementsByTagName("parsererror").length > 0) {
		return null;
	}
	sanitizeSvg(svg);
	return document.importNode(svg, true);
}

/** Strips anything in the generated SVG that could execute, since diagram text is user content. */
function sanitizeSvg(node: Element): void {
	for (const child of Array.from(node.children)) {
		// The local name, not the qualified one: <h:script> is still a script once imported.
		if (UNSAFE_ELEMENTS.has(child.localName.toLowerCase())) {
			child.remove();
			continue;
		}
		sanitizeSvg(child);
	}

	for (const attribute of Array.from(node.attributes)) {
		const name = attribute.name.toLowerCase();
		if (name.startsWith("on") || ((name === "href" || name.endsWith(":href")) && !isSafeLink(attribute.value))) {
			node.removeAttributeNode(attribute);
		}
	}
}

function isSafeLink(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.startsWith("#")) return true;
	try {
		return SAFE_LINK_PROTOCOLS.has(new URL(trimmed, document.baseURI).protocol);
	} catch {
		return false;
	}
}

/** Encodes diagram source the way PlantUML servers expect: raw deflate, then PlantUML's base64. */
async function encodePlantUmlSource(source: string): Promise<string> {
	const stream = new Blob([new TextEncoder().encode(source)])
		.stream()
		.pipeThrough(new CompressionStream("deflate-raw"));
	const deflated = new Uint8Array(await new Response(stream).arrayBuffer());

	let encoded = "";
	for (let index = 0; index < deflated.length; index += 3) {
		const chunk = ((deflated[index] ?? 0) << 16) | ((deflated[index + 1] ?? 0) << 8) | (deflated[index + 2] ?? 0);
		encoded += encode6bit(chunk >> 18) + encode6bit(chunk >> 12) + encode6bit(chunk >> 6) + encode6bit(chunk);
	}
	return encoded;
}

function encode6bit(value: number): string {
	return BASE64_ALPHABET[value & 63] ?? "";
}
