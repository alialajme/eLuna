import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-sand bg-ink mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <p className="font-display text-display-md font-bold tracking-widest text-ivory mb-4">
              LUNA
            </p>
            <p className="text-body-sm text-mist">
              The Gulf's AI-powered abaya marketplace
            </p>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Shop</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><Link href="/browse?category=Occasion" className="hover:text-ivory transition-colors">Occasion</Link></li>
              <li><Link href="/browse?category=Everyday" className="hover:text-ivory transition-colors">Everyday</Link></li>
              <li><Link href="/browse?category=Travel" className="hover:text-ivory transition-colors">Travel</Link></li>
              <li><Link href="/browse?category=Sport" className="hover:text-ivory transition-colors">Sport</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Luna</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><Link href="/chat" className="hover:text-ivory transition-colors">AI Stylist</Link></li>
              <li><Link href="/profile/size" className="hover:text-ivory transition-colors">Size Profile</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-label uppercase text-gold mb-3">Help</h3>
            <ul className="space-y-2 text-body-sm text-mist">
              <li><p className="text-mist">Shipping &amp; Returns</p></li>
              <li><p className="text-mist">Size Guide</p></li>
              <li><a href="https://sell.luna.ae" target="_blank" rel="noopener noreferrer" className="hover:text-ivory transition-colors">Sell on Luna</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-sand/30 pt-6 text-center text-body-sm text-mist">
          © 2026 Luna. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
