import * as fs from "node:fs";
import { PDFDocument } from "pdf-lib";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.log("Usage: check_fillable_fields.ts [input.pdf]");
    process.exit(1);
  }

  const pdfPath = args[0];
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  if (fields.length > 0) {
    console.log("This PDF has fillable form fields");
  } else {
    console.log(
      "This PDF does not have fillable form fields; you will need to visually determine where to enter data"
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
