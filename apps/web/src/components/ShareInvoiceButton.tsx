import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { InvoiceDocument, type InvoiceBranding, type InvoiceSaleDetail } from "./InvoiceDocument";

// wa.me needs a country-code-prefixed, digits-only number. Indian mobiles are stored as plain
// 10-digit numbers (sometimes with a leading 0 or +91) — normalize to the 91XXXXXXXXXX shape.
// There's no WhatsApp Business API integration here (that needs a paid, verified account), so
// this opens WhatsApp Web/app pre-filled on whichever device the cashier is using, ready to hit
// Send — not an automated send from the business's own number.
function buildWhatsAppLink(mobile: string, message: string): string | null {
  let digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

interface ShareInvoiceButtonProps {
  saleId: string;
  invoiceNumber: string;
  customerName: string;
  customerMobile?: string | null;
  totalAmount: string;
  // Pass the full sale detail when it's already in hand (e.g. the checkout response) to skip
  // the GET /sales/:id round trip; otherwise this fetches it lazily on first click.
  sale?: InvoiceSaleDetail;
  onNotice?: (message: string) => void;
  className?: string;
  children?: React.ReactNode;
}

// Renders the invoice off-screen (with logo/signature) and captures it to a PNG via html2canvas,
// then hands it to the OS share sheet via the Web Share API's file support, so whoever clicks it
// can pick WhatsApp and send the actual invoice photo — not just a text summary. Where file
// sharing isn't supported (most desktop browsers), the image downloads instead and a WhatsApp
// chat opens with the customer so it can be attached by hand.
export function ShareInvoiceButton({
  saleId,
  invoiceNumber,
  customerName,
  customerMobile,
  totalAmount,
  sale: preloadedSale,
  onNotice,
  className = "btn btn-success",
  children = "💬 Share on WhatsApp",
}: ShareInvoiceButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [fetchedSale, setFetchedSale] = useState<InvoiceSaleDetail | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const sale = preloadedSale ?? fetchedSale;

  const { data: branding } = useQuery({
    queryKey: ["settings", "branding"],
    queryFn: async () => (await api.get<{ data: InvoiceBranding }>("/settings/branding")).data.data,
  });

  const canShare = Boolean(customerMobile && branding?.whatsappNumber);

  async function handleShare() {
    if (!customerMobile || !branding?.whatsappNumber) return;
    setSharing(true);
    try {
      let detail = sale;
      if (!detail) {
        detail = (await api.get<{ data: InvoiceSaleDetail }>(`/sales/${saleId}`)).data.data;
        setFetchedSale(detail);
        // Wait for the hidden InvoiceDocument to actually paint the newly-fetched detail before
        // html2canvas reads it off the DOM — a plain setState doesn't guarantee that by itself.
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }

      const canvas = await html2canvas(captureRef.current!, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not render the invoice image");

      const fileName = `Invoice-${invoiceNumber}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const message = `Hi ${customerName}, thank you for shopping at ${branding.businessName}! Invoice ${invoiceNumber}, total ₹${totalAmount}.`;

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text: message });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      onNotice?.(`"${fileName}" downloaded. Attach it in the WhatsApp chat that's about to open.`);
      const waLink = buildWhatsAppLink(customerMobile, message);
      if (waLink) window.open(waLink, "_blank");
    } catch (err) {
      // A user cancelling the native share sheet also lands here (AbortError) — not a real
      // failure, so don't surface it as one.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        onNotice?.("Couldn't prepare the invoice image for sharing.");
      }
    } finally {
      setSharing(false);
    }
  }

  if (!canShare) return null;

  return (
    <>
      <button type="button" className={className} disabled={sharing} onClick={handleShare}>
        {sharing ? "Preparing..." : children}
      </button>
      {/* Off-screen — never visible, but must be actually laid out in the DOM for html2canvas to
          read it, so this can't be display:none. */}
      <div style={{ position: "fixed", top: 0, left: -10_000, width: 850, background: "#fff" }}>
        <div ref={captureRef} className="p-4">
          {sale && branding && <InvoiceDocument sale={sale} branding={branding} forImageCapture />}
        </div>
      </div>
    </>
  );
}
