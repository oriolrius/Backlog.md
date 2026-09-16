// The PlantUML engine is imported with Bun's `file` loader so the bundler emits it as a
// standalone asset instead of inlining ~5 MB into the browser chunk. Each import therefore
// resolves to the emitted asset URL, not to the module's exports.
declare module "@plantuml/core/plantuml.js" {
	const url: string;
	export default url;
}

declare module "@plantuml/core/viz-global.js" {
	const url: string;
	export default url;
}

declare module "@plantuml/core/themes.js" {
	const url: string;
	export default url;
}
