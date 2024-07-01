import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
import solidJs from "@astrojs/solid-js";
import arraybuffer from "vite-plugin-arraybuffer";

// https://astro.build/config
export default defineConfig({
	integrations: [tailwind(), solidJs()],
	build: {
		// This is to ensure `/404.html` over `/404/index.html` for Cloudflare Pages.
		// This will help Cloudflare Pages find the closest match for a 404 page.
		format: "file",
	},
	vite: {
		plugins: [
			generateContentManifest(),
			solidMarkdownEntrypoint(),
			arraybuffer(),
		],
	},
});

// TODO: It would be good if this could all be either in Astro or an Astro plugin?

import type { Plugin } from "vite";
import path from "node:path";
import fs from "node:fs/promises";

function generateContentManifest(): Plugin {
	const srcPath = path.resolve("src");
	const basePath = path.resolve(srcPath, "content", "docs");

	const run = async () => {
		const files = await fs.readdir(basePath, {
			withFileTypes: true,
			recursive: true,
		});

		await fs.writeFile(
			"./src/routes.gen.tsx",
			`// @ts-nocheck\n// DO NOT MODIFY THIS FILE. It's generated by a Vite plugin!\n\nexport const manifest = {
${files
	.filter((file) => file.isFile())
	.map(
		(file) =>
			// `file.parentPath` is not defined on Linux so don't trust it.
			`\t"${path.sep + path.relative(basePath, file.path) + path.sep + path.parse(file.name).name}": () => import(".${path.sep + path.relative(srcPath, file.path) + path.sep + file.name}?markdown"),`,
	)
	.join("\n")}\n} satisfies Record<string, () => unknown>;`,
		);
	};

	return {
		name: "generate-content-manifest",

		buildStart() {
			run();
			this.addWatchFile("content");
		},

		watchChange(id) {
			if (id.endsWith(".md")) run();
		},
	};
}

function solidMarkdownEntrypoint(): Plugin {
	return {
		name: "solid-markdown-entrypoint",

		resolveId(id) {
			const [idRaw, queryRaw] = id.split("?");
			const query = new URLSearchParams(queryRaw);

			if (query.has("markdown")) return `\0${id}`;
		},

		load(id) {
			const [idRaw, queryRaw] = id.split("?");
			const query = new URLSearchParams(queryRaw);

			if (query.has("markdown")) {
				return `import { compiledContent } from "${idRaw}";
import { ssr, ssrHydrationKey } from "solid-js/web";

export default function Component() {
	if (import.meta.env.SSR) return ssr([compiledContent()]); // TODO: , ssrHydrationKey()

	const child = document.createElement("div");
	child.innerHTML = compiledContent();
	return child;
}`;
			}
		},
	};
}
