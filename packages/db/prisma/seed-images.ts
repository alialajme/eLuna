// Idempotent — attaches real online photos (loremflickr, keyword-matched) to
// every product and material so the storefront + catalogs show pictures.
// loremflickr returns real Flickr photos for the given keywords; `lock` makes
// each URL deterministic. Rendered via plain <img>, so no domain allowlist needed.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const img = (kw: string, lock: number, w = 600, h = 800) =>
  `https://loremflickr.com/${w}/${h}/${kw}?lock=${lock}`;

async function main() {
  console.log("🖼️  Attaching online photos to products + materials…");

  const products = await prisma.product.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  let n = 1;
  for (const p of products) {
    const images = [
      img("abaya,fashion,dress", n),
      img("modest,fashion,woman", n + 100),
      img("fashion,fabric,dress", n + 200),
    ];
    await prisma.product.update({ where: { id: p.id }, data: { aiImages: images } });
    n++;
  }
  console.log(`✅ ${products.length} products imaged`);

  const materials = await prisma.material.findMany({ select: { id: true, materialType: true }, orderBy: { createdAt: "asc" } });
  let m = 1;
  for (const mat of materials) {
    const kw =
      mat.materialType === "trim" ? "trim,sewing,button" :
      mat.materialType === "thread" ? "thread,spool,sewing" :
      mat.materialType === "lining" ? "silk,fabric,textile" :
      "fabric,textile,cloth";
    await prisma.material.update({ where: { id: mat.id }, data: { images: [img(kw, m + 300, 600, 600), img(kw, m + 400, 600, 600)] } });
    m++;
  }
  console.log(`✅ ${materials.length} materials imaged`);
  console.log("🖼️  Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
