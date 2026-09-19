/**
 * PDF generation for quotations and shopping lists
 * Uses jsPDF for client-side PDF generation, no server needed.
 *
 * Brand Studio integration: Both functions accept an optional
 * `branding` parameter (ResolvedBranding). When provided, the
 * branding layer overrides the default FRELUX branding with the
 * user's resolved brand identity. When omitted, behavior is
 * identical to the original implementation.
 */
// jsPDF is dynamically imported in each function to avoid bundling html2canvas (~200KB) until needed
import QRCode from "qrcode";
import type {
  DbProjectQuotation,
  DbProjectShoppingItem,
  DbContractorProject,
} from "@/types/database";
import type { ResolvedBranding } from "@/lib/brand-studio";
import {
  applyJspdfWatermark,
  applyJspdfHeader,
  applyJspdfFooter,
} from "@/lib/pdf-branding";

// ============================================================
// QUOTATION PDF
// ============================================================

export async function generateQuotationPDF(
  project: DbContractorProject,
  quotation: DbProjectQuotation,
  branding?: ResolvedBranding,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  let y = margin;

  // ─── WATERMARK (branding layer) ───
  if (branding?.watermark?.enabled) {
    applyJspdfWatermark(doc, branding, pageWidth, pageHeight);
  }

  // ─── HEADER ───
  if (branding) {
    // Use branding layer header
    y = applyJspdfHeader(
      doc,
      branding,
      branding.templateConfig ?? null,
      pageWidth,
      margin,
      y,
    );
  } else {
    // Original behavior, use quotation company fields
    if (quotation.company_name) {
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(quotation.company_name, margin, y + 5);
    }

    if (quotation.company_logo_url) {
      try {
        doc.addImage(
          quotation.company_logo_url,
          "PNG",
          pageWidth - margin - 30,
          y,
          30,
          15,
        );
      } catch {
        // Logo may fail to load, skip
      }
    }

    y += 12;

    // Company details
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    if (quotation.company_address)
      doc.text(quotation.company_address, margin, y);
    if (quotation.company_phone)
      doc.text(`Tel: ${quotation.company_phone}`, margin, y + 4);
    if (quotation.company_email)
      doc.text(`Email: ${quotation.company_email}`, margin, y + 8);

    y += 18;
  }

  // ─── QUOTATION TITLE ───
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", pageWidth / 2, y, { align: "center" });

  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Quotation No: ${quotation.quotation_number}`, margin, y);
  doc.text(
    `Date: ${new Date(quotation.created_at).toLocaleDateString("en-GB")}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );

  y += 8;

  // ─── CLIENT DETAILS ───
  doc.setFont("helvetica", "bold");
  doc.text("BILLED TO:", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  if (project.client_name) {
    doc.text(project.client_name, margin, y);
    y += 5;
  }
  if (project.client_phone) {
    doc.text(project.client_phone, margin, y);
    y += 5;
  }
  if (project.client_email) {
    doc.text(project.client_email, margin, y);
    y += 5;
  }
  if (project.client_address) {
    doc.text(project.client_address, margin, y);
    y += 5;
  }

  y += 5;

  // ─── PROJECT INFO ───
  doc.setFont("helvetica", "bold");
  doc.text("PROJECT:", margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.text(project.name, margin, y);
  y += 5;
  doc.text(`Type: ${project.project_type.replace(/_/g, " ")}`, margin, y);
  y += 5;
  if (project.description) {
    const descLines = doc.splitTextToSize(
      project.description,
      pageWidth - 2 * margin,
    );
    doc.text(descLines, margin, y);
    y += descLines.length * 5;
  }

  y += 5;

  // ─── COST BREAKDOWN TABLE ───
  // Use branding accent color if available, otherwise original purple
  const accentColor = branding?.primaryColor ?? "#6B21A8";
  const hexToRgb = (hex: string): [number, number, number] => {
    const cleaned = hex.replace("#", "");
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  };
  const [r, g, b] = hexToRgb(accentColor);
  doc.setFillColor(r, g, b);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("COST BREAKDOWN", margin + 2, y + 5);
  doc.text("AMOUNT", pageWidth - margin - 2, y + 5, { align: "right" });
  y += 10;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  const rows: Array<[string, number]> = [
    ["Materials", quotation.material_cost],
    ["Labour", quotation.labour_cost],
  ];

  if (quotation.transport_cost > 0)
    rows.push(["Transport", quotation.transport_cost]);
  if (quotation.misc_cost > 0)
    rows.push(["Miscellaneous", quotation.misc_cost]);
  if (quotation.markup_amount > 0)
    rows.push([
      `Markup (${quotation.markup_percentage}%)`,
      quotation.markup_amount,
    ]);
  if (quotation.profit_amount > 0)
    rows.push([
      `Profit (${quotation.profit_percentage}%)`,
      quotation.profit_amount,
    ]);
  if (quotation.tax_amount > 0)
    rows.push([`Tax (${quotation.tax_percentage}%)`, quotation.tax_amount]);

  for (const [label, amount] of rows) {
    doc.text(label, margin + 2, y);
    doc.text(
      `${quotation.currency_symbol}${amount.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      pageWidth - margin - 2,
      y,
      { align: "right" },
    );
    y += 6;
  }

  // Grand total
  y += 2;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, pageWidth - 2 * margin, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("GRAND TOTAL", margin + 2, y + 7);
  doc.text(
    `${quotation.currency_symbol}${quotation.grand_total.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    pageWidth - margin - 2,
    y + 7,
    { align: "right" },
  );
  y += 18;

  // ─── TERMS ───
  if (quotation.terms_conditions) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TERMS & CONDITIONS", margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const termsLines = doc.splitTextToSize(
      quotation.terms_conditions,
      pageWidth - 2 * margin,
    );
    doc.text(termsLines, margin, y);
    y += termsLines.length * 4 + 5;
  }

  // ─── PAYMENT & VALIDITY ───
  if (y > pageHeight - 60) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  if (quotation.payment_terms) {
    doc.text(`Payment Terms: ${quotation.payment_terms}`, margin, y);
    y += 5;
  }
  doc.text(
    `Validity: ${quotation.validity_days} days from issue date`,
    margin,
    y,
  );
  if (quotation.timeline_days) {
    y += 5;
    doc.text(`Estimated Timeline: ${quotation.timeline_days} days`, margin, y);
  }
  y += 10;

  // ─── QR CODE ───
  try {
    const qrData = JSON.stringify({
      qn: quotation.quotation_number,
      total: quotation.grand_total,
      cur: quotation.currency,
    });
    const qrCanvas = await QRCode.toCanvas(qrData, { width: 150, margin: 1 });
    const qrDataUrl = qrCanvas.toDataURL("image/png");
    doc.addImage(qrDataUrl, "PNG", margin, y, 25, 25);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("Scan to verify quotation", margin + 28, y + 10);
  } catch {
    // QR generation may fail, skip
  }

  // ─── SIGNATURE AREA ───
  y += 35;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + 70, y);
  doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
  doc.setFontSize(8);
  doc.text("Authorized Signature", margin, y + 4);
  doc.text("Client Acceptance", pageWidth - margin - 70 + 35, y + 4, {
    align: "center",
  });

  // ─── FOOTER ───
  if (branding) {
    applyJspdfFooter(doc, branding, pageWidth, pageHeight, margin);
  } else {
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "This quotation was generated by FRELUX PROJECT CALC: Smart Construction Estimation",
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" },
    );
  }

  doc.save(`Quotation_${quotation.quotation_number}.pdf`);
}

