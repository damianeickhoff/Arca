import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      // Optional heading row extras, drawn by src/components/PageTitle.astro:
      //   subtitle: a line under the page title
      //   titleAction: a black pill on the right of the title, { text, link }
      extend: z.object({
        subtitle: z.string().optional(),
        titleAction: z.object({ text: z.string(), link: z.string() }).optional(),
      }),
    }),
  }),
};
