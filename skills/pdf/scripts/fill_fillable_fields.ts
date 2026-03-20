import * as fs from "node:fs";
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
} from "pdf-lib";
import { getFieldInfo } from "./extract_form_field_info";

interface FieldValue {
  field_id: string;
  page: number;
  value?: string;
  [key: string]: unknown;
}

interface FieldInfo {
  field_id: string;
  type: string;
  page?: number;
  checked_value?: string;
  unchecked_value?: string;
  radio_options?: Array<{ value: string; rect: number[] | null }>;
  choice_options?: Array<{ value: string; text: string }>;
  [key: string]: unknown;
}

function validationErrorForFieldValue(
  fieldInfo: FieldInfo,
  fieldValue: string
): string | null {
  const fieldType = fieldInfo.type;
  const fieldId = fieldInfo.field_id;

  if (fieldType === "checkbox") {
    const checkedVal = fieldInfo.checked_value;
    const uncheckedVal = fieldInfo.unchecked_value;
    if (fieldValue !== checkedVal && fieldValue !== uncheckedVal) {
      return `ERROR: Invalid value "${fieldValue}" for checkbox field "${fieldId}". The checked value is "${checkedVal}" and the unchecked value is "${uncheckedVal}"`;
    }
  } else if (fieldType === "radio_group") {
    const optionValues = (fieldInfo.radio_options || []).map((opt) => opt.value);
    if (!optionValues.includes(fieldValue)) {
      return `ERROR: Invalid value "${fieldValue}" for radio group field "${fieldId}". Valid values are: ${JSON.stringify(optionValues)}`;
    }
  } else if (fieldType === "choice") {
    const choiceValues = (fieldInfo.choice_options || []).map((opt) => opt.value);
    if (!choiceValues.includes(fieldValue)) {
      return `ERROR: Invalid value "${fieldValue}" for choice field "${fieldId}". Valid values are: ${JSON.stringify(choiceValues)}`;
    }
  }

  return null;
}

async function fillPdfFields(
  inputPdfPath: string,
  fieldsJsonPath: string,
  outputPdfPath: string
): Promise<void> {
  const fieldsData: FieldValue[] = JSON.parse(
    fs.readFileSync(fieldsJsonPath, "utf-8")
  );

  // Build a map of field values by page
  const fieldsByPage: Record<number, Record<string, string>> = {};
  for (const field of fieldsData) {
    if (field.value !== undefined) {
      const page = field.page;
      if (!fieldsByPage[page]) {
        fieldsByPage[page] = {};
      }
      fieldsByPage[page][field.field_id] = field.value;
    }
  }

  const pdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Validate fields
  const fieldInfo = await getFieldInfo(pdfDoc);
  const fieldsByIds: Record<string, FieldInfo> = {};
  for (const f of fieldInfo) {
    fieldsByIds[f.field_id] = f;
  }

  let hasError = false;
  for (const field of fieldsData) {
    const existingField = fieldsByIds[field.field_id];
    if (!existingField) {
      hasError = true;
      console.log(`ERROR: \`${field.field_id}\` is not a valid field ID`);
    } else if (field.page !== existingField.page) {
      hasError = true;
      console.log(
        `ERROR: Incorrect page number for \`${field.field_id}\` (got ${field.page}, expected ${existingField.page})`
      );
    } else {
      if (field.value !== undefined) {
        const err = validationErrorForFieldValue(existingField, field.value);
        if (err) {
          console.log(err);
          hasError = true;
        }
      }
    }
  }

  if (hasError) {
    process.exit(1);
  }

  // Fill the form fields
  // Reload the PDF for a fresh writer
  const pdfDocWriter = await PDFDocument.load(pdfBytes);
  const form = pdfDocWriter.getForm();

  for (const field of fieldsData) {
    if (field.value === undefined) continue;
    const fieldId = field.field_id;
    const value = field.value;

    try {
      const pdfField = form.getField(fieldId);
      if (pdfField instanceof PDFTextField) {
        pdfField.setText(value);
      } else if (pdfField instanceof PDFCheckBox) {
        if (value === "/Off" || value === "Off") {
          pdfField.uncheck();
        } else {
          pdfField.check();
        }
      } else if (pdfField instanceof PDFDropdown) {
        pdfField.select(value);
      } else if (pdfField instanceof PDFRadioGroup) {
        pdfField.select(value);
      }
    } catch (err) {
      console.error(`Warning: Could not set field "${fieldId}": ${err}`);
    }
  }

  // Mark form as needing appearances update
  form.updateFieldAppearances();

  const outputBytes = await pdfDocWriter.save();
  fs.writeFileSync(outputPdfPath, outputBytes);
  console.log(`Filled PDF saved to ${outputPdfPath}`);
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
  if (args.length !== 3) {
    console.log(
      "Usage: fill_fillable_fields.ts [input pdf] [field_values.json] [output pdf]"
    );
    process.exit(1);
  }
  const inputPdf = args[0];
  const fieldsJson = args[1];
  const outputPdf = args[2];
  fillPdfFields(inputPdf, fieldsJson, outputPdf).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
