import { ProductCard } from "./ProductCard";

type MiniProduct = {
  slug: string;
  title: string;
  price: number;
  imageUrl?: string;
  vendorName: string;
};

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  products?: MiniProduct[];
};

const PRODUCT_TOKEN_REGEX = /\[PRODUCT:([a-z0-9-]+)\]/g;

export function ChatMessage({ role, content, products = [] }: ChatMessageProps) {
  const isUser = role === "user";

  // Split content on [PRODUCT:slug] tokens
  const parts = content.split(PRODUCT_TOKEN_REGEX);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-ivory text-body-sm font-semibold">
          ◑
        </div>
      )}

      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 text-body-md ${
            isUser
              ? "rounded-br-sm bg-ink text-ivory"
              : "rounded-bl-sm bg-sand text-ink"
          }`}
        >
          {parts.map((part, i) => {
            // Even indices are text, odd indices are product slugs
            if (i % 2 === 0) {
              return (
                <span key={i} className="whitespace-pre-wrap">
                  {part}
                </span>
              );
            }
            const product = products.find((p) => p.slug === part);
            return product ? null : (
              <span key={i} className="text-gold underline">
                {part}
              </span>
            );
          })}
        </div>

        {/* Even indices = plain text; odd indices = product slug tokens.
            Found products: card renders below bubble, token invisible in text.
            Not found: slug renders as gold fallback text in bubble. */}
        {parts
          .filter((_, i) => i % 2 === 1)
          .map((slug, cardIndex) => {
            const product = products.find((p) => p.slug === slug);
            if (!product) return null;
            return (
              <div key={cardIndex} className="w-48">
                <a href={`/p/${product.slug}`} className="block">
                  <ProductCard
                    id={product.slug}
                    title={product.title}
                    price={product.price}
                    imageUrl={product.imageUrl}
                    vendorName={product.vendorName}
                  />
                </a>
              </div>
            );
          })}
      </div>
    </div>
  );
}
