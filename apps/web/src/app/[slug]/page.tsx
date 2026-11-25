import { notFound } from 'next/navigation'

import App from '../../App'

export default async function PublicSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== 'about') notFound()
  return <App />
}
