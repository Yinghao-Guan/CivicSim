/**
 * The top bar shared with the main app's City Twin (web/src/components/studio/StudioScreen.tsx).
 * Plain links: "/" and "/studio" live in the main app, outside this zone's basePath.
 */
export default function SiteNav() {
  return (
    <header className="site-nav">
      <div className="site-nav__left">
        <a href="/" className="site-nav__brand">CivicSim</a>
        <nav className="site-nav__switch" aria-label="CivicSim sections">
          <a href="/studio">City Twin</a>
          <a href="/community/board" aria-current="page">Community Board</a>
        </nav>
      </div>
      <span className="site-nav__place">South Park · Council District 9</span>
    </header>
  );
}
