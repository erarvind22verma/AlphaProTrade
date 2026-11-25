export default function FrontendLink() {
  const webURL = process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:5173'
  return (
    <div className="alphaprotrade-admin-web-link">
      <a href={webURL} target="_blank" rel="noreferrer">
        <span aria-hidden="true">↗</span>
        <span>Open AlphaProTrade</span>
      </a>
    </div>
  )
}
