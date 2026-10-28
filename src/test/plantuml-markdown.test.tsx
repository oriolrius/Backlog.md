import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import MermaidMarkdown from "../web/components/MermaidMarkdown.tsx";
import { PlantUmlServerProvider } from "../web/contexts/PlantUmlServerContext.tsx";

const DIAGRAM = ["@startuml", "usr --> traefik : http://wb.<IP>.sslip.io", "Alice <|-- Bob", "@enduml"].join("\n");
const SERVER_URL = "https://plantuml.example.com/plantuml";
const renderedDoms: JSDOM[] = [];

function renderMarkdown(source: string): Document {
	const dom = new JSDOM(renderToString(<MermaidMarkdown source={source} />));
	renderedDoms.push(dom);
	return dom.window.document;
}

function diagramSources(rendered: Document): string[] {
	return Array.from(rendered.querySelectorAll("pre > code.language-plantuml, pre > code.language-puml")).map(
		(code) => code.textContent ?? "",
	);
}

describe("MermaidMarkdown PlantUML blocks", () => {
	it("exposes a fenced plantuml block for the renderer", () => {
		const rendered = renderMarkdown(`Before\n\n\`\`\`plantuml\n${DIAGRAM}\n\`\`\`\n`);

		expect(diagramSources(rendered)).toEqual([`${DIAGRAM}\n`]);
	});

	it("exposes a fenced puml block for the renderer", () => {
		const rendered = renderMarkdown(`\`\`\`puml\n${DIAGRAM}\n\`\`\`\n`);

		expect(diagramSources(rendered)).toEqual([`${DIAGRAM}\n`]);
	});

	it("exposes a bare diagram that was never fenced", () => {
		const rendered = renderMarkdown(`Architecture:\n\n${DIAGRAM}\n\nThat is the layout.`);

		expect(diagramSources(rendered)).toEqual([`${DIAGRAM}\n`]);
		expect(rendered.body.textContent).toContain("That is the layout.");
	});

	it("keeps angle brackets in diagram source instead of escaping them", () => {
		const rendered = renderMarkdown(`\`\`\`plantuml\n${DIAGRAM}\n\`\`\`\n`);

		expect(diagramSources(rendered)[0]).toContain("http://wb.<IP>.sslip.io");
		expect(diagramSources(rendered)[0]).not.toContain("&lt;IP&gt;");
	});

	it.each(["plantuml", "puml", "text"])("preserves unindented content inside an indented %s fence", (language) => {
		const rendered = renderMarkdown(`  \`\`\`${language}\n${DIAGRAM}\n  \`\`\`\n`);
		const blocks = rendered.querySelectorAll("pre > code");

		expect(blocks).toHaveLength(1);
		expect(blocks[0]?.textContent).toBe(`${DIAGRAM}\n`);
		expect(blocks[0]?.classList.contains(`language-${language}`)).toBe(true);
	});

	it.each(["plantuml", "puml"])("preserves source inside a blockquoted %s fence", (language) => {
		const quoted = DIAGRAM.split("\n").map((line) => `> ${line}`).join("\n");
		const rendered = renderMarkdown(`> \`\`\`${language}\n${quoted}\n> \`\`\`\n`);

		expect(diagramSources(rendered)).toEqual([`${DIAGRAM}\n`]);
		expect(rendered.querySelector("blockquote pre > code")).toBeTruthy();
	});

	it("preserves source when a nested list fence is more indented than its content", () => {
		const indented = DIAGRAM.split("\n").map((line) => `    ${line}`).join("\n");
		const rendered = renderMarkdown(`- Outer\n  - Inner\n\n      \`\`\`plantuml\n${indented}\n      \`\`\`\n`);

		expect(diagramSources(rendered)).toEqual([`${DIAGRAM}\n`]);
		expect(rendered.querySelector("li li pre > code")).toBeTruthy();
	});

	it("preserves indented code that documents a diagram", () => {
		const indented = DIAGRAM.split("\n").map((line) => `    ${line}`).join("\n");
		const rendered = renderMarkdown(indented);

		expect(diagramSources(rendered)).toEqual([]);
		expect(rendered.querySelector("pre > code")?.textContent).toBe(`${DIAGRAM}\n`);
	});

	it("keeps escaping prose after a fence closed by its blockquote", () => {
		const rendered = renderMarkdown("> ```text\n> code\n\nReturns Result<int> today.\n");

		expect(rendered.body.textContent).toContain("Returns Result<int> today.");
		expect(rendered.querySelector("int")).toBeNull();
	});

	it("still escapes angle brackets outside code blocks", () => {
		const rendered = renderMarkdown("Returns Result<List<MenuItem>> from the API.");

		expect(rendered.body.textContent).toContain("Result<List<MenuItem>>");
		expect(rendered.querySelector("list")).toBeNull();
	});

	it("leaves mermaid blocks untouched", () => {
		const rendered = renderMarkdown("```mermaid\ngraph TD\nA --> B\n```\n");

		expect(rendered.querySelector("pre > code.language-mermaid")).toBeTruthy();
		expect(diagramSources(rendered)).toEqual([]);
	});

	it("keeps angle brackets inside a fence indented under a list item", () => {
		const rendered = renderMarkdown("- Example:\n\n    ```text\n    Result<int>\n    ```\n");

		expect(rendered.querySelector("pre > code")?.textContent).toContain("Result<int>");
	});

	it("keeps escaping prose after a fence that its list item closed", () => {
		// The fence never gets a closing line; the list ending is what ends it.
		const rendered = renderMarkdown("- Item:\n\n  ```text\n  code\n\nReturns Result<int> today.\n");

		expect(rendered.body.textContent).toContain("Returns Result<int> today.");
		expect(rendered.querySelector("int")).toBeNull();
	});
});