// ============================================================
// SHOPPING LIST PDF
// ============================================================

export async function generateShoppingListPDF(
  project: DbContractorProject,
  items: DbProjectShoppingItem[],
  branding?: ResolvedBranding,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  let y = margin;

  // ─── WATERMARK (branding layer) ───
  if (branding?.watermark?.enabled) {
    applyJspdfWatermark(doc, branding, pageWidth, pageHeight);
  }

  // ─── HEADER ───
  if (branding) {
    y = applyJspdfHeader(
      doc,
      branding,
      branding.templateConfig ?? null,
      pageWidth,
      margin,
      y,
    );
  }

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("MATERIAL SHOPPING LIST", pageWidth / 2, y + 5, { align: "center" });
  y += 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Project: ${project.name}`, margin, y);
  doc.text(
    `Date: ${new Date().toLocaleDateString("en-GB")}`,
    pageWidth - margin,
    y,
    { align: "right" },
  );
  y += 8;

  // ─── TABLE ───
  const colWidths = [25, 70, 25, 25, 25]; // category, name, qty, unit price, total
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  // Header row, use branding color if available
  const accentColor = branding?.primaryColor ?? "#6B21A8";
  const hexToRgb = (hex: string): [number, number, number] => {
    const cleaned = hex.replace("#", "");
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  };
  const [r, g, b] = hexToRgb(accentColor);
  doc.setFillColor(r, g, b);
  doc.rect(margin, y, tableWidth, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);

  const headers = ["Category", "Item", "Qty", "Unit Price", "Total"];
  let x = margin;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 2, y + 5);
    x += colWidths[i];
  }
  y += 10;

  // Items
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  // Group by category
  const categories = [...new Set(items.map((i) => i.category))];
  let grandTotal = 0;

  for (const category of categories) {
    const categoryItems = items.filter((i) => i.category === category);
    let categoryTotal = 0;

    for (const item of categoryItems) {
      if (y > 280) {
        doc.addPage();
        y = margin;
      }

      x = margin;
      doc.text(category.replace(/_/g, " "), x + 2, y);
      x += colWidths[0];
      doc.text(item.name, x + 2, y);
      x += colWidths[1];
      doc.text(String(item.quantity), x + 2, y);
      x += colWidths[2];
      doc.text(
        `${project.currency_symbol}${item.estimated_price.toLocaleString("en-NG")}`,
        x + 2,
        y,
      );
      x += colWidths[3];
      doc.text(
        `${project.currency_symbol}${item.total_price.toLocaleString("en-NG")}`,
        x + 2,
        y,
      );

      categoryTotal += item.total_price;
      y += 5;

      // Light separator
      doc.setDrawColor(240, 240, 240);
      doc.line(margin, y, margin + tableWidth, y);
      y += 1;
    }

    // Category subtotal
    if (y > 280) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.text(`${category.replace(/_/g, " ")} Subtotal:`, margin + 2, y);
    doc.text(
      `${project.currency_symbol}${categoryTotal.toLocaleString("en-NG")}`,
      margin + tableWidth,
      y,
      { align: "right" },
    );
    y += 8;
    grandTotal += categoryTotal;
    doc.setFont("helvetica", "normal");
  }

  // Grand total
  y += 5;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, tableWidth, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("GRAND TOTAL", margin + 2, y + 7);
  doc.text(
    `${project.currency_symbol}${grandTotal.toLocaleString("en-NG")}`,
    margin + tableWidth,
    y + 7,
    { align: "right" },
  );

  // ─── FOOTER ───
  if (branding) {
    applyJspdfFooter(doc, branding, pageWidth, pageHeight, margin);
  } else {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Generated by FRELUX PROJECT CALC: Smart Construction Estimation",
      pageWidth / 2,
      290,
      { align: "center" },
    );
  }

  doc.save(`ShoppingList_${project.name.replace(/\s+/g, "_")}.pdf`);
}
