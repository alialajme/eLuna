# AYVANA Mobile — Product context

The native iOS/Android customer app for **AYVANA — The Abaya Marketplace**, an
AI-powered marketplace for the abaya and modest-fashion industry in the UAE /
GCC. This surface is the customer storefront on phone and tablet; it reuses the
established AYVANA web brand system and talks to the existing web backend over
HTTP (`/api/mobile/*`).

## Audience & job
Arabic- and English-speaking modest-fashion buyers in the Gulf, shopping abayas
from multiple boutiques/ateliers. Primary job: discover → consider fit → buy.
Secondary: track orders, save favourites, ask the AI stylist.

## Surface & mode
Operate (shopping utility) with Persuade moments (home hero). HIG/Material
conformance governs structure; brand lives in tint, type, imagery, and detail.

## Visual world (inherited from the web brand — do not reinvent)
- Palette: ink `#121212`, ivory ground `#f7f5f3`, white surfaces, sand hairline
  `#e6e2dd`, one interactive tint sand-700 `#7e6248`, signal-sale `#a3312a`.
  **Light theme only for v1** (dark deferred).
- Type: Jost (display, tracked) + Inter (UI/body). Wordmark "AYVANA" + four-point
  spark device.
- "Cut, don't round": radius 0 default, 2px controls, 4px cards/buttons, pill
  only for avatars, dots, and the wishlist disc.
- Native: real tab bar (SF Symbols on iOS, top-docked on iPad; Material bottom
  bar on Android), safe areas, swipeable product gallery, grouped-inset settings.

## Built scenarios
Home, Browse (filter + responsive grid), Product (gallery/size/add-to-bag),
persistent Bag & Wishlist, guest Checkout → real order, Orders, AI stylist chat,
local Sign-in, Settings (delivery address, size profile, preferences).

## Deliberate constraints / what needs real assets (replace before shipping)
- **Product imagery is placeholder.** The seed catalog's images are mapped to
  generic stock photos that do **not** depict abayas/modest fashion and in places
  contradict the product. **Real abaya product photography (per vendor/SKU) is a
  required client asset** and must replace the stock pool in
  `apps/customer/app/api/mobile/_images.ts` (and ideally the seed data).
- **Auth & payment are stand-ins.** Sign-in is a local on-device account and
  checkout is cash-on-delivery, because Clerk and Stripe keys are absent in this
  environment. Real auth/card payment are wired on the web and need keys here.
- **iOS persistence falls back to in-memory.** Bag / wishlist / account persist
  via `src/lib/storage.ts`, which uses AsyncStorage when available and otherwise
  degrades to in-memory for the session (so a missing native module can never
  crash the app). AsyncStorage autolinks correctly on **Android** (real
  persistence), but on **iOS** its RN-community TurboModule is not registered in
  the generated `RCTModuleProviders.mm` under the from-source build we use to
  avoid the flaky Hermes/React-Core Maven downloads — so iOS state resets on app
  restart. The spec (`rnasyncstorageJSI.h`) is generated and the pod is
  autolinked, but a direct codegen regen does not add it to the provider map;
  the real fix is a prebuilt-React-Native build (which needs reliable access to
  the ~94 MB React-Core + Hermes Maven artifacts) or resolving why the provider
  map omits this autolinked TurboModule. Invisible unless you restart the app.
- **Known craft follow-ups:** give the size-system picker a native segmented
  control (currently cut bordered tiles); the benign RN "onAnimatedValueUpdate"
  LogBox warnings are harmless. (Icon consistency is done — content icons now
  render as SF Symbols on iOS / vector icons on Android via `components/ui/Sym`.)