let activeRoot: Root | null = null;
let activeDom: JSDOM | null = null;
let savedGlobals: [string, PropertyDescriptor | undefined][] = [];

function mountDom(): HTMLElement {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost/",
	});
	const domWindow = activeDom.window;
	const globals = {
		IS_REACT_ACT_ENVIRONMENT: true,
		window: domWindow,
		document: domWindow.document,
		navigator: domWindow.navigator,
		Element: domWindow.Element,
		HTMLElement: domWindow.HTMLElement,
		DOMParser: domWindow.DOMParser,
		requestAnimationFrame: (callback: FrameRequestCallback) => domWindow.setTimeout(callback, 0),
		cancelAnimationFrame: (handle: number) => domWindow.clearTimeout(handle),
		__PLANTUML_MOCK__: {
			renderToString: (lines: string[], onSuccess: (svg: string) => void) => {
				const text = domWindow.document.createElementNS("http://www.w3.org/2000/svg", "text");
				text.textContent = lines.join("\n");
				onSuccess(`<svg xmlns="http://www.w3.org/2000/svg">${text.outerHTML}</svg>`);
			},
		},
	};
	savedGlobals = Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
	for (const [name, value] of Object.entries(globals)) {
		Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
	}
	const container = document.getElementById("root") as HTMLElement;
	activeRoot = createRoot(container);
	return container;
}

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
	for (const [name, descriptor] of savedGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	savedGlobals = [];
	for (const dom of renderedDoms.splice(0)) dom.window.close();
});

async function renderWithServer(serverUrl?: string, source = DIAGRAM): Promise<void> {
	await act(async () => {
		activeRoot?.render(
			<PlantUmlServerProvider serverUrl={serverUrl}>
				<MermaidMarkdown source={`\`\`\`plantuml\n${source}\n\`\`\`\n`} />
			</PlantUmlServerProvider>,
		);
	});
}

async function waitForDiagram(container: HTMLElement, serverUrl?: string): Promise<Element> {
	const selector = serverUrl ? `.plantuml img[src^="${serverUrl}/svg/"]` : ".plantuml svg";
	for (let attempt = 0; attempt < 100; attempt++) {
		const diagram = container.querySelector(selector);
		if (diagram) return diagram;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
	throw new Error(`Diagram did not render: ${selector}\n${container.innerHTML}`);
}

describe("MermaidMarkdown PlantUML server setting", () => {
	it("renders through the server the configuration provides", async () => {
		const container = mountDom();
		await renderWithServer(SERVER_URL);
		const image = await waitForDiagram(container, SERVER_URL);

		expect(image.getAttribute("src")).toStartWith(`${SERVER_URL}/svg/`);
	});

	it.each([
		["local to server", undefined, SERVER_URL],
		["server to local", SERVER_URL, undefined],
		["server to server", SERVER_URL, "https://another.example.com/plantuml"],
	])("updates an open diagram from %s", async (_label, initialServer, nextServer) => {
		const container = mountDom();
		await renderWithServer(initialServer);
		await waitForDiagram(container, initialServer);

		await renderWithServer(nextServer);
		await waitForDiagram(container, nextServer);

		expect(container.querySelectorAll(".plantuml")).toHaveLength(1);
		expect(container.querySelector(nextServer ? ".plantuml svg" : ".plantuml img")).toBeNull();
	});

	it("updates an open diagram when its Markdown source changes", async () => {
		const container = mountDom();
		await renderWithServer();
		await waitForDiagram(container);

		const updatedSource = DIAGRAM.replace("traefik", "updated");
		await renderWithServer(undefined, updatedSource);
		const diagram = await waitForDiagram(container);

		expect(diagram.textContent).toBe(`${updatedSource}\n`);
	});

	it("keeps the current server diagram when an earlier local render completes late", async () => {
		const container = mountDom();
		const started = Promise.withResolvers<(svg: string) => void>();
		Object.assign(globalThis, {
			__PLANTUML_MOCK__: {
				renderToString: (_lines: string[], onSuccess: (svg: string) => void) => started.resolve(onSuccess),
			},
		});
		await renderWithServer();
		const finishLocalRender = await started.promise;
		await renderWithServer(SERVER_URL);
		await waitForDiagram(container, SERVER_URL);

		await act(async () => {
			finishLocalRender('<svg xmlns="http://www.w3.org/2000/svg"><text>old diagram</text></svg>');
		});

		expect(container.querySelector(".plantuml svg")).toBeNull();
		expect(container.querySelector(".plantuml img")?.getAttribute("src")).toStartWith(`${SERVER_URL}/svg/`);
	});
});
