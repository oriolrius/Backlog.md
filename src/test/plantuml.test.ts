import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { inflateRawSync } from "node:zlib";
import type { JSDOM } from "jsdom";
import { fenceBarePlantUmlBlocks, renderPlantUmlIn } from "../web/utils/plantuml";

interface EngineMock {
	renderToString: (
		lines: string[],
		onSuccess: (svg: string) => void,
		onError: (message: string) => void,
		options?: { dark?: boolean },
	) => void;
}

type PlantUmlTestGlobal = typeof globalThis & { __PLANTUML_MOCK__?: EngineMock };
type DomGlobals = {
	window?: Window & typeof globalThis;
	document?: Document;
	DOMParser?: typeof DOMParser;
};

const testGlobal = globalThis as PlantUmlTestGlobal;
const domGlobal = globalThis as DomGlobals;
const BASE64_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const DIAGRAM = "@startuml\nAlice -> Bob : hello\n@enduml";

let dom: JSDOM;

function containerWithDiagram(language: string, source: string): HTMLElement {
	const { document } = dom.window;
	const container = document.createElement("div");
	const pre = document.createElement("pre");
	const code = document.createElement("code");
	code.className = `language-${language}`;
	code.textContent = source;
	pre.appendChild(code);
	container.appendChild(pre);
	document.body.appendChild(container);
	return container as unknown as HTMLElement;
}

/** Records what the engine was asked to render, and answers with `svg`. */
function mockEngine(svg: string): { calls: { lines: string[]; dark: boolean | undefined }[] } {
	const calls: { lines: string[]; dark: boolean | undefined }[] = [];
	testGlobal.__PLANTUML_MOCK__ = {
		renderToString: (lines, onSuccess, _onError, options) => {
			calls.push({ lines, dark: options?.dark });
			onSuccess(svg);
		},
	};
	return { calls };
}

