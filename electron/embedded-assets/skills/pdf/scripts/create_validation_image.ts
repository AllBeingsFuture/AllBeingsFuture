import * as fs from "node:fs";
import sharp from "sharp";

interface FormField {
  page_number: number;
  entry_bounding_box: [number, number, number, number];
  label_bounding_box: [number, number, number, number];
  [key: string]: unknown;
}

interface FieldsData {
  form_fields: FormField[];
}

async function createValidationImage(
  pageNumber: number,
  fieldsJsonPath: string,
  inputPath: string,
  outputPath: string
): Promise<void> {
  const data: FieldsData = JSON.parse(fs.readFileSync(fieldsJsonPath, "utf-8"));

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const imgWidth = metadata.width!;
  const imgHeight = metadata.height!;

  // Build SVG overlay with bounding box rectangles
  const svgRects: string[] = [];
  let numBoxes = 0;

  for (const field of data.form_fields) {
    if (field.page_number === pageNumber) {
      const entryBox = field.entry_bounding_box;
      const labelBox = field.label_bounding_box;

      // Entry box in red
      svgRects.push(
        `<rect x="${entryBox[0]}" y="${entryBox[1]}" ` +
          `width="${entryBox[2] - entryBox[0]}" height="${entryBox[3] - entryBox[1]}" ` +
          `fill="none" stroke="red" stroke-width="2"/>`
      );

      // Label box in blue
      svgRects.push(
        `<rect x="${labelBox[0]}" y="${labelBox[1]}" ` +
          `width="${labelBox[2] - labelBox[0]}" height="${labelBox[3] - labelBox[1]}" ` +
          `fill="none" stroke="blue" stroke-width="2"/>`
      );

      numBoxes += 2;
    }
  }

  const svgOverlay = Buffer.from(
    `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
      ${svgRects.join("\n      ")}
    </svg>`
  );

  await sharp(inputPath)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .toFile(outputPath);

  console.log(
    `Created validation image at ${outputPath} with ${numBoxes} bounding boxes`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    console.log(
      "Usage: create_validation_image.ts [page number] [fields.json file] [input image path] [output image path]"
    );
    process.exit(1);
  }
  const pageNumber = parseInt(args[0], 10);
  const fieldsJsonPath = args[1];
  const inputImagePath = args[2];
  const outputImagePath = args[3];
  await createValidationImage(pageNumber, fieldsJsonPath, inputImagePath, outputImagePath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
