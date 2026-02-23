import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const postSchema = ({ image }: { image: any }) =>
  z.object({
    title: z.string(),
    published: z.coerce.date(),
    // updated: z.coerce.date().optional(),
    draft: z.boolean().optional().default(false),
    description: z.string().optional(),
    author: z.string().optional(),
    series: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    coverImage: z
      .strictObject({
        src: image(),
        alt: z.string(),
      })
      .optional(),
    toc: z.boolean().optional().default(true),
    github: z.string().optional(),
  })

const postsCollection = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/posts' }),
  schema: postSchema,
})

const articlesCollection = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/articles' }),
  schema: postSchema,
})

const writeupsCollection = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/writeups' }),
  schema: postSchema,
})

const projectsCollection = defineCollection({
  loader: glob({ pattern: ['**/*.md', '**/*.mdx'], base: './src/content/projects' }),
  schema: postSchema,
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
      githubCalendar: z.string().optional(), // GitHub username for calendar
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
  posts: postsCollection,
  articles: articlesCollection,
  writeups: writeupsCollection,
  projects: projectsCollection,
  home: homeCollection,
  addendum: addendumCollection,
}