/** Counts how many times the engine is looked up, so the laziness guard cannot be removed silently. */
function trackEngineReads(): () => number {
	let reads = 0;
	Object.defineProperty(testGlobal, "__PLANTUML_MOCK__", {
		configurable: true,
		get: () => {
			reads++;
			const engine: EngineMock = {
				renderToString: (_lines, onSuccess) => onSuccess('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
			};
			return engine;
		},
	});
	return () => reads;
}

function mockFailingEngine(message: string): void {
	testGlobal.__PLANTUML_MOCK__ = {
		renderToString: (_lines, _onSuccess, onError) => onError(message),
	};
}

/** Reverses the PlantUML URL encoding so tests assert the token a server would decode. */
function decodePlantUmlToken(token: string): string {
	const bytes: number[] = [];
	for (let index = 0; index < token.length; index += 4) {
		let chunk = 0;
		for (let offset = 0; offset < 4; offset++) {
			chunk = (chunk << 6) | BASE64_ALPHABET.indexOf(token[index + offset] ?? "0");
		}
		bytes.push((chunk >> 16) & 255, (chunk >> 8) & 255, chunk & 255);
	}
	return inflateRawSync(Buffer.from(bytes)).toString("utf-8");
}

describe("fenceBarePlantUmlBlocks", () => {
	it("wraps a bare diagram in a plantuml fence", () => {
		expect(fenceBarePlantUmlBlocks(`Before\n\n${DIAGRAM}\n\nAfter`)).toBe(
			`Before\n\n\`\`\`plantuml\n${DIAGRAM}\n\`\`\`\n\nAfter`,
		);
	});

	it("leaves an already fenced diagram untouched", () => {
		const source = `\`\`\`plantuml\n${DIAGRAM}\n\`\`\``;

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("leaves a diagram inside an unrelated fenced block untouched", () => {
		const source = `\`\`\`bash\ncat <<EOF\n${DIAGRAM}\nEOF\n\`\`\``;

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("leaves a diagram without its closing directive untouched", () => {
		const source = "@startuml\nAlice -> Bob : hello\n\nStill prose.";

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("wraps diagram types other than uml", () => {
		const source = "@startmindmap\n* root\n@endmindmap";

		expect(fenceBarePlantUmlBlocks(source)).toBe(`\`\`\`plantuml\n${source}\n\`\`\``);
	});

	it("leaves a diagram inside a fence that is indented under a list item untouched", () => {
		const source = `- Example:\n\n    \`\`\`text\n    ${DIAGRAM.split("\n").join("\n    ")}\n    \`\`\`\n`;

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("fences a diagram inside a list item at the diagram's own indentation", () => {
		const indented = DIAGRAM.split("\n")
			.map((line) => `  ${line}`)
			.join("\n");

		expect(fenceBarePlantUmlBlocks(`- Example:\n\n${indented}\n`)).toBe(
			`- Example:\n\n  \`\`\`plantuml\n${indented}\n  \`\`\`\n`,
		);
	});

	it("leaves an indented code block that documents a diagram untouched", () => {
		const source = DIAGRAM.split("\n")
			.map((line) => `    ${line}`)
			.join("\n");

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("does not capture prose that merely starts a line with the directive", () => {
		const source = "@startuml opens a diagram and the renderer takes over.\n\nSome prose.\n\n@enduml closes it.";

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});

	it("returns markdown without a diagram unchanged", () => {
		const source = "# Heading\n\nSome **markdown** with a `@start` word.";

		expect(fenceBarePlantUmlBlocks(source)).toBe(source);
	});
});

describe("renderPlantUmlIn", () => {
	beforeEach(async () => {
		const { JSDOM } = await import("jsdom");
		dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
		domGlobal.window = dom.window as unknown as Window & typeof globalThis;
		domGlobal.document = dom.window.document as Document;
		domGlobal.DOMParser = dom.window.DOMParser as typeof DOMParser;
		delete testGlobal.__PLANTUML_MOCK__;
	});

	afterEach(() => {
		delete testGlobal.__PLANTUML_MOCK__;
		delete domGlobal.window;
		delete domGlobal.document;
		delete domGlobal.DOMParser;
		dom.window.close();
	});

	it("replaces a fenced plantuml block with the rendered diagram", async () => {
		mockEngine('<svg xmlns="http://www.w3.org/2000/svg"><text>rendered</text></svg>');
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container);

		expect(container.querySelector("pre")).toBeNull();
		expect(container.querySelector(".plantuml svg")?.textContent).toBe("rendered");
	});

	it("renders puml blocks as well", async () => {
		mockEngine('<svg xmlns="http://www.w3.org/2000/svg"><text>rendered</text></svg>');
		const container = containerWithDiagram("puml", DIAGRAM);

		await renderPlantUmlIn(container);

		expect(container.querySelector(".plantuml svg")).toBeTruthy();
	});

	it("passes the diagram source through with angle brackets intact", async () => {
		const engine = mockEngine('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		const container = containerWithDiagram("plantuml", "@startuml\nA -> B : http://wb.<IP>.sslip.io\n@enduml");

		await renderPlantUmlIn(container);

		expect(engine.calls[0]?.lines).toEqual(["@startuml", "A -> B : http://wb.<IP>.sslip.io", "@enduml"]);
	});

	it("renders in dark mode when the page is dark", async () => {
		const engine = mockEngine('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		dom.window.document.documentElement.classList.add("dark");
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container);

		expect(engine.calls[0]?.dark).toBe(true);
	});

	it("keeps the diagram source visible when rendering fails", async () => {
		mockFailingEngine("syntax error");
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container);

		expect(container.querySelector(".plantuml")).toBeNull();
		expect(container.querySelector("pre > code")?.textContent).toBe(DIAGRAM);
	});

	it("strips scripts and event handlers from the rendered diagram", async () => {
		mockEngine(
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
				"<script>globalThis.pwned = true;</script>" +
				'<a xlink:href="javascript:alert(1)"><text onclick="alert(1)">label</text></a>' +
				'<a xlink:href="https://example.com/ok"><text>safe</text></a>' +
				"</svg>",
		);
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container);

		const svg = container.querySelector(".plantuml svg");
		expect(svg).toBeTruthy();
		expect(svg?.querySelector("script")).toBeNull();
		expect(svg?.querySelector("[onclick]")).toBeNull();
		expect(svg?.innerHTML).not.toContain("javascript:");
		expect(svg?.innerHTML).toContain("https://example.com/ok");
	});

	it("does not reach for the engine when the markdown has no diagram", async () => {
		// The engine is ~5 MB of lazily fetched assets, so reading it at all is the cost to avoid.
		const reads = trackEngineReads();
		const container = containerWithDiagram("bash", "echo hello");

		await renderPlantUmlIn(container);

		expect(reads()).toBe(0);
		expect(container.querySelector("pre")).toBeTruthy();
	});

	it("reaches for the engine once a diagram is present", async () => {
		const reads = trackEngineReads();
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container);

		expect(reads()).toBeGreaterThan(0);
	});

	it("brings the diagram source back when the server produces no image", async () => {
		const container = containerWithDiagram("plantuml", DIAGRAM);
		await renderPlantUmlIn(container, { serverUrl: "https://plantuml.example.com/plantuml" });
		const image = container.querySelector(".plantuml img");

		image?.dispatchEvent(new dom.window.Event("error"));

		expect(container.querySelector(".plantuml")).toBeNull();
		expect(container.querySelector("pre > code")?.textContent).toBe(DIAGRAM);
	});

	it("renders through a configured server instead of the bundled engine", async () => {
		let loaded = false;
		testGlobal.__PLANTUML_MOCK__ = {
			renderToString: () => {
				loaded = true;
			},
		};
		const container = containerWithDiagram("plantuml", DIAGRAM);

		await renderPlantUmlIn(container, { serverUrl: "https://plantuml.example.com/plantuml/" });

		const image = container.querySelector(".plantuml img");
		const source = image?.getAttribute("src") ?? "";
		expect(loaded).toBe(false);
		expect(source.startsWith("https://plantuml.example.com/plantuml/svg/")).toBe(true);
		expect(decodePlantUmlToken(source.slice("https://plantuml.example.com/plantuml/svg/".length))).toBe(DIAGRAM);
	});
});
