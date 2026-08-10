import { LunaChatWidget } from "@e-luna/ui";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LunaChatWidget
        apiPath="/api/delivery-help"
        title="Delivery Help"
        greeting="Ask me where your order is, delivery timing, or how to return an item."
        agentType="LOGISTICS"
      />
    </>
  );
}
