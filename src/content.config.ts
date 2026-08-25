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

const TRUCK_LOG_SYSTEMS = [
	"story",
	"fuel",
	"engine",
	"cooling",
	"electrical",
	"brakes",
	"suspension",
	"transmission",
	"body",
	"interior",
	"other",
] as const;

const truckLog = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/truck-log" }),
	schema: z.object({
		date: z.date(),
		title: z.string(),
		system: z.enum(TRUCK_LOG_SYSTEMS),
		parts: z
			.array(
				z.object({
					name: z.string(),
					cost: z.number(),
				}),
			)
			.default([]),
		hours: z.number().default(0),
		people: z.array(z.string()).default([]),
	}),
});

export const collections = { projects, truckLog };
