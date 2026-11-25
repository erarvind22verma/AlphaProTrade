import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Features } from './collections/Features'
import { FeatureEntitlements } from './collections/FeatureEntitlements'
import { SubscriptionPlans } from './collections/SubscriptionPlans'
import { UserSubscriptions } from './collections/UserSubscriptions'
import { UserWidgetSubscriptions } from './collections/UserWidgetSubscriptions'
import { Pages } from './collections/Pages'
import { Banners } from './collections/Banners'
import { News } from './collections/News'
import { FAQs } from './collections/FAQs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    theme: 'all',
    meta: {
      titleSuffix: ' | AlphaProTrade CMS',
      icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/brand/alphaprotrade_mark.svg' }],
      openGraph: { title: 'AlphaProTrade CMS', description: 'Market intelligence content administration.' },
    },
    components: {
      graphics: {
        Icon: '@/components/admin/branding/Icon',
        Logo: '@/components/admin/branding/Logo',
      },
      afterNavLinks: ['@/components/admin/branding/FrontendLink'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Features, SubscriptionPlans, UserSubscriptions, UserWidgetSubscriptions, FeatureEntitlements, Pages, Banners, News, FAQs],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Phase 5 uses reviewed migrations; avoid development schema push at startup.
    push: false,
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
