import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 't7n5swxf',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
})
