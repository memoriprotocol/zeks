export default function Footer() {
  const platform = [
    { label: "Markets", href: "#markets" },
    { label: "Earn", href: "#earn" },
    { label: "Borrow", href: "#borrow" },
    { label: "Portfolio", href: "#portfolio" },
    { label: "Launchpad", href: "/launchpad" },
  ]

  const resources = [
    { label: "Docs", href: "#" },
    { label: "Security", href: "#" },
    { label: "Risk", href: "#" },
    { label: "About", href: "#" },
  ]

  const social = [
    { label: "X", href: "#" },
    { label: "Discord", href: "#" },
  ]

  const legal = [
    { label: "Terms", href: "#" },
    { label: "Privacy", href: "#" },
  ]

  return (
    <footer className="py-12 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <span className="font-mono text-base font-semibold tracking-tight">ZEKS</span>
            <p className="text-xs font-mono text-muted-foreground mt-2">Markets. Capital. Onchain.</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">zeks.fun</p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-mono text-muted-foreground mb-4">PLATFORM</h4>
            <ul className="space-y-2">
              {platform.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm hover:text-primary transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-mono text-muted-foreground mb-4">RESOURCES</h4>
            <ul className="space-y-2">
              {resources.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm hover:text-primary transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="text-xs font-mono text-muted-foreground mb-4">SOCIAL</h4>
            <ul className="space-y-2">
              {social.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm hover:text-primary transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-mono text-muted-foreground mb-4">LEGAL</h4>
            <ul className="space-y-2">
              {legal.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm hover:text-primary transition-colors">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-12 pt-8 border-t border-border gap-2">
          <p className="text-xs text-muted-foreground font-mono">©2026 ZEKS</p>
          <p className="text-xs text-muted-foreground font-mono">ALL SYSTEMS OPERATIONAL</p>
        </div>
      </div>
    </footer>
  )
}
