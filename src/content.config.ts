import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blogSchema = ({ image }: { image: any }) =>
  z.object({
    title: z.string(),
    published: z.coerce.date(),
    type: z.enum(['article', 'writeup', 'project']).default('article'),
    draft: z.boolean().optional().default(false),
    description: z.string().optional(),
    author: z.string().optional(),
    series: z.string().optional(),
    part: z.number().optional(),
    tags: z.array(z.string()).optional().default([]),
    coverImage: z
      .strictObject({
        src: image(),
        alt: z.string(),
      })
      .optional(),
    toc: z.boolean().optional().default(true),
    github: z.array(z.string()).optional().default([]),
  })

const blogCollection = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/blog' }),
  schema: blogSchema,
})

const homeCollection = defineCollection({
  loader: glob({ pattern: ['home.md', 'home.mdx'], base: './src/content' }),
  schema: ({ image }) =>
    z.object({
      avatarImage: z
        .object({
          src: image(),
          alt: z.string().optional().default('My avatar'),
        })
        .optional(),
      githubCalendar: z.string().optional(),
    }),
})

const addendumCollection = defineCollection({
  loader: glob({ pattern: ['addendum.md', 'addendum.mdx'], base: './src/content' }),
  schema: ({ image }) =>
    z.object({
      avatarImage: z
        .object({
          src: image(),
          alt: z.string().optional().default('My avatar'),
        })
        .optional(),
    }),
})

export const collections = {
  blog: blogCollection,
  home: homeCollection,
  addendum: addendumCollection,
}
