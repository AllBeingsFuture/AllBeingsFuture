import * as fs from "node:fs";

interface FormField {
  description: string;
  page_number: number;
  label_bounding_box: [number, number, number, number];
  entry_bounding_box: [number, number, number, number];
  entry_text?: {
    font_size?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface FieldsData {
  form_fields: FormField[];
}

interface RectAndField {
  rect: [number, number, number, number];
  rect_type: "label" | "entry";
  field: FormField;
}

function formatRect(rect: number[]): string {
  return `[${rect.join(", ")}]`;
}

function rectsIntersect(
  r1: [number, number, number, number],
  r2: [number, number, number, number]
): boolean {
  const disjointHorizontal = r1[0] >= r2[2] || r1[2] <= r2[0];
  const disjointVertical = r1[1] >= r2[3] || r1[3] <= r2[1];
  return !(disjointHorizontal || disjointVertical);
}

export function getBoundingBoxMessages(fieldsJsonContent: string): string[] {
  const messages: string[] = [];
  const fields: FieldsData = JSON.parse(fieldsJsonContent);
  messages.push(`Read ${fields.form_fields.length} fields`);

  const rectsAndFields: RectAndField[] = [];
  for (const f of fields.form_fields) {
    rectsAndFields.push({ rect: f.label_bounding_box, rect_type: "label", field: f });
    rectsAndFields.push({ rect: f.entry_bounding_box, rect_type: "entry", field: f });
  }

  let hasError = false;
  for (let i = 0; i < rectsAndFields.length; i++) {
    const ri = rectsAndFields[i];
    for (let j = i + 1; j < rectsAndFields.length; j++) {
      const rj = rectsAndFields[j];
      if (
        ri.field.page_number === rj.field.page_number &&
        rectsIntersect(ri.rect, rj.rect)
      ) {
        hasError = true;
        if (ri.field === rj.field) {
          messages.push(
            `FAILURE: intersection between label and entry bounding boxes for \`${ri.field.description}\` (${formatRect(ri.rect)}, ${formatRect(rj.rect)})`
          );
        } else {
          messages.push(
            `FAILURE: intersection between ${ri.rect_type} bounding box for \`${ri.field.description}\` (${formatRect(ri.rect)}) and ${rj.rect_type} bounding box for \`${rj.field.description}\` (${formatRect(rj.rect)})`
          );
        }
        if (messages.length >= 20) {
          messages.push("Aborting further checks; fix bounding boxes and try again");
          return messages;
        }
      }
    }
    if (ri.rect_type === "entry") {
      if (ri.field.entry_text !== undefined) {
        const fontSize = ri.field.entry_text.font_size ?? 14;
        const entryHeight = ri.rect[3] - ri.rect[1];
        if (entryHeight < fontSize) {
          hasError = true;
          messages.push(
            `FAILURE: entry bounding box height (${entryHeight}) for \`${ri.field.description}\` is too short for the text content (font size: ${fontSize}). Increase the box height or decrease the font size.`
          );
          if (messages.length >= 20) {
            messages.push("Aborting further checks; fix bounding boxes and try again");
            return messages;
          }
        }
      }
    }
  }

  if (!hasError) {
    messages.push("SUCCESS: All bounding boxes are valid");
  }
  return messages;
}

// CLI entry point
function isMainModule(): boolean {
  try {
    return require.main === module;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.log("Usage: check_bounding_boxes.ts [fields.json]");
    process.exit(1);
  }
  const content = fs.readFileSync(args[0], "utf-8");
  const messages = getBoundingBoxMessages(content);
  for (const msg of messages) {
    console.log(msg);
  }
}
