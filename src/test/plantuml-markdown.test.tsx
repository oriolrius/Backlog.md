import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import MermaidMarkdown from "../web/components/MermaidMarkdown.tsx";
import { PlantUmlServerProvider } from "../web/contexts/PlantUmlServerContext.tsx";

const DIAGRAM = ["@startuml", "usr --> traefik : http://wb.<IP>.sslip.io", "Alice <|-- Bob", "@enduml"].join("\n");

function renderMarkdown(source: string): Document {
	return new JSDOM(renderToString(<MermaidMarkdown source={source} />)).window.document;
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

function mountDom(): HTMLElement {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
		url: "http://localhost/",
	});
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = activeDom.window as unknown as Window & typeof globalThis;
	globalThis.document = activeDom.window.document as Document;
	globalThis.navigator = activeDom.window.navigator as Navigator;
	globalThis.Element = activeDom.window.Element;
	globalThis.HTMLElement = activeDom.window.HTMLElement;
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(callback, 0);
	globalThis.cancelAnimationFrame = (handle: number) => window.clearTimeout(handle);
	return document.getElementById("root") as HTMLElement;
}

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
});

describe("MermaidMarkdown PlantUML server setting", () => {
	it("renders through the server the configuration provides", async () => {
		const container = mountDom();
		activeRoot = createRoot(container);

		await act(async () => {
			activeRoot?.render(
				<PlantUmlServerProvider serverUrl="https://plantuml.example.com/plantuml">
					<MermaidMarkdown source={`\`\`\`plantuml\n${DIAGRAM}\n\`\`\`\n`} />
				</PlantUmlServerProvider>,
			);
		});
		// The render waits on a requestAnimationFrame tick and then an async encode, so poll rather
		// than guess at a delay that a loaded runner could exceed.
		let image: Element | null = null;
		for (let attempt = 0; attempt < 100 && !image; attempt++) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
			});
			image = container.querySelector(".plantuml img");
		}

		expect(image?.getAttribute("src") ?? "").toStartWith("https://plantuml.example.com/plantuml/svg/");
	});
});
