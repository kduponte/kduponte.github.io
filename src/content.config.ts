import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		status: z.enum(["coming-soon", "in-progress", "live"]).default("live"),
		tags: z.array(z.string()).default([]),
		date: z.date().optional(),
		heroImage: z.string().optional(),
		externalUrl: z.string().url().optional(),
		repoUrl: z.string().url().optional(),
		order: z.number().default(0),
	}),
});

export const collections = { projects };
