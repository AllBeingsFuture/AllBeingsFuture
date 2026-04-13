import * as fs from "node:fs";
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFPage, PDFWidgetAnnotation } from "pdf-lib";

interface FieldInfo {
  field_id: string;
  type: string;
  page?: number;
  rect?: number[];
  checked_value?: string;
  unchecked_value?: string;
  choice_options?: Array<{ value: string; text: string }>;
  radio_options?: Array<{ value: string; rect: number[] | null }>;
}

function getWidgetRect(widget: PDFWidgetAnnotation): number[] | null {
  try {
    const rect = widget.getRectangle();
    return [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
  } catch {
    return null;
  }
}

function getWidgetPage(widget: PDFWidgetAnnotation, pages: PDFPage[]): number | null {
  const pageRef = widget.P();
  if (pageRef) {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref === pageRef) {
        return i + 1;
      }
    }
  }
  // Fallback: search all pages for this widget annotation
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.Annots();
    if (annots) {
      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        if (annotRef === widget.ref) {
          return i + 1;
        }
      }
    }
  }
  return null;
}

export async function getFieldInfo(pdfDoc: PDFDocument): Promise<FieldInfo[]> {
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const pages = pdfDoc.getPages();

  const fieldInfoList: FieldInfo[] = [];

  for (const field of fields) {
    const fieldName = field.getName();
    const widgets = field.acroField.getWidgets();

    if (field instanceof PDFTextField) {
      if (widgets.length > 0) {
        const widget = widgets[0];
        const page = getWidgetPage(widget, pages);
        const rect = getWidgetRect(widget);
        const info: FieldInfo = {
          field_id: fieldName,
          type: "text",
        };
        if (page !== null) info.page = page;
        if (rect !== null) info.rect = rect;
        fieldInfoList.push(info);
      }
    } else if (field instanceof PDFCheckBox) {
      if (widgets.length > 0) {
        const widget = widgets[0];
        const page = getWidgetPage(widget, pages);
        const rect = getWidgetRect(widget);

        // Get the on value from the widget's appearance states
        let checkedValue = "/Yes";
        let uncheckedValue = "/Off";
        try {
          const ap = widget.getAppearances();
          if (ap?.normal) {
            const normalDict = ap.normal;
            if (normalDict instanceof Map) {
              for (const key of normalDict.keys()) {
                if (key !== "/Off" && key !== "Off") {
                  checkedValue = key.startsWith("/") ? key : `/${key}`;
                }
              }
            }
          }
        } catch {
          // Use defaults
        }

        const info: FieldInfo = {
          field_id: fieldName,
          type: "checkbox",
          checked_value: checkedValue,
          unchecked_value: uncheckedValue,
        };
        if (page !== null) info.page = page;
        if (rect !== null) info.rect = rect;
        fieldInfoList.push(info);
      }
    } else if (field instanceof PDFDropdown) {
      if (widgets.length > 0) {
        const widget = widgets[0];
        const page = getWidgetPage(widget, pages);
        const rect = getWidgetRect(widget);

        const options = field.getOptions();
        const info: FieldInfo = {
          field_id: fieldName,
          type: "choice",
          choice_options: options.map((opt) => ({ value: opt, text: opt })),
        };
        if (page !== null) info.page = page;
        if (rect !== null) info.rect = rect;
        fieldInfoList.push(info);
      }
    } else if (field instanceof PDFRadioGroup) {
      const radioOptions: Array<{ value: string; rect: number[] | null }> = [];
      let radioPage: number | null = null;

      const options = field.getOptions();

      for (let wi = 0; wi < widgets.length; wi++) {
        const widget = widgets[wi];
        const page = getWidgetPage(widget, pages);
        if (radioPage === null && page !== null) radioPage = page;
        const rect = getWidgetRect(widget);
        const value = wi < options.length ? options[wi] : `option_${wi}`;
        radioOptions.push({ value, rect });
      }

      const info: FieldInfo = {
        field_id: fieldName,
        type: "radio_group",
        radio_options: radioOptions,
      };
      if (radioPage !== null) info.page = radioPage;
      fieldInfoList.push(info);
    } else {
      // Unknown field type
      if (widgets.length > 0) {
        const widget = widgets[0];
        const page = getWidgetPage(widget, pages);
        const rect = getWidgetRect(widget);
        const info: FieldInfo = {
          field_id: fieldName,
          type: "unknown",
        };
        if (page !== null) info.page = page;
        if (rect !== null) info.rect = rect;
        fieldInfoList.push(info);
      }
    }
  }

  // Sort by page, then by position (top-to-bottom, left-to-right)
  fieldInfoList.sort((a, b) => {
    const pageA = a.page ?? 0;
    const pageB = b.page ?? 0;
    if (pageA !== pageB) return pageA - pageB;

    let rectA: number[];
    let rectB: number[];

    if (a.radio_options && a.radio_options.length > 0) {
      rectA = a.radio_options[0].rect || [0, 0, 0, 0];
    } else {
      rectA = a.rect || [0, 0, 0, 0];
    }

    if (b.radio_options && b.radio_options.length > 0) {
      rectB = b.radio_options[0].rect || [0, 0, 0, 0];
    } else {
      rectB = b.rect || [0, 0, 0, 0];
    }

    // Sort by -y (top first in PDF coords), then x
    const adjustedA = [-rectA[1], rectA[0]];
    const adjustedB = [-rectB[1], rectB[0]];

    if (adjustedA[0] !== adjustedB[0]) return adjustedA[0] - adjustedB[0];
    return adjustedA[1] - adjustedB[1];
  });

  return fieldInfoList;
}

export async function writeFieldInfo(
  pdfPath: string,
  jsonOutputPath: string
): Promise<void> {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const fieldInfo = await getFieldInfo(pdfDoc);
  fs.writeFileSync(jsonOutputPath, JSON.stringify(fieldInfo, null, 2));
  console.log(`Wrote ${fieldInfo.length} fields to ${jsonOutputPath}`);
}

function isMainModule(): boolean {
  try {
    return require.main === module;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.log("Usage: extract_form_field_info.ts [input pdf] [output json]");
    process.exit(1);
  }
  writeFieldInfo(args[0], args[1]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
