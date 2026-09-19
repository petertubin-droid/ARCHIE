// =========================================================
// PDF Branding Layer, applies resolved branding to PDFs
//
// This is a reusable layer that wraps the existing PDF
// generation pipeline. It does NOT replace jsPDF or the
// HTML print quote system, it injects branding into them.
// =========================================================

import type { ResolvedBranding } from "@/lib/brand-studio";
import type { PdfWatermarkConfig, PdfTemplateConfig } from "@/types/database";

// ───────────────────────────────────────────────────────
// jsPDF helpers (for generateQuotationPDF / generateShoppingListPDF)
// ───────────────────────────────────────────────────────

/**
 * Apply a background watermark to a jsPDF document using the FRELUX logo
 * or a text-based watermark as fallback.
 * Must be called BEFORE content is drawn, or on a fresh page.
 */
export function applyJspdfWatermark(
  doc: import("jspdf").jsPDF,
  branding: ResolvedBranding,
  pageWidth: number,
  pageHeight: number,
): void {
  const wm = branding.watermark;
  if (!wm.enabled) return;

  try {
    // Calculate watermark dimensions
    const scale = Math.max(0.1, Math.min(1.0, wm.scale));
    const wmWidth = pageWidth * scale;
    const wmHeight = wmWidth * 0.4; // logos are typically wider than tall

    // Position
    let x = (pageWidth - wmWidth) / 2; // center default
    let y = (pageHeight - wmHeight) / 2;
    if (wm.position === "top-left") {
      x = 20;
      y = 20;
    } else if (wm.position === "top-right") {
      x = pageWidth - wmWidth - 20;
      y = 20;
    } else if (wm.position === "bottom-left") {
      x = 20;
      y = pageHeight - wmHeight - 20;
    }

    if (branding.logoUrl) {
      // Try to add the logo as a faded background image
      try {
        doc.saveGraphicsState();
        doc.setGState(doc.GState({ opacity: wm.opacity }));
        doc.addImage(
          branding.logoUrl,
          "PNG",
          x,
          y,
          wmWidth,
          wmHeight,
          undefined,
          "FAST",
        );
        doc.restoreGraphicsState();
      } catch {
        // Logo failed, fall back to text watermark
        applyTextWatermark(doc, branding, pageWidth, pageHeight, wm);
      }
    } else {
      applyTextWatermark(doc, branding, pageWidth, pageHeight, wm);
    }
  } catch {
    // Watermark failed entirely, don't break PDF generation
  }
}

function applyTextWatermark(
  doc: import("jspdf").jsPDF,
  branding: ResolvedBranding,
  pageWidth: number,
  pageHeight: number,
  wm: PdfWatermarkConfig,
): void {
  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: wm.opacity }));
  doc.setFontSize(60);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(branding.primaryColor);
  const text = branding.brandName.toUpperCase();
  if (wm.diagonal) {
    // Diagonal text watermark
    doc.text(text, pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 45,
    });
  } else {
    doc.text(text, pageWidth / 2, pageHeight / 2, { align: "center" });
  }
  doc.restoreGraphicsState();
}

/**
 * Apply branding header to a jsPDF document.
 * Returns the Y position after the header for content to begin.
 */
export function applyJspdfHeader(
  doc: import("jspdf").jsPDF,
  branding: ResolvedBranding,
  templateConfig: PdfTemplateConfig | null,
  pageWidth: number,
  margin: number,
  startY: number,
): number {
  let y = startY;
  const tc = templateConfig ?? {
    headerLayout: "logo-right",
    footerLayout: "default",
    contactPlacement: "header",
    accentBar: true,
    accentBarColor: branding.primaryColor,
  };

  // Accent bar
  if (tc.accentBar) {
    doc.setFillColor(tc.accentBarColor ?? branding.primaryColor);
    doc.rect(0, 0, pageWidth, 3, "F");
  }

  // Brand name
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(branding.primaryColor);

  if (tc.headerLayout === "logo-center") {
    if (branding.logoUrl) {
      try {
        doc.addImage(branding.logoUrl, "PNG", (pageWidth - 30) / 2, y, 30, 15);
      } catch {
        /* skip */
      }
    }
    doc.text(branding.brandName, pageWidth / 2, y + 20, { align: "center" });
    y += 25;
  } else if (tc.headerLayout === "logo-left") {
    if (branding.logoUrl) {
      try {
        doc.addImage(branding.logoUrl, "PNG", margin, y, 30, 15);
      } catch {
        /* skip */
      }
    }
    doc.text(branding.brandName, margin + (branding.logoUrl ? 35 : 0), y + 10);
    y += 18;
  } else if (tc.headerLayout === "text-only") {
    doc.text(branding.brandName, margin, y + 5);
    y += 12;
  } else {
    // logo-right (default)
    doc.text(branding.brandName, margin, y + 5);
    if (branding.logoUrl) {
      try {
        doc.addImage(
          branding.logoUrl,
          "PNG",
          pageWidth - margin - 30,
          y,
          30,
          15,
        );
      } catch {
        /* skip */
      }
    }
    y += 12;
  }

  // Tagline
  if (branding.tagline) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(branding.tagline, margin, y);
    y += 5;
  }

  // Contact info in header
  if (tc.contactPlacement === "header" || tc.contactPlacement === "both") {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    const contactParts: string[] = [];
    if (branding.phone) contactParts.push(`Tel: ${branding.phone}`);
    if (branding.email) contactParts.push(`Email: ${branding.email}`);
    if (branding.address) contactParts.push(branding.address);
    if (contactParts.length > 0) {
      doc.text(contactParts.join("  |  "), margin, y);
      y += 4;
    }
  }

  // Reset text color
  doc.setTextColor(0, 0, 0);
  y += 4;
  return y;
}

/**
 * Apply branded footer to a jsPDF document.
 */
export function applyJspdfFooter(
  doc: import("jspdf").jsPDF,
  branding: ResolvedBranding,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): void {
  const footerY = pageHeight - 8;
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);

  const footerText =
    branding.source === "frelux_default" || branding.source === "safe_fallback"
      ? `Generated by ${branding.brandName}, Smart Construction Estimation`
      : `Powered by FRELUX PROJECT CALC`;

  doc.text(footerText, pageWidth / 2, footerY, { align: "center" });

  if (branding.website) {
    doc.text(branding.website, pageWidth - margin, footerY, { align: "right" });
  }
}

// ───────────────────────────────────────────────────────
// HTML print quote branding helpers (for exportPdfQuote)
// ───────────────────────────────────────────────────────

/**
 * Generate HTML CSS for the watermark overlay in HTML-based PDFs.
 */
export function getHtmlWatermarkStyle(branding: ResolvedBranding): string {
  const wm = branding.watermark;
  if (!wm.enabled) return "";

  const opacity = Math.max(0.02, Math.min(0.3, wm.opacity));
  const scale = Math.max(10, Math.min(100, wm.scale * 100));
  const rotation = wm.diagonal
    ? "transform: translate(-50%, -50%) rotate(-45deg);"
    : "transform: translate(-50%, -50%);";

  if (branding.logoUrl) {
    return `
      .pdf-watermark {
        position: absolute;
        top: 50%;
        left: 50%;
        ${rotation}
        width: ${scale}%;
        opacity: ${opacity};
        z-index: 0;
        pointer-events: none;
      }
      .pdf-watermark img { width: 100%; height: auto; }
    `;
  }

  return `
    .pdf-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      ${rotation}
      font-size: 60px;
      font-weight: 900;
      color: ${branding.primaryColor};
      opacity: ${opacity};
      z-index: 0;
      pointer-events: none;
      white-space: nowrap;
    }
  `;
}

/**
 * Generate HTML for the watermark element.
 */
export function getHtmlWatermarkElement(branding: ResolvedBranding): string {
  const wm = branding.watermark;
  if (!wm.enabled) return "";

  if (branding.logoUrl) {
    return `<div class="pdf-watermark"><img src="${branding.logoUrl}" alt="watermark" /></div>`;
  }
  return `<div class="pdf-watermark">${escapeHtml(branding.brandName.toUpperCase())}</div>`;
}

/**
 * Generate branded header HTML for the HTML quote export.
 */
export function getHtmlBrandedHeader(branding: ResolvedBranding): string {
  const logoHtml = branding.logoUrl
    ? `<img src="${branding.logoUrl}" class="logo" alt="logo" />`
    : "";
  const contactParts: string[] = [];
  if (branding.address)
    contactParts.push(
      `<div class="company-info">${escapeHtml(branding.address)}</div>`,
    );
  if (branding.phone)
    contactParts.push(
      `<div class="company-info">Tel: ${escapeHtml(branding.phone)}</div>`,
    );
  if (branding.email)
    contactParts.push(
      `<div class="company-info">Email: ${escapeHtml(branding.email)}</div>`,
    );
  if (branding.whatsapp)
    contactParts.push(
      `<div class="company-info">WhatsApp: ${escapeHtml(branding.whatsapp)}</div>`,
    );
  if (branding.website)
    contactParts.push(
      `<div class="company-info">${escapeHtml(branding.website)}</div>`,
    );

  return `
    <div class="header" style="border-bottom: 2px solid ${branding.primaryColor};">
      <div class="company">
        ${logoHtml}
        <div class="company-name" style="color: ${branding.primaryColor};">${escapeHtml(branding.brandName)}</div>
        ${branding.tagline ? `<div class="company-info" style="font-style: italic;">${escapeHtml(branding.tagline)}</div>` : ""}
        ${contactParts.join("")}
      </div>
    </div>
  `;
}

/**
 * Generate branded footer HTML for the HTML quote export.
 */
export function getHtmlBrandedFooter(branding: ResolvedBranding): string {
  const isFrelux =
    branding.source === "frelux_default" || branding.source === "safe_fallback";
  const text = isFrelux
    ? `Generated by ${escapeHtml(branding.brandName)} · Smart Construction Estimation`
    : `Powered by FRELUX PROJECT CALC`;

  return `<div class="footer">${text}</div>`;
}

/**
 * Apply branding colors to the HTML quote CSS.
 */
export function getHtmlBrandedStyles(branding: ResolvedBranding): string {
  return `
    .invoice { position: relative; overflow: hidden; }
    .company-name { color: ${branding.primaryColor} !important; }
    .meta h1 { color: ${branding.primaryColor} !important; }
    .totals .row.grand { color: ${branding.primaryColor} !important; border-top-color: ${branding.primaryColor} !important; }
    ${getHtmlWatermarkStyle(branding)}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
